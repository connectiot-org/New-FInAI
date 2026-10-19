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
