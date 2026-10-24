import { before, after, test } from "node:test";
import { request as httpRequest } from "node:http";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import Ajv from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { parse as yaml } from "yaml";
import { createApplication } from "../src/app";
import { Database } from "../src/database";
import { ChecklistRepository } from "../src/checklist.repository";
import { ReceivablesRepository } from "../src/receivables/repository";
import {
  validateRegister,
  parseRegister,
  MAX_BYTES,
  registerDigest,
} from "../src/receivables/validation";
import { digest } from "../src/auth";
import { LOCAL } from "../src/config";
const initial = process.env.DATABASE_URL!;
assert.ok(["localhost", "127.0.0.1"].includes(new URL(initial).hostname));
const schema = "receivables_" + randomUUID().replaceAll("-", ""),
  url = new URL(initial);
url.searchParams.set("schema", schema);
const admin = new PrismaClient({ datasourceUrl: initial });
const env = {
  ...process.env,
  DATABASE_URL: url.toString(),
  NODE_ENV: "test",
  CHECKLIST_IDENTITY: "local",
  API_HOST: "127.0.0.1",
  API_PORT: "0",
  FRONTEND_ORIGINS: "http://127.0.0.1:5173",
};
let db: Database,
  repo: ReceivablesRepository,
  app: INestApplication,
  base: string;
const apps: INestApplication[] = [];
const identity = { organisationId: LOCAL.organisationId, userId: LOCAL.userId };
const input = (
  invoices: any[] = [
    {
      invoiceId: "i-1",
      customerId: "customer-1",
      customerName: "Synthetic",
      issuedOn: "2026-09-01",
      status: "Partial",
      amountCents: 100000,
      paidCents: 25000,
    },
  ],
) => ({
  schemaVersion: 1,
  currency: "USD",
  sourceName: "Synthetic export A",
  sourceCapturedAt: "2026-10-23T00:00:00Z",
  completeRegister: true,
  invoices,
});
const spec = yaml(
    readFileSync("../contracts/receivables.openapi.yaml", "utf8"),
  ),
  ajv = new Ajv({ strict: false });
addFormats(ajv);
const validate = ajv.compile({
  ...spec.components.schemas.Summary,
  components: spec.components,
});
async function entity() {
  const id = randomUUID();
  await db.entity.create({
    data: {
      id,
      organisationId: identity.organisationId,
      name: "Synthetic isolated entity",
    },
  });
  await db.entityAccess.create({
    data: { ...identity, entityId: id, canWrite: true },
  });
  return id;
}
const summary = (entityId: string, period = "all") =>
  repo.summary(identity, { entityId, period });
