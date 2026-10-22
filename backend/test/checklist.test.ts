import { request as httpRequest } from "node:http";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import type { INestApplication } from "@nestjs/common";
import Ajv from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { parse as yaml } from "yaml";
import { createApplication } from "../src/app";
import { LOCAL, readConfig } from "../src/config";

const initialUrl = process.env.DATABASE_URL!;
assert.ok(
  ["127.0.0.1", "localhost"].includes(new URL(initialUrl).hostname),
  "Tests require local PostgreSQL",
);
const schema = `test_${randomUUID().replaceAll("-", "")}`;
const testUrl = new URL(initialUrl);
testUrl.searchParams.set("schema", schema);
const admin = new PrismaClient({ datasourceUrl: initialUrl });
const db = new PrismaClient({ datasourceUrl: testUrl.toString() });
const env = {
  ...process.env,
  NODE_ENV: "test",
  CHECKLIST_IDENTITY: "local",
  API_HOST: "127.0.0.1",
  API_PORT: "0",
  DATABASE_URL: testUrl.toString(),
  FRONTEND_ORIGINS: "http://127.0.0.1:5173",
};
const foreign = {
  organisationId: randomUUID(),
  userId: randomUUID(),
  entityId: randomUUID(),
};
const readerId = randomUUID(),
  hiddenId = randomUUID();
let app: INestApplication, base: string;
const apps: INestApplication[] = [];
const spec = yaml(readFileSync("../contracts/openapi.yaml", "utf8"));
const ajv = new Ajv({ strict: false });
addFormats(ajv);
const validators = new Map<string, ReturnType<typeof ajv.compile>>();
function validate(name: string, value: unknown) {
  let fn = validators.get(name);
  if (!fn) {
    fn = ajv.compile({
      ...spec.components.schemas[name],
      components: spec.components,
    });
    validators.set(name, fn);
  }
  assert.ok(fn(value), JSON.stringify(fn.errors));
}
async function start(identity?: { organisationId: string; userId: string }) {
  const instance = await createApplication({ env, identity, quiet: true });
  apps.push(instance);
  return { instance, url: await instance.getUrl() };
}
async function request(
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
  url = base,
) {
  const response = await fetch(url + "/api/v1" + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      Origin: "http://127.0.0.1:5173",
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data: any = response.status === 204 ? null : await response.json();
  assert.ok(response.headers.get("X-Request-Id"));
  if (response.status >= 400) {
    validate("Error", data);
    assert.equal(data.requestId, response.headers.get("X-Request-Id"));
  }
  return { status: response.status, data };
}
const listPath = (entityId = LOCAL.entityId, month = "2026-09") =>
  `/checklist-tasks?entityId=${entityId}&month=${month}`;
async function create(overrides: Record<string, unknown> = {}, url = base) {
  return request(
    "POST",
    "/checklist-tasks",
    {
      id: randomUUID(),
      entityId: LOCAL.entityId,
      month: "2026-09",
      title: "Task",
      ...overrides,
    },
    {},
    url,
  );
}

before(async () => {
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  process.env.DATABASE_URL = testUrl.toString();
  const migrated = spawnSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    { env, encoding: "utf8" },
  );
  assert.equal(migrated.status, 0, migrated.stderr);
  const again = spawnSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    { env, encoding: "utf8" },
  );
  assert.equal(again.status, 0, again.stderr);
  await db.organisation.createMany({
    data: [
      { id: LOCAL.organisationId, name: "Test A" },
      { id: foreign.organisationId, name: "Test B" },
    ],
  });
  await db.user.createMany({
    data: [{ id: LOCAL.userId }, { id: foreign.userId }, { id: readerId }],
  });
  await db.membership.createMany({
    data: [
      { organisationId: LOCAL.organisationId, userId: LOCAL.userId },
      { organisationId: LOCAL.organisationId, userId: readerId },
      { organisationId: foreign.organisationId, userId: foreign.userId },
    ],
  });
  await db.entity.createMany({
    data: [
      {
        id: LOCAL.entityId,
        organisationId: LOCAL.organisationId,
        name: "Entity A",
      },
      {
        id: LOCAL.secondEntityId,
        organisationId: LOCAL.organisationId,
        name: "Entity B",
      },
      { id: hiddenId, organisationId: LOCAL.organisationId, name: "Hidden" },
      {
        id: foreign.entityId,
        organisationId: foreign.organisationId,
        name: "Foreign",
      },
    ],
  });
  await db.entityAccess.createMany({
    data: [
      { ...LOCAL, entityId: LOCAL.entityId },
      { ...LOCAL, entityId: LOCAL.secondEntityId },
    ]
      .map(({ organisationId, userId, entityId }) => ({
        organisationId,
        userId,
        entityId,
        canWrite: true,
      }))
      .concat([
        {
          organisationId: foreign.organisationId,
          userId: foreign.userId,
          entityId: foreign.entityId,
          canWrite: true,
        },
        {
          organisationId: LOCAL.organisationId,
          userId: readerId,
          entityId: LOCAL.entityId,
          canWrite: false,
        },
      ]),
  });
  const started = await start();
  app = started.instance;
  base = started.url;
});
after(async () => {
  for (const instance of apps) await instance.close();
  await db.$disconnect();
  await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await admin.$disconnect();
  process.env.DATABASE_URL = initialUrl;
});

test("CRUD, consistent summary, canonical safe retries, delete and real API restart persistence", async () => {
  const entities = await request("GET", "/entities");
  assert.equal(entities.status, 200);
  validate("EntityList", entities.data);
  assert.equal(entities.data.items.length, 2);
  const empty = await request("GET", listPath());
  assert.deepEqual(empty.data.summary, { total: 0, completed: 0, percent: 0 });
  const id = randomUUID();
  const created = await create({ id, title: "  Bank review  " });
  assert.equal(created.status, 201);
  validate("ChecklistTask", created.data);
  assert.equal(created.data.title, "Bank review");
  const second = await create();
  assert.equal(second.status, 201);
  const completed = await request("PATCH", `/checklist-tasks/${id}`, {
    completed: true,
    expectedVersion: 1,
  });
  assert.equal(completed.status, 200);
  validate("ChecklistTask", completed.data);
  const replay = await create({ id, title: "Bank review" });
  assert.equal(replay.status, 200);
  assert.equal(replay.data.version, 2);
  assert.equal(replay.data.completed, true);
  assert.equal((await create({ id, title: "Changed" })).status, 409);
  const listing = await request("GET", listPath());
  validate("ChecklistTaskList", listing.data);
  assert.deepEqual(listing.data.summary, {
    total: 2,
    completed: 1,
    percent: 50,
  });
  await app.close();
  const restarted = await start();
  app = restarted.instance;
  base = restarted.url;
  assert.deepEqual((await request("GET", listPath())).data.summary, {
    total: 2,
    completed: 1,
    percent: 50,
  });
  assert.equal(
    (
      await request("PATCH", `/checklist-tasks/${id}`, {
        completed: false,
        expectedVersion: 2,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request("DELETE", `/checklist-tasks/${id}`, undefined, {
        "If-Match": '"2"',
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request("DELETE", `/checklist-tasks/${id}`, undefined, {
        "If-Match": '"3"',
      })
    ).status,
    204,
  );
  assert.equal(
    (
      await request("DELETE", `/checklist-tasks/${id}`, undefined, {
        "If-Match": '"3"',
      })
    ).status,
    404,
  );
  assert.deepEqual((await request("GET", listPath())).data.summary, {
    total: 1,
    completed: 0,
    percent: 0,
  });
  assert.equal(
    (await request("GET", listPath(LOCAL.secondEntityId))).data.items.length,
    0,
  );
  assert.equal(
    (await request("GET", listPath(LOCAL.entityId, "2026-10"))).data.items
      .length,
    0,
  );
  await request("DELETE", `/checklist-tasks/${second.data.id}`, undefined, {
    "If-Match": '"1"',
  });
});

test("server rejects UUID/month/title/version boundaries and extra mutable fields", async () => {
  for (const month of ["2026-00", "2026-13", "2026-9", "0000-01", "all"])
    assert.equal((await create({ month })).status, 422);
  for (const title of [
    "",
    "   ",
    "a".repeat(201),
    "bad\ntitle",
    "a".repeat(1001),
    "\ud800",
  ])
    assert.equal((await create({ title })).status, 422);
  for (const title of ["a", "a".repeat(200), "🧮".repeat(200)]) {
    const c = await create({ title });
    assert.equal(c.status, 201);
    await request("DELETE", `/checklist-tasks/${c.data.id}`, undefined, {
      "If-Match": '"1"',
    });
  }
  assert.equal((await create({ id: "bad" })).status, 422);
  assert.equal(
    (await create({ organisationId: foreign.organisationId })).status,
    422,
  );
  assert.equal((await create({ completed: true })).status, 422);
  assert.equal((await request("GET", listPath() + "&role=Admin")).status, 422);
  assert.equal(
    (
      await request("PATCH", "/checklist-tasks/not-uuid", {
        completed: true,
        expectedVersion: 1,
      })
    ).status,
    422,
  );
  const c = await create();
  for (const body of [
    { completed: "true", expectedVersion: 1 },
    { completed: true, expectedVersion: 0 },
    { completed: true, expectedVersion: 1.5 },
    { completed: true, expectedVersion: 1, entityId: hiddenId },
  ])
    assert.equal(
      (await request("PATCH", `/checklist-tasks/${c.data.id}`, body)).status,
      422,
    );
  assert.equal(
    (await request("DELETE", `/checklist-tasks/${c.data.id}`)).status,
    422,
  );
  await request("DELETE", `/checklist-tasks/${c.data.id}`, undefined, {
    "If-Match": '"1"',
  });
});

test("tenant/entity isolation for every operation, identity forgery and read-only membership", async () => {
  const other = await start(foreign),
    reader = await start({
      organisationId: LOCAL.organisationId,
      userId: readerId,
    });
  const c = await create({ entityId: foreign.entityId }, other.url);
  assert.equal(c.status, 201);
  for (const entity of [foreign.entityId, hiddenId]) {
    assert.equal((await request("GET", listPath(entity))).status, 404);
    assert.equal((await create({ entityId: entity })).status, 404);
  }
  assert.equal(
    (
      await request("PATCH", `/checklist-tasks/${c.data.id}`, {
        completed: true,
        expectedVersion: 1,
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await request("DELETE", `/checklist-tasks/${c.data.id}`, undefined, {
        "If-Match": '"1"',
      })
    ).status,
    404,
  );
  assert.equal((await create({ id: c.data.id })).status, 404);
  assert.equal(
    (await create({ entityId: LOCAL.entityId }, reader.url)).status,
    403,
  );
  const own = await create();
  assert.equal(
    (
      await request(
        "PATCH",
        `/checklist-tasks/${own.data.id}`,
        { completed: true, expectedVersion: 1 },
        {},
        reader.url,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        "DELETE",
        `/checklist-tasks/${own.data.id}`,
        undefined,
        { "If-Match": '"1"' },
        reader.url,
      )
    ).status,
    403,
  );
  for (const headers of [
    { "X-Role": "Admin" },
    { "X-Tenant-Id": foreign.organisationId },
    { "X-User-Id": foreign.userId },
    { Forwarded: "for=127.0.0.1" },
    { Origin: "https://evil.example" },
  ] as Record<string, string>[])
    assert.equal(
      (await request("POST", "/checklist-tasks", {}, headers)).status,
      403,
    );
  assert.equal(
    (
      await request("GET", "/entities", undefined, {
        Authorization: "Bearer forged",
      })
    ).status,
    401,
  );
  const missing = await start({
    organisationId: LOCAL.organisationId,
    userId: randomUUID(),
  });
  assert.equal(
    (await request("GET", "/entities", undefined, {}, missing.url)).status,
    401,
  );
  const noJson = await fetch(base + "/api/v1/checklist-tasks", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: "{}",
  });
  assert.equal(noJson.status, 422);
  const oversized = await fetch(base + "/api/v1/checklist-tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "x".repeat(20000) }),
  });
  assert.equal(oversized.status, 422);
  validate("Error", await oversized.json());
  const hidden = await db.checklistTask.create({
    data: {
      id: randomUUID(),
      organisationId: LOCAL.organisationId,
      entityId: hiddenId,
      month: new Date("2026-09-01"),
      title: "Private task",
      createDigest: "0".repeat(64),
    },
  });
  assert.equal(
    (
      await request("PATCH", `/checklist-tasks/${hidden.id}`, {
        completed: true,
        expectedVersion: 1,
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await request("DELETE", `/checklist-tasks/${hidden.id}`, undefined, {
        "If-Match": '"1"',
      })
    ).status,
    404,
  );
  const malformed = await fetch(base + "/api/v1/checklist-tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{",
  });
  assert.equal(malformed.status, 400);
  validate("Error", await malformed.json());
});

test("concurrent create replay, optimistic update and delete/update races", async () => {
  const id = randomUUID();
  const replays = await Promise.all(
    Array.from({ length: 8 }, () => create({ id, month: "2026-11" })),
  );
  assert.equal(replays.filter((r) => r.status === 201).length, 1);
  assert.equal(replays.filter((r) => r.status === 200).length, 7);
  const updates = await Promise.all(
    [true, false].map((completed) =>
      request("PATCH", `/checklist-tasks/${id}`, {
        completed,
        expectedVersion: 1,
      }),
    ),
  );
  assert.deepEqual(updates.map((r) => r.status).sort(), [200, 409]);
  const races = await Promise.all([
    request("PATCH", `/checklist-tasks/${id}`, {
      completed: true,
      expectedVersion: 2,
    }),
    request("DELETE", `/checklist-tasks/${id}`, undefined, {
      "If-Match": '"2"',
    }),
  ]);
  assert.equal(races.filter((r) => [200, 204].includes(r.status)).length, 1);
  assert.ok(races.some((r) => [404, 409].includes(r.status)));
});

test("200-task cap is transactional under concurrent creates and list/summary cover the same set", async () => {
  const month = "2026-12";
  // Populate through the same service (not an embedded DB substitute).
  for (let batch = 0; batch < 19; batch++)
    await Promise.all(Array.from({ length: 10 }, () => create({ month })));
  const results = await Promise.all(
    Array.from({ length: 20 }, () => create({ month })),
  );
  assert.equal(results.filter((r) => r.status === 201).length, 10);
  assert.equal(
    results.filter(
      (r) => r.status === 409 && r.data.code === "CAPACITY_REACHED",
    ).length,
    10,
  );
  const listing = await request("GET", listPath(LOCAL.entityId, month));
  validate("ChecklistTaskList", listing.data);
  assert.equal(listing.data.items.length, 200);
  assert.deepEqual(listing.data.summary, {
    total: 200,
    completed: 0,
    percent: 0,
  });
  const first = listing.data.items[0];
  assert.equal(
    (await create({ id: first.id, month })).status,
    200,
    "Identical retries work even at capacity",
  );
  const sorted = [...listing.data.items].sort(
    (a: any, b: any) =>
      a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
  assert.deepEqual(listing.data.items, sorted);
});

test("configuration refuses production/public/local-identity deployment and invalid origins", () => {
  for (const overrides of [
    { NODE_ENV: "production" },
    { API_HOST: "0.0.0.0" },
    { CHECKLIST_IDENTITY: "off" },
    { VERCEL: "1" },
    { FRONTEND_ORIGINS: "*" },
    { FRONTEND_ORIGINS: "https://public.example" },
  ])
    assert.throws(() => readConfig({ ...env, ...overrides }));
  const refused = spawnSync(process.execPath, ["dist/src/main.js"], {
    env: { ...env, NODE_ENV: "production" },
    encoding: "utf8",
  });
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /startup refused/);
});

test("dependency outage returns safe 503 and readiness is not a PID check", async () => {
  const good = await fetch(base + "/health/ready");
  assert.equal(good.status, 200);
  const saved = process.env.DATABASE_URL;
  process.env.DATABASE_URL =
    "postgresql://unavailable:unavailable@127.0.0.1:1/unavailable?connect_timeout=1";
  const down = await start();
  process.env.DATABASE_URL = saved;
  const unavailable = await request(
    "GET",
    "/entities",
    undefined,
    {},
    down.url,
  );
  assert.equal(unavailable.status, 503);
  assert.ok(!JSON.stringify(unavailable.data).includes("postgresql"));
  assert.equal((await fetch(down.url + "/health/ready")).status, 503);
});

test("copy snapshot, boundaries, unchanged source, new IDs, empty/conflict, restart and validation", async () => {
  const sourceMonth = "2039-12",
    month = "2040-01";
  const a = await create({ month: sourceMonth, title: "Carry title" });
  await request("PATCH", `/checklist-tasks/${a.data.id}`, {
    completed: true,
    expectedVersion: 1,
  });
  const before = await request("GET", listPath(LOCAL.entityId, sourceMonth));
  const copy = () =>
    request("POST", "/checklist-tasks/copy-previous-month", {
      entityId: LOCAL.entityId,
      month,
    });
  const result = await copy();
  assert.equal(result.status, 201);
  validate("CopyPreviousMonthResult", result.data);
  assert.deepEqual(result.data, {
    sourceMonth,
    destinationMonth: month,
    copiedCount: 1,
  });
  const list = await request("GET", listPath(LOCAL.entityId, month)),
    task = list.data.items[0];
  assert.notEqual(task.id, a.data.id);
  assert.equal(task.title, "Carry title");
  assert.equal(task.completed, false);
  assert.equal(task.version, 1);
  assert.deepEqual(
    (await request("GET", listPath(LOCAL.entityId, sourceMonth))).data,
    before.data,
  );
  assert.equal((await copy()).status, 409);
  const restarted = await start();
  assert.equal(
    (
      await request(
        "GET",
        listPath(LOCAL.entityId, month),
        undefined,
        {},
        restarted.url,
      )
    ).data.items[0].id,
    task.id,
  );
  for (const bad of [
    { entityId: "bad", month },
    { entityId: LOCAL.entityId, month: "0001-01" },
    { entityId: LOCAL.entityId, month: "0000-12" },
    { entityId: LOCAL.entityId, month, extra: true },
  ])
    assert.equal(
      (await request("POST", "/checklist-tasks/copy-previous-month", bad))
        .status,
      422,
    );
  const empty = await request("POST", "/checklist-tasks/copy-previous-month", {
    entityId: LOCAL.entityId,
    month: "0001-02",
  });
  assert.equal(empty.status, 200);
  assert.equal(empty.data.copiedCount, 0);
});

test("copy concurrent batches/create, maximum count, permissions and atomic rollback", async () => {
  await create({ month: "2041-02", title: "Snapshot" });
  const copy = (month: string, entityId = LOCAL.entityId, url = base) =>
    request(
      "POST",
      "/checklist-tasks/copy-previous-month",
      { entityId, month },
      {},
      url,
    );
  const results = await Promise.all([copy("2041-03"), copy("2041-03")]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  await create({ month: "2042-02" });
  const race = await Promise.all([
    copy("2042-03"),
    create({ month: "2042-03", title: "Ordinary" }),
  ]);
  assert.equal(race[1].status, 201);
  assert.ok([201, 409].includes(race[0].status));
  const tasks = (await request("GET", listPath(LOCAL.entityId, "2042-03"))).data
    .items;
  assert.equal(tasks.length, race[0].status === 201 ? 2 : 1);
  // Existing capacity test creates 200 rows in 2027-01; use an independent batch here.
  const { creationDigest } = await import("../src/checklist.repository");
  await db.checklistTask.createMany({
    data: Array.from({ length: 200 }, (_, i) => ({
      id: randomUUID(),
      organisationId: LOCAL.organisationId,
      entityId: LOCAL.entityId,
      month: new Date("2043-01-01T00:00:00Z"),
      title: `Max ${i}`,
      createDigest: creationDigest({
        entityId: LOCAL.entityId,
        month: "2043-01",
        title: `Max ${i}`,
      }),
    })),
  });
  assert.equal((await copy("2043-02")).data.copiedCount, 200);
  assert.equal((await copy("2043-02")).status, 409);
  assert.equal((await copy("2044-01", foreign.entityId)).status, 404);
  assert.equal((await copy("2044-01", hiddenId)).status, 404);
  const reader = await start({
    organisationId: LOCAL.organisationId,
    userId: readerId,
  });
  assert.equal((await copy("2044-01", LOCAL.entityId, reader.url)).status, 403);
  await db.membership.update({
    where: {
      organisationId_userId: {
        organisationId: LOCAL.organisationId,
        userId: readerId,
      },
    },
    data: { active: false },
  });
  assert.equal((await copy("2044-01", LOCAL.entityId, reader.url)).status, 401);
  await db.membership.update({
    where: {
      organisationId_userId: {
        organisationId: LOCAL.organisationId,
        userId: readerId,
      },
    },
    data: { active: true },
  });
  await create({ month: "2045-01", title: "Good" });
  await create({ month: "2045-01", title: "Rollback" });
  await db.$executeRawUnsafe(
    `CREATE FUNCTION "${schema}".reject_copy() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.month='2045-02-01' AND NEW.title='Rollback' THEN RAISE EXCEPTION 'synthetic failure'; END IF; RETURN NEW; END $$`,
  );
  await db.$executeRawUnsafe(
    `CREATE TRIGGER reject_copy BEFORE INSERT ON "ChecklistTask" FOR EACH ROW EXECUTE FUNCTION "${schema}".reject_copy()`,
  );
  try {
    assert.ok((await copy("2045-02")).status >= 500);
    assert.equal(
      (await request("GET", listPath(LOCAL.entityId, "2045-02"))).data.items
        .length,
      0,
    );
  } finally {
    await db.$executeRawUnsafe(`DROP TRIGGER reject_copy ON "ChecklistTask"`);
  }
});

test("production sessions: generic login, proxy, CSRF, permissions, expiry, logout, revocation and membership removal", async () => {
  const { passwordOptions, digest } = await import("../src/auth");
  const argon = await import("argon2");
  await db.account.create({
    data: {
      userId: LOCAL.userId,
      username: "synthetic",
      passwordHash: await argon.hash(
        "synthetic-test-password",
        passwordOptions,
      ),
    },
  });
  const proxyToken = randomUUID() + randomUUID(),
    origin = "https://finai.example";
  const instance = await createApplication({
    env: {
      ...env,
      NODE_ENV: "production",
      CHECKLIST_IDENTITY: "session",
      PUBLIC_ORIGIN: origin,
      API_TRUSTED_HOST: "finai.example",
      API_PROXY_TOKEN: proxyToken,
    },
    quiet: true,
  });
  apps.push(instance);
  const url = await instance.getUrl();
  let cookie = "",
    csrf = "";
  const call = async (
    path: string,
    method = "GET",
    body?: unknown,
    headers: Record<string, string> = {},
  ) => {
    return new Promise<{ r: { status: number; headers: Headers }; data: any }>(
      (resolve, reject) => {
        const request = httpRequest(
          url + path,
          {
            method,
            headers: {
              Host: "finai.example",
              "X-Forwarded-Proto": "https",
              "X-Finai-Public-Host": "finai.example",
              "X-Finai-Proxy-Token": proxyToken,
              Origin: origin,
              "Content-Type": "application/json",
              Cookie: cookie,
              ...headers,
            },
          },
          (response) => {
            let text = "";
            response.on("data", (chunk) => (text += chunk));
            response.on("end", () => {
              const h = new Headers();
              for (const [key, value] of Object.entries(response.headers))
                if (value)
                  h.set(key, Array.isArray(value) ? value.join(",") : value);
              resolve({
                r: { status: response.statusCode!, headers: h },
                data: JSON.parse(text),
              });
            });
          },
        );
        request.on("error", reject);
        request.end(body === undefined ? undefined : JSON.stringify(body));
      },
    );
  };
  assert.equal((await call("/api/v1/entities")).r.status, 401);
  assert.equal((await call("/health/ready")).r.status, 200);
  assert.equal(
    (
      await call("/api/v1/entities", "GET", undefined, {
        "X-Finai-Proxy-Token": "wrong",
      })
    ).r.status,
    403,
  );
  const login = async (password = "synthetic-test-password") =>
    call("/auth/login", "POST", {
      username: "synthetic",
      password,
      organisationId: LOCAL.organisationId,
    });
  assert.equal((await login("wrong")).r.status, 401);
  const logged = await login();
  assert.equal(logged.r.status, 200);
  cookie = logged.r.headers.get("set-cookie")!.split(";")[0];
  csrf = logged.data.csrfToken;
  assert.match(
    logged.r.headers.get("set-cookie")!,
    /HttpOnly; Secure; SameSite=Strict/,
  );
  assert.equal((await call("/api/v1/entities")).r.status, 200);
  assert.equal(
    (
      await call("/api/v1/checklist-tasks/copy-previous-month", "POST", {
        entityId: LOCAL.entityId,
        month: "2050-01",
      })
    ).r.status,
    403,
  );
  assert.equal(
    (
      await call(
        "/api/v1/checklist-tasks/copy-previous-month",
        "POST",
        { entityId: foreign.entityId, month: "2050-01" },
        { "X-CSRF-Token": csrf },
      )
    ).r.status,
    404,
  );
  assert.equal(
    (
      await call(
        "/api/v1/checklist-tasks/copy-previous-month",
        "POST",
        { entityId: LOCAL.entityId, month: "2050-01" },
        { "X-CSRF-Token": csrf },
      )
    ).r.status,
    200,
  );
  const priorCookie = cookie;
  const rotated = await login();
  assert.equal(rotated.r.status, 200);
  cookie = rotated.r.headers.get("set-cookie")!.split(";")[0];
  csrf = rotated.data.csrfToken;
  assert.notEqual(cookie, priorCookie);
  assert.equal(
    (await call("/auth/session", "GET", undefined, { Cookie: priorCookie })).r
      .status,
    401,
  );
  await db.membership.update({
    where: {
      organisationId_userId: {
        organisationId: LOCAL.organisationId,
        userId: LOCAL.userId,
      },
    },
    data: { active: false },
  });
  assert.equal((await call("/api/v1/entities")).r.status, 401);
  await db.membership.update({
    where: {
      organisationId_userId: {
        organisationId: LOCAL.organisationId,
        userId: LOCAL.userId,
      },
    },
    data: { active: true },
  });
  assert.equal(
    (await call("/auth/logout", "POST", {}, { "X-CSRF-Token": csrf })).r.status,
    200,
  );
  assert.equal((await call("/api/v1/entities")).r.status, 401);
  const again = await login();
  cookie = again.r.headers.get("set-cookie")!.split(";")[0];
  await db.session.updateMany({
    where: { userId: LOCAL.userId },
    data: { expiresAt: new Date(0) },
  });
  assert.equal((await call("/auth/session")).r.status, 401);
  const third = await login();
  cookie = third.r.headers.get("set-cookie")!.split(";")[0];
  await db.session.deleteMany({
    where: { tokenHash: digest(cookie.split("=")[1]) },
  });
  assert.equal((await call("/auth/session")).r.status, 401);
  // Hold a reset's row lock while a login verifies the old password. The
  // login must wait and then reject the now-obsolete password proof.
  const changedHash = await argon.hash(
    "new-synthetic-test-password",
    passwordOptions,
  );
  let unlocked!: () => void, announceLock!: () => void;
  const locked = new Promise<void>((resolve) => {
    announceLock = resolve;
  });
  const unlock = new Promise<void>((resolve) => {
    unlocked = resolve;
  });
  const resetting = db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT "userId" FROM "Account" WHERE "userId"=${LOCAL.userId}::uuid FOR UPDATE`;
      announceLock();
      await unlock;
      await tx.account.update({
        where: { userId: LOCAL.userId },
        data: { passwordHash: changedHash },
      });
      await tx.session.deleteMany({ where: { userId: LOCAL.userId } });
    },
    { timeout: 10000 },
  );
  await locked;
  const duringReset = login();
  let waiting = false;
  try {
    for (let i = 0; i < 100; i++) {
      const rows = await db.$queryRaw<
        { waiting: boolean }[]
      >`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND wait_event_type='Lock' AND query LIKE '%FROM "Account"%FOR SHARE%') AS waiting`;
      if (rows[0].waiting) {
        waiting = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.equal(waiting, true, "Login must serialize with password reset");
  } finally {
    unlocked();
  }
  await resetting;
  assert.equal(
    (await duringReset).r.status,
    401,
    "Old password proof cannot survive reset",
  );
  let limited = false;
  for (let i = 0; i < 12; i++) {
    if ((await login("wrong")).r.status === 429) {
      limited = true;
      break;
    }
  }
  assert.equal(limited, true, "HTTP login rate limit must apply");
});

test("database rate limiter is shared across instances", async () => {
  const { Auth } = await import("../src/auth");
  const first = new Auth(db as any),
    second = new Auth(db as any),
    key = `synthetic:${randomUUID()}`;
  await first.limit(key, 1, 3600);
  await assert.rejects(
    second.limit(key, 1, 3600),
    (e: any) => e.status === 429,
  );
});

test("subscription CRUD, safe create replay, atomic edit/archive conflicts and restart persistence", async () => {
  const input = {
    id: randomUUID(),
    entityId: LOCAL.entityId,
    supplierName: "  Example supplier  ",
    subscriptionName: "  Renewal plan  ",
    renewalDate: "2028-02-29",
    cancellationDeadline: "2028-02-01",
    notes: "Initial note",
  };
  const made = await request("POST", "/subscription-renewals", input);
  assert.equal(made.status, 201);
  assert.equal(made.data.supplierName, "Example supplier");
  assert.equal(made.data.archived, false);
  assert.equal(made.data.version, 1);
  assert.ok(!("organisationId" in made.data));
  assert.equal(
    (await request("POST", "/subscription-renewals", input)).status,
    200,
  );
  const details = {
    supplierName: "Edited supplier",
    subscriptionName: "Edited plan",
    renewalDate: "2028-03-01",
    cancellationDeadline: null,
    notes: null,
    expectedVersion: 1,
  };
  const race = await Promise.all([
    request("PATCH", `/subscription-renewals/${input.id}`, details),
    request("PATCH", `/subscription-renewals/${input.id}`, {
      ...details,
      notes: "Concurrent",
    }),
  ]);
  assert.deepEqual(race.map((r) => r.status).sort(), [200, 409]);
  assert.equal(
    (
      await request("PATCH", `/subscription-renewals/${input.id}/archive`, {
        archived: true,
        expectedVersion: 1,
      })
    ).status,
    409,
  );
  const archived = await request(
    "PATCH",
    `/subscription-renewals/${input.id}/archive`,
    { archived: true, expectedVersion: 2 },
  );
  assert.equal(archived.status, 200);
  assert.equal(archived.data.version, 3);
  assert.equal(archived.data.renewalIndicator, null);
  const query = `/subscription-renewals?entityId=${LOCAL.entityId}&search=Edited%20supplier`;
  assert.equal((await request("GET", query)).data.total, 0);
  assert.equal(
    (await request("GET", query + "&status=archived")).data.total,
    1,
  );
  assert.equal(
    (
      await request("PATCH", `/subscription-renewals/${input.id}/archive`, {
        archived: false,
        expectedVersion: 3,
      })
    ).status,
    200,
  );
  const restarted = await start();
  const list = await request("GET", query, undefined, {}, restarted.url);
  assert.equal(list.data.items[0].id, input.id);
  assert.equal(list.data.items[0].version, 4);
  await restarted.instance.close();
});

test("subscription validation rejects invalid calendar dates, deadlines and editable-field overrides", async () => {
  const valid = {
    id: randomUUID(),
    entityId: LOCAL.entityId,
    supplierName: "Supplier",
    subscriptionName: "Plan",
    renewalDate: "2026-12-01",
  };
  for (const extra of [
    { renewalDate: "2026-02-29" },
    { renewalDate: "2026-04-31" },
    { renewalDate: "0000-01-01" },
    { renewalDate: "2026-01-01T00:00:00Z" },
    { cancellationDeadline: "2026-12-02" },
    { supplierName: " " },
    { subscriptionName: "x".repeat(201) },
    { notes: "x".repeat(2001) },
    { archived: true },
    { organisationId: LOCAL.organisationId },
  ])
    assert.equal(
      (await request("POST", "/subscription-renewals", { ...valid, ...extra }))
        .status,
      422,
    );
  const created = await request("POST", "/subscription-renewals", valid);
  assert.equal(created.status, 201);
  assert.equal(
    (
      await request("PATCH", `/subscription-renewals/${valid.id}`, {
        supplierName: "S",
        subscriptionName: "P",
        renewalDate: "2026-12-01",
      })
    ).status,
    422,
  );
  assert.equal(
    (
      await request("PATCH", `/subscription-renewals/${valid.id}/archive`, {
        archived: true,
        expectedVersion: 1,
        entityId: foreign.entityId,
      })
    ).status,
    422,
  );
  for (const query of [
    "limit=51",
    "limit=0",
    "offset=-1",
    "offset=1.5",
    "status=wrong",
    "role=Admin",
  ])
    assert.equal(
      (
        await request(
          "GET",
          `/subscription-renewals?entityId=${LOCAL.entityId}&${query}`,
        )
      ).status,
      422,
    );
});

test("subscription literal search, active/archived filtering and bounded pagination", async () => {
  const label = `Find-${randomUUID()}`;
  for (let i = 0; i < 5; i++)
    assert.equal(
      (
        await request("POST", "/subscription-renewals", {
          id: randomUUID(),
          entityId: LOCAL.entityId,
          supplierName: label,
          subscriptionName: i === 0 ? "100%_literal" : "Plan",
          renewalDate: "2030-01-01",
        })
      ).status,
      201,
    );
  const path = `/subscription-renewals?entityId=${LOCAL.entityId}&search=${label.toUpperCase()}&limit=2`;
  const first = (await request("GET", path)).data;
  assert.equal(first.items.length, 2);
  assert.equal(first.total, 5);
  assert.equal(first.nextOffset, 2);
  const second = (await request("GET", path + "&offset=2")).data,
    third = (await request("GET", path + "&offset=4")).data;
  assert.equal(third.nextOffset, null);
  assert.equal(
    new Set(
      [...first.items, ...second.items, ...third.items].map((v: any) => v.id),
    ).size,
    5,
  );
  const literal = await request(
    "GET",
    `/subscription-renewals?entityId=${LOCAL.entityId}&search=${encodeURIComponent("%_")}`,
  );
  assert.equal(literal.data.total, 1);
  assert.equal((await request("GET", path + "&status=archived")).data.total, 0);
});

test("subscription organisation/entity permissions and inactive/read-only memberships", async () => {
  const input = {
    id: randomUUID(),
    entityId: LOCAL.entityId,
    supplierName: "Private",
    subscriptionName: "Plan",
    renewalDate: "2027-01-01",
  };
  await request("POST", "/subscription-renewals", input);
  const foreignApp = await start({
    organisationId: foreign.organisationId,
    userId: foreign.userId,
  });
  assert.equal(
    (
      await request(
        "GET",
        `/subscription-renewals?entityId=${LOCAL.entityId}`,
        undefined,
        {},
        foreignApp.url,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await request("POST", "/subscription-renewals", {
        ...input,
        id: randomUUID(),
        entityId: hiddenId,
      })
    ).status,
    404,
  );
  for (const [path, body] of [
    [
      `/subscription-renewals/${input.id}`,
      {
        supplierName: "Stolen",
        subscriptionName: "P",
        renewalDate: "2027-01-01",
        expectedVersion: 1,
      },
    ],
    [
      `/subscription-renewals/${input.id}/archive`,
      { archived: true, expectedVersion: 1 },
    ],
  ] as const)
    assert.equal(
      (await request("PATCH", path, body, {}, foreignApp.url)).status,
      404,
    );
  await foreignApp.instance.close();
  const reader = await start({
    organisationId: LOCAL.organisationId,
    userId: readerId,
  });
  assert.equal(
    (
      await request(
        "POST",
        "/subscription-renewals",
        { ...input, id: randomUUID() },
        {},
        reader.url,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        "PATCH",
        `/subscription-renewals/${input.id}/archive`,
        { archived: true, expectedVersion: 1 },
        {},
        reader.url,
      )
    ).status,
    403,
  );
  await db.membership.update({
    where: {
      organisationId_userId: {
        organisationId: LOCAL.organisationId,
        userId: readerId,
      },
    },
    data: { active: false },
  });
  try {
    assert.equal(
      (
        await request(
          "GET",
          `/subscription-renewals?entityId=${LOCAL.entityId}`,
          undefined,
          {},
          reader.url,
        )
      ).status,
      401,
    );
  } finally {
    await db.membership.update({
      where: {
        organisationId_userId: {
          organisationId: LOCAL.organisationId,
          userId: readerId,
        },
      },
      data: { active: true },
    });
  }
  await reader.instance.close();
});

test("subscription timezone fallback and separate inclusive renewal/deadline indicators", async () => {
  const { dateContext, subscriptionIndicators, organisationTimezones } =
    await import("../src/subscription.service");
  const instant = new Date("2026-10-21T20:00:00Z");
  assert.equal(dateContext("Asia/Dhaka", instant).today, "2026-10-22");
  assert.equal(dateContext("America/Los_Angeles", instant).today, "2026-10-21");
  assert.deepEqual(organisationTimezones(undefined), {});
  assert.throws(() =>
    organisationTimezones(
      '{"11111111-1111-4111-8111-111111111111":"Invalid/Timezone"}',
    ),
  );
  const today = "2026-10-22";
  assert.deepEqual(
    subscriptionIndicators("2026-10-22", "2026-10-22", false, today),
    {
      renewalIndicator: "Renewing soon.",
      cancellationIndicator: "Cancellation deadline approaching.",
    },
  );
  assert.deepEqual(
    subscriptionIndicators("2026-11-21", "2026-10-29", false, today),
    {
      renewalIndicator: "Renewing soon.",
      cancellationIndicator: "Cancellation deadline approaching.",
    },
  );
  assert.deepEqual(
    subscriptionIndicators("2026-11-22", "2026-10-30", false, today),
    { renewalIndicator: null, cancellationIndicator: null },
  );
  assert.deepEqual(
    subscriptionIndicators("2026-10-21", "2026-10-20", false, today),
    {
      renewalIndicator: "Renewal date passed.",
      cancellationIndicator: "Cancellation deadline passed.",
    },
  );
  assert.deepEqual(
    subscriptionIndicators("2026-10-21", "2026-10-20", true, today),
    { renewalIndicator: null, cancellationIndicator: null },
  );
  const configured = await createApplication({
    env: {
      ...env,
      ORGANISATION_TIMEZONES: JSON.stringify({
        [LOCAL.organisationId]: "Asia/Dhaka",
      }),
    },
    quiet: true,
  });
  apps.push(configured);
  const listing = await request(
    "GET",
    `/subscription-renewals?entityId=${LOCAL.entityId}`,
    undefined,
    {},
    await configured.getUrl(),
  );
  assert.equal(listing.data.timezone, "Asia/Dhaka");
  assert.equal(listing.data.today, dateContext("Asia/Dhaka").today);
  assert.equal(
    (await request("GET", `/subscription-renewals?entityId=${LOCAL.entityId}`))
      .data.timezone,
    "UTC",
  );
  await configured.close();
});