async function request(
  path: string,
  headers: Record<string, string> = {},
  origin = base,
): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(origin + path, { headers }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("error", reject);
      res.on("end", () => {
        try {
          assert.ok(res.headers["x-request-id"]);
          assert.equal(res.headers["cache-control"], "no-store");
          resolve({ status: res.statusCode!, data: JSON.parse(body) });
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on("error", reject);
    req.end();
  });
}
before(async () => {
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  process.env.DATABASE_URL = env.DATABASE_URL;
  for (const args of [
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    ["--import", "tsx", "prisma/seed.ts"],
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
  ]) {
    const r = spawnSync(process.execPath, args, { env, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
  }
  db = new Database();
  repo = new ReceivablesRepository(db, new ChecklistRepository(db));
  app = await createApplication({ env, quiet: true });
  apps.push(app);
  base = await app.getUrl();
  assert.equal(await db.entity.count(), 2);
});
after(async () => {
  for (const a of apps) await a.close();
  await db?.$disconnect();
  await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
  await admin.$disconnect();
});
test("complete import validation, boundary dates/status/money/UTF8/size/rows and deterministic normalization", () => {
  const source = input(),
    row = source.invoices[0];
  for (const patch of [
    { schemaVersion: 2 },
    { completeRegister: false },
    { currency: "EUR" },
    { other: 1 },
    { sourceCapturedAt: "2999-01-01T00:00:00Z" },
    { sourceCapturedAt: "2026-02-29T00:00:00Z" },
    { invoices: [row, row] },
    {
      invoices: [
        row,
        { ...row, invoiceId: "different", customerName: "Conflict" },
      ],
    },
  ])
    assert.throws(() => validateRegister({ ...source, ...patch }));
  for (const patch of [
    { issuedOn: "2026-02-29" },
    { issuedOn: "0000-01-01" },
    { amountCents: -1 },
    { paidCents: 0.1 },
    { amountCents: NaN },
    { amountCents: 9007199254740992 },
    { paidCents: 100001 },
    { status: "Voided" },
    { status: "Draft" },
    { status: "Issued" },
    { status: "Paid" },
    { customerId: "" },
    { currency: "USD" },
  ])
    assert.throws(() => validateRegister(input([{ ...row, ...patch }])));
  assert.doesNotThrow(() =>
    validateRegister(
      input([
        { ...row, issuedOn: "0001-01-01" },
        { ...row, invoiceId: "b", issuedOn: "9999-12-31" },
      ]),
    ),
  );
  assert.throws(() => parseRegister(Buffer.alloc(MAX_BYTES + 1)));
  assert.throws(() => parseRegister(Buffer.from([0xff])));
  assert.throws(() => parseRegister(Buffer.from("{")));
  assert.throws(() =>
    parseRegister(
      Buffer.from(
        JSON.stringify(input()).replace("100000", "9007199254740991.1"),
      ),
    ),
  );
  assert.throws(() =>
    validateRegister(
      input(
        Array.from({ length: 10001 }, (_, i) => ({
          ...row,
          invoiceId: String(i),
        })),
      ),
    ),
  );
  const many = Array.from({ length: 10000 }, (_, i) => ({
    ...row,
    invoiceId: String(i),
  }));
  assert.equal(validateRegister(input(many)).invoices.length, 10000);
  assert.equal(
    registerDigest(validateRegister(input(many))),
    registerDigest(validateRegister(input([...many].reverse()))),
  );
});
test("dry-run, actual CLI defaults, complete import, current retry, persisted source and contract", async () => {
  const id = await entity(),
    source = input();
  assert.equal((await summary(id)).dataState, "no_snapshot");
  const dir = mkdtempSync(join(tmpdir(), "finai-import-"));
  try {
    const file = join(dir, "source.json");
    writeFileSync(file, JSON.stringify(source));
    const r = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "scripts/import-receivables.mts",
        "--file",
        file,
        "--organisation",
        identity.organisationId,
        "--actor",
        identity.userId,
        "--entity",
        id,
        "--expected-version",
        "0",
      ],
      { env, encoding: "utf8" },
    );
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(JSON.parse(r.stdout), {
      status: "dry_run",
      version: 1,
      rowCount: 1,
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  assert.equal(
    await db.receivableSnapshot.count({ where: { entityId: id } }),
    0,
  );
  assert.equal(
    (await repo.import(identity, id, 0, source, true)).status,
    "imported",
  );
  assert.equal(
    (await repo.import(identity, id, 0, source, true)).status,
    "unchanged",
  );
  assert.equal(
    await db.receivableSnapshot.count({ where: { entityId: id } }),
    1,
  );
  const result = await summary(id);
  assert.ok(validate(result), JSON.stringify(validate.errors));
  assert.equal(result.dataState, "ready");
  if (result.dataState === "ready") {
    assert.equal(result.totalCents, 75000);
    assert.equal(result.source.version, 1);
    assert.equal(result.source.sourceCapturedAt, "2026-10-23T00:00:00.000Z");
  }
  const zero = await summary(id, "0001-01");
  if (zero.dataState === "ready") assert.equal(zero.totalCents, 0);
});
test("atomic rollback on malformed imports and injected row failure; imported empty differs from absent", async () => {
  const id = await entity();
  await repo.import(identity, id, 0, input(), true);
  await assert.rejects(() =>
    repo.import(
      identity,
      id,
      1,
      input([{ ...input().invoices[0], paidCents: -1 }]),
      true,
    ),
  );
  await db.$executeRawUnsafe(
    `CREATE FUNCTION reject_receivable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic failure'; END $$`,
  );
  await db.$executeRawUnsafe(
    `CREATE TRIGGER reject_receivable BEFORE INSERT ON "ReceivableSnapshotInvoice" FOR EACH ROW EXECUTE FUNCTION reject_receivable()`,
  );
  try {
    await assert.rejects(() =>
      repo.import(identity, id, 1, { ...input(), sourceName: "B" }, true),
    );
  } finally {
    await db.$executeRawUnsafe(
      'DROP TRIGGER reject_receivable ON "ReceivableSnapshotInvoice"',
    );
    await db.$executeRawUnsafe("DROP FUNCTION reject_receivable()");
  }
  assert.equal(
    await db.receivableSnapshot.count({ where: { entityId: id } }),
    1,
  );
  await repo.import(identity, id, 1, input([]), true);
  const r = await summary(id);
  assert.equal(r.dataState, "ready");
  if (r.dataState === "ready")
    assert.deepEqual(
      [r.totalCents, r.invoiceCount, r.customerCount, r.rows],
      [0, 0, 0, []],
    );
});
test("stale/old retries and concurrent imports serialize; reads observe complete snapshots", async () => {
  const id = await entity();
  await repo.import(identity, id, 0, input(), true);
  const results = await Promise.allSettled(
    ["B", "C"].map((sourceName) =>
      repo.import(identity, id, 1, { ...input(), sourceName }, true),
    ),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  await assert.rejects(() => repo.import(identity, id, 2, input(), true));
  await assert.rejects(() =>
    repo.import(identity, id, 0, { ...input(), sourceName: "new" }, true),
  );
  const rows = Array.from({ length: 10000 }, (_, i) => ({
      ...input().invoices[0],
      invoiceId: String(i),
    })),
    importing = repo.import(
      identity,
      id,
      2,
      { ...input(rows), sourceName: "large" },
      true,
    );
  const reads = await Promise.all(Array.from({ length: 6 }, () => summary(id)));
  await importing;
  for (const r of reads) {
    assert.equal(r.dataState, "ready");
    if (r.dataState === "ready")
      assert.ok(
        (r.source.version === 2 && r.invoiceCount === 1) ||
          (r.source.version === 3 && r.invoiceCount === 10000),
      );
  }
  const final = await summary(id);
  if (final.dataState === "ready") assert.equal(final.invoiceCount, 10000);
});
test("four unchanged seed scopes, full totals before top five, grouping, deterministic ties and null names", async () => {
  const seed = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      "import {seed} from '../frontend/src/demo/seed.ts'; console.log(JSON.stringify(seed()));",
    ],
    { encoding: "utf8" },
  );
  assert.equal(seed.status, 0, seed.stderr);
  const s = JSON.parse(seed.stdout);
  for (const [key, all, month, count, customers] of [
    ["us", 14217000, 2700500, 30, 14],
    ["uk", 2909550, 526300, 6, 6],
  ] as const) {
    const id = await entity();
    const rows = s.invoices
      .filter((i: any) => i.entity === key)
      .map((i: any) => ({
        invoiceId: i.id,
        customerId: i.customer,
        customerName: s.customers.find((c: any) => c.id === i.customer).name,
        issuedOn: i.date,
        status: i.status,
        amountCents: i.amount,
        paidCents: i.paid,
      }));
    await repo.import(identity, id, 0, input(rows), true);
    const a = await summary(id),
      b = await summary(id, "2026-09");
    assert.equal(a.dataState, "ready");
    assert.equal(b.dataState, "ready");
    if (a.dataState === "ready" && b.dataState === "ready") {
      assert.equal(a.totalCents, all);
      assert.equal(b.totalCents, month);
      assert.equal(a.invoiceCount, count);
      assert.equal(a.customerCount, customers);
      assert.equal(a.rows.length, 5);
      if (key === "us")
        assert.deepEqual(
          a.rows.map((v) => v.customerId),
          ["cus-10", "cus-9", "cus-6", "cus-11", "cus-7"],
        );
    }
  }
  const id = await entity();
  await repo.import(
    identity,
    id,
    0,
    input(
      ["z", "b", "a", "c", "d", "e"].map((c, i) => ({
        ...input().invoices[0],
        invoiceId: String(i),
        customerId: c,
        customerName: null,
      })),
    ),
    true,
  );
  const r = await summary(id);
  if (r.dataState === "ready") {
    assert.equal(r.totalCents, 450000);
    assert.equal(r.customerCount, 6);
    assert.deepEqual(
      r.rows.map((v) => v.customerId),
      ["a", "b", "c", "d", "e"],
    );
    assert.ok(r.rows.every((v) => v.customerName === null));
  }
});
test("safe exact aggregate overflow returns unavailable rather than zero", async () => {
  const id = await entity();
  await repo.import(
    identity,
    id,
    0,
    input(
      [1, 2].map((i) => ({
        ...input().invoices[0],
        invoiceId: String(i),
        amountCents: Number.MAX_SAFE_INTEGER,
        paidCents: 0,
        status: "Issued",
      })),
    ),
    true,
  );
  await assert.rejects(
    () => summary(id),
    (e) => (e as any).status === 503,
  );
  assert.equal(
    (
      await request(
        `/api/v1/receivables/outstanding-customers?entityId=${id}&period=all`,
      )
    ).status,
    503,
  );
});
test("strict HTTP query, permission isolation, read-only access, inactive membership and restart persistence", async () => {
  const path = `/api/v1/receivables/outstanding-customers?entityId=${LOCAL.entityId}&period=all`;
  for (const suffix of [
    "&period=all",
    "&entityId=" + LOCAL.entityId,
    "&tenant=x",
  ])
    assert.equal((await request(path + suffix)).status, 422);
  for (const p of ["0000-01", "2026-13", "2026-1", "x"])
    assert.equal((await request(path.replace("all", p))).status, 422);
  assert.equal((await request(path.replace(LOCAL.entityId, "us"))).status, 422);
  const hidden = await entity();
  await db.entityAccess.delete({
    where: {
      organisationId_userId_entityId: { ...identity, entityId: hidden },
    },
  });
  assert.equal(
    (await request(path.replace(LOCAL.entityId, hidden))).status,
    404,
  );
  const id = await entity();
  await repo.import(identity, id, 0, input(), true);
  const r = await request(path.replace(LOCAL.entityId, id));
  assert.equal(r.status, 200);
  assert.ok(validate(r.data));
  await app.close();
  app = await createApplication({ env, quiet: true });
  apps.push(app);
  base = await app.getUrl();
  assert.deepEqual(
    (await request(path.replace(LOCAL.entityId, id))).data,
    r.data,
  );
  const reader = randomUUID();
  await db.user.create({ data: { id: reader } });
  await db.membership.create({
    data: { organisationId: identity.organisationId, userId: reader },
  });
  await db.entityAccess.create({
    data: {
      organisationId: identity.organisationId,
      userId: reader,
      entityId: id,
      canWrite: false,
    },
  });
  const ri = { organisationId: identity.organisationId, userId: reader };
  assert.equal(
    (await repo.summary(ri, { entityId: id, period: "all" })).dataState,
    "ready",
  );
  await assert.rejects(
    () => repo.import(ri, id, 1, input([]), true),
    (e) => (e as any).status === 403,
  );
  await db.membership.update({
    where: { organisationId_userId: ri },
    data: { active: false },
  });
  await assert.rejects(() => repo.summary(ri, { entityId: id, period: "all" }));
  const org = randomUUID(),
    user = randomUUID();
  await db.organisation.create({ data: { id: org, name: "Foreign" } });
  await db.user.create({ data: { id: user } });
  await db.membership.create({ data: { organisationId: org, userId: user } });
  await assert.rejects(() =>
    repo.summary(
      { organisationId: org, userId: user },
      { entityId: id, period: "all" },
    ),
  );
});
test("sessions deny anonymous/expired/revoked/disabled/inactive access; trusted proxy and origin retained", async () => {
  const token = randomBytes(32).toString("hex"),
    proxy = randomBytes(32).toString("hex");
  await db.account.create({
    data: {
      userId: identity.userId,
      username: "receivables-test",
      passwordHash: "unused-session-fixture",
    },
  });
  const server = await createApplication({
    env: {
      ...env,
      CHECKLIST_IDENTITY: "session",
      PUBLIC_ORIGIN: "https://frontend.example",
      API_TRUSTED_HOST: "backend.example",
      API_PROXY_TOKEN: proxy,
    },
    quiet: true,
  });
  apps.push(server);
  const origin = await server.getUrl();
  const headers = {
      Host: "backend.example",
      "x-finai-proxy-token": proxy,
      "x-finai-public-host": "frontend.example",
      "x-forwarded-proto": "https",
      Cookie: `__Host-finai_session=${token}`,
    },
    path = `/api/v1/receivables/outstanding-customers?entityId=${LOCAL.entityId}&period=all`;
  assert.equal((await request(path, headers, origin)).status, 401);
  await db.session.create({
    data: {
      tokenHash: digest(token),
      csrfHash: digest("csrf"),
      ...identity,
      expiresAt: new Date(Date.now() + 60000),
    },
  });
  assert.equal((await request(path, headers, origin)).status, 200);
  const hostileHeaders: Record<string, string>[] = [
    { Host: "evil.example" },
    { Origin: "https://evil.example" },
    { "x-user": "spoof" },
    { "x-finai-proxy-token": "wrong" },
  ];
  for (const patch of hostileHeaders)
    assert.equal(
      (await request(path, { ...headers, ...patch }, origin)).status,
      403,
    );
  await db.session.update({
    where: { tokenHash: digest(token) },
    data: { expiresAt: new Date(0) },
  });
  assert.equal((await request(path, headers, origin)).status, 401);
  await db.session.update({
    where: { tokenHash: digest(token) },
    data: { expiresAt: new Date(Date.now() + 60000) },
  });
  await db.membership.update({
    where: { organisationId_userId: identity },
    data: { active: false },
  });
  assert.equal((await request(path, headers, origin)).status, 401);
  await db.membership.update({
    where: { organisationId_userId: identity },
    data: { active: true },
  });
  await db.account.update({
    where: { userId: identity.userId },
    data: { disabled: true },
  });
  assert.equal((await request(path, headers, origin)).status, 401);
  await db.account.update({
    where: { userId: identity.userId },
    data: { disabled: false },
  });
  await db.session.delete({ where: { tokenHash: digest(token) } });
  assert.equal((await request(path, headers, origin)).status, 401);
});
test("missing feature table fails readiness and read explicitly", async () => {
  await db.$executeRawUnsafe(
    'ALTER TABLE "ReceivableSnapshot" RENAME TO "MissingSnapshot"',
  );
  try {
    assert.equal((await request("/health/ready")).status, 503);
    assert.equal(
      (
        await request(
          `/api/v1/receivables/outstanding-customers?entityId=${LOCAL.entityId}&period=all`,
        )
      ).status,
      503,
    );
  } finally {
    await db.$executeRawUnsafe(
      'ALTER TABLE "MissingSnapshot" RENAME TO "ReceivableSnapshot"',
    );
  }
  assert.equal((await request("/health/ready")).status, 200);
});

test("database outage returns safe JSON unavailable for the receivables route", async () => {
  const saved = process.env.DATABASE_URL;
  process.env.DATABASE_URL =
    "postgresql://unavailable:unavailable@127.0.0.1:1/unavailable?connect_timeout=1";
  let down: INestApplication;
  try {
    down = await createApplication({ env, quiet: true });
    apps.push(down);
  } finally {
    process.env.DATABASE_URL = saved;
  }
  const origin = await down!.getUrl();
  const r = await request(
    `/api/v1/receivables/outstanding-customers?entityId=${LOCAL.entityId}&period=all`,
    {},
    origin,
  );
  assert.equal(r.status, 503);
  assert.ok(!JSON.stringify(r.data).includes("postgresql"));
  assert.equal((await request("/health/ready", {}, origin)).status, 503);
});
