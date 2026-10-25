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
const workspaceSpec = yaml(
  readFileSync("../contracts/workspace.openapi.yaml", "utf8"),
);
function matchesWorkspace(name: string, value: unknown) {
  const validator = ajv.compile({
    ...workspaceSpec.components.schemas[name],
    components: workspaceSpec.components,
  });
  assert.equal(
    validator(JSON.parse(JSON.stringify(value))),
    true,
    JSON.stringify(validator.errors),
  );
}
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
    data: { ...identity, entityId: id, canWrite: true, canImport: true },
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

test("pinned detail pages, customer/issue-period reports and exact export reconcile across newer imports", async () => {
  const id = await entity();
  const source = input(
    Array.from({ length: 7 }, (_, i) => ({
      ...input().invoices[0],
      invoiceId: `invoice-${i}`,
      customerId: `customer-${i}`,
      customerName: `Customer ${i}`,
      issuedOn: i === 0 ? "2026-08-01" : "2026-09-01",
      amountCents: 10000 + i,
      paidCents: 0,
      status: "Issued",
    })),
  );
  const root = `/api/v1/receivables/`,
    history = () => request(root + `snapshots?entityId=${id}`);
  assert.equal((await history()).data.items.length, 0);
  await repo.import(identity, id, 0, source, true);
  const snapshot = (await history()).data.items[0];
  const scope = `entityId=${id}&snapshotId=${snapshot.snapshotId}&period=all`,
    first = await request(root + "invoices?" + scope + "&limit=3");
  assert.equal(first.status, 200);
  assert.equal(first.data.total, 7);
  assert.equal(first.data.invoiceCount, 7);
  assert.equal(first.data.items.length, 3);
  assert.equal(first.data.nextOffset, 3);
  assert.equal(first.data.remainingCents, 70021);
  assert.equal(first.data.source.snapshotId, snapshot.snapshotId);
  await repo.import(
    identity,
    id,
    1,
    {
      ...source,
      sourceName: "New complete source",
      invoices: source.invoices.map((v) => ({
        ...v,
        paidCents: 5000,
        status: "Partial",
      })),
    },
    true,
  );
  const second = await request(
    root + "invoices?" + scope + "&limit=3&offset=3",
  );
  assert.equal(second.data.source.version, 1);
  assert.equal(second.data.remainingCents, 70021);
  assert.equal(second.data.items[0].invoiceId, "invoice-3");
  assert.equal((await history()).data.items[0].version, 2);
  const customers = await request(root + "customers?" + scope + "&limit=5");
  assert.equal(customers.data.total, 7);
  assert.equal(customers.data.remainingCents, 70021);
  assert.equal(customers.data.items.length, 5);
  assert.equal(customers.data.items[0].customerId, "customer-6");
  const periods = await request(root + "issue-periods?" + scope);
  assert.deepEqual(
    periods.data.items.map((v: any) => [
      v.period,
      v.invoiceCount,
      v.remainingCents,
    ]),
    [
      ["2026-08", 1, 10000],
      ["2026-09", 6, 60021],
    ],
  );
  const filtered = await request(
    root + "invoices?" + scope + "&customerId=customer-1&period=all",
  );
  assert.equal(filtered.status, 422);
  const one = await request(
    root + "invoices?" + scope + "&customerId=customer-1",
  );
  assert.equal(one.data.total, 1);
  assert.equal(one.data.items[0].remainingCents, 10001);
  const exported = await request(root + "export?" + scope);
  assert.equal(exported.status, 200);
  assert.equal(exported.data.items.length, 7);
  assert.equal(exported.data.nextOffset, null);
  assert.equal(exported.data.limit, 10000);
  assert.equal(
    exported.data.items.reduce((n: number, r: any) => n + r.remainingCents, 0),
    exported.data.remainingCents,
  );
  assert.equal(
    (await request(root + "invoices?" + scope + "&search=%25")).data.total,
    0,
  );
});
test("detail scope, export bounds, foreign/missing snapshot IDs and read-only authorization fail safely", async () => {
  const id = await entity(),
    other = await entity();
  await repo.import(identity, id, 0, input(), true);
  const h = await request(`/api/v1/receivables/snapshots?entityId=${id}`),
    snapshot = h.data.items[0].snapshotId;
  const path = `/api/v1/receivables/invoices?entityId=${id}&snapshotId=${snapshot}&period=all`;
  for (const suffix of [
    "&limit=51",
    "&offset=10001",
    "&search=" + "a".repeat(101),
    "&sort=amount",
    "&period=all",
    "&status=bogus",
  ])
    assert.equal((await request(path + suffix)).status, 422);
  const foreign = await request(path.replace(id, other)),
    absent = await request(path.replace(snapshot, randomUUID()));
  assert.equal(foreign.status, 404);
  assert.equal(absent.status, 404);
  assert.equal(foreign.data.message, absent.data.message);
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
  const server = await createApplication({
    env,
    identity: { organisationId: identity.organisationId, userId: reader },
    quiet: true,
  });
  apps.push(server);
  const r = await request(path, {}, await server.getUrl());
  assert.equal(r.status, 200);
  assert.equal(
    (
      await request(
        path.replace("invoices", "export"),
        {},
        await server.getUrl(),
      )
    ).status,
    200,
  );
  await db.membership.update({
    where: {
      organisationId_userId: {
        organisationId: identity.organisationId,
        userId: reader,
      },
    },
    data: { active: false },
  });
  assert.equal((await request(path, {}, await server.getUrl())).status, 401);
});

test("workspace administration scopes roles, prevents lockout and stale regrant, revokes sessions and audits atomically", async () => {
  const { WorkspaceService } = await import("../src/workspace/service");
  const service = new WorkspaceService(db),
    id = await entity();
  const memberKey = { organisationId_userId: identity };
  await db.account.upsert({
    where: { userId: identity.userId },
    create: {
      userId: identity.userId,
      username: "workspace-admin-test",
      passwordHash: "not-used",
    },
    update: { disabled: false },
  });
  await db.membership.update({
    where: memberKey,
    data: { isAdministrator: true },
  });
  matchesWorkspace("Context", await service.context(identity));
  assert.equal((await service.context(identity)).administrator, true);
  await assert.rejects(
    service.member(identity, identity.userId, {
      active: false,
      administrator: false,
      expectedVersion: 1,
    }),
    (e: any) => e.code === "LAST_ADMINISTRATOR",
  );
  const userId = randomUUID();
  await db.user.create({ data: { id: userId } });
  await db.membership.create({
    data: { organisationId: identity.organisationId, userId },
  });
  const reader = { organisationId: identity.organisationId, userId };
  await assert.rejects(
    service.list(reader, "members", 0, 20),
    (e: any) => e.status === 403,
  );
  const grant = {
    userId,
    entityId: id,
    access: true,
    canWrite: false,
    canImport: true,
    expectedVersion: 1,
  };
  await db.account.create({
    data: { userId, username: "revoked-" + userId, passwordHash: "not-used" },
  });
  const revokedToken = randomBytes(32).toString("hex");
  await db.session.create({
    data: {
      tokenHash: digest(revokedToken),
      csrfHash: digest("csrf"),
      ...reader,
      expiresAt: new Date(Date.now() + 60000),
    },
  });
  const g = await service.access(identity, grant);
  matchesWorkspace("AccessResult", g);
  assert.equal(await db.session.count({ where: { userId } }), 0);
  assert.equal(g.version, 2);
  await service.access(identity, {
    ...grant,
    access: false,
    expectedVersion: 2,
  });
  await assert.rejects(
    service.access(identity, grant),
    (e: any) => e.status === 409,
  );
  await service.access(identity, { ...grant, expectedVersion: 3 });
  const ctx = await service.context(reader);
  assert.equal(ctx.entities[0].canImport, true);
  assert.equal(ctx.entities[0].canWrite, false);
  const importEntity = await service.entity(
    identity,
    "Importer-only permission fixture",
  );
  await service.access(identity, {
    ...grant,
    entityId: importEntity.id,
    expectedVersion: 4,
  });
  assert.equal(
    (await repo.import(reader, importEntity.id, 0, input(), true)).status,
    "imported",
  );
  await assert.rejects(
    new ChecklistRepository(db).create(reader, {
      id: randomUUID(),
      entityId: importEntity.id,
      month: "2026-09",
      title: "Forbidden write",
    }),
    (e: any) => e.status === 403,
  );

  for (const [kind, schemaName] of [
    ["audit", "Audit"],
    ["members", "Members"],
    ["entities", "Entities"],
  ] as const)
    matchesWorkspace(schemaName, await service.list(identity, kind, 0, 50));
  assert.ok((await service.list(identity, "audit", 0, 50)).items.length);
  const old = await db.entity.count();
  await db.$executeRawUnsafe(
    `ALTER TABLE "ServerAudit" ADD CONSTRAINT test_audit_failure CHECK (action <> 'access.entity_created') NOT VALID`,
  );
  try {
    await assert.rejects(service.entity(identity, "Must roll back"));
    assert.equal(await db.entity.count(), old);
  } finally {
    await db.$executeRawUnsafe(
      `ALTER TABLE "ServerAudit" DROP CONSTRAINT test_audit_failure`,
    );
  }
});

test("staged browser imports pin actor/session/digest, preview no snapshots, stale/retry/expiry and audit rollback", async () => {
  const { ReceivablesImportService } =
    await import("../src/receivables/import.service");
  const service = new ReceivablesImportService(db, repo),
    id = await entity(),
    hash = "a".repeat(64);
  const preview = await service.preview(
    identity,
    hash,
    id,
    0,
    Buffer.from(JSON.stringify(input())),
  );
  assert.equal(
    await db.receivableSnapshot.count({ where: { entityId: id } }),
    0,
  );
  matchesWorkspace("Preview", preview);
  assert.equal(preview.totalCents, 75000);
  const confirm = { expectedVersion: 0, confirmDigest: preview.digest };
  await assert.rejects(
    service.apply(identity, "b".repeat(64), preview.stageId, confirm),
    (e: any) => e.status === 404,
  );
  await assert.rejects(
    service.apply(identity, hash, preview.stageId, {
      ...confirm,
      confirmDigest: "0".repeat(64),
    }),
    (e: any) => e.status === 409,
  );
  await db.$executeRawUnsafe(
    `ALTER TABLE "ServerAudit" ADD CONSTRAINT test_apply_failure CHECK (action <> 'receivables.preview_applied')`,
  );
  try {
    await assert.rejects(
      service.apply(identity, hash, preview.stageId, confirm),
    );
    assert.equal(
      await db.receivableSnapshot.count({ where: { entityId: id } }),
      0,
    );
  } finally {
    await db.$executeRawUnsafe(
      `ALTER TABLE "ServerAudit" DROP CONSTRAINT test_apply_failure`,
    );
  }
  assert.equal(
    (await service.apply(identity, hash, preview.stageId, confirm)).status,
    "imported",
  );
  assert.equal(
    (await service.apply(identity, hash, preview.stageId, confirm)).status,
    "unchanged",
  );
  assert.equal(
    (
      await db.receivableImportStage.findUniqueOrThrow({
        where: { id: preview.stageId },
      })
    ).content.length,
    0,
  );
  const b = { ...input(), sourceName: "Next synthetic source" };
  await repo.import(identity, id, 1, b, true);
  await assert.rejects(
    service.apply(identity, hash, preview.stageId, confirm),
    (e: any) => e.status === 409,
  );
  const next = await service.preview(
    identity,
    hash,
    id,
    2,
    Buffer.from(JSON.stringify({ ...b, sourceName: "Third source" })),
  );
  await db.receivableImportStage.update({
    where: { id: next.stageId },
    data: { expiresAt: new Date(0) },
  });
  await assert.rejects(
    service.apply(identity, hash, next.stageId, {
      expectedVersion: 2,
      confirmDigest: next.digest,
    }),
    (e: any) => e.status === 404,
  );
  await assert.rejects(
    service.preview(identity, hash, id, 2, Buffer.alloc(1048577)),
    (e: any) => e.status === 422,
  );
  const audit = await db.serverAudit.findMany({ where: { entityId: id } });
  assert.ok(audit.length >= 3);
  assert.ok(!JSON.stringify(audit).includes("Synthetic export"));
});

test("raw preview HTTP authenticates before parsing, retains ordinary cap, rejects compression and revocation", async () => {
  const id = await entity(),
    token = randomBytes(32).toString("hex"),
    proxy = randomBytes(32).toString("hex"),
    csrf = "test-csrf";
  await db.session.create({
    data: {
      tokenHash: digest(token),
      csrfHash: digest(csrf),
      ...identity,
      expiresAt: new Date(Date.now() + 60000),
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
    Origin: "https://frontend.example",
    "X-CSRF-Token": csrf,
    "Content-Type": "application/octet-stream",
  };
  const post = (
    path: string,
    body: Buffer,
    patch: Record<string, string> = {},
  ) =>
    new Promise<{ status: number; data: any }>((resolve, reject) => {
      const req = httpRequest(
        origin + path,
        { method: "POST", headers: { ...headers, ...patch } },
        (res) => {
          let text = "";
          res.on("data", (c) => (text += c));
          res.on("end", () =>
            resolve({ status: res.statusCode!, data: JSON.parse(text) }),
          );
        },
      );
      req.on("error", reject);
      req.end(body);
    });
  const path = `/api/v1/receivables/imports/preview?entityId=${id}&expectedVersion=0`,
    bytes = Buffer.from(JSON.stringify(input()));
  assert.equal(
    (await post(path, bytes, { "X-CSRF-Token": "wrong" })).status,
    403,
  );
  assert.equal(
    (await post(path, bytes, { "Content-Encoding": "gzip" })).status,
    403,
  );
  assert.equal((await post(path, Buffer.alloc(1048577))).status, 422);
  assert.equal(
    (
      await post(
        "/api/v1/admin/entities",
        Buffer.from(JSON.stringify({ name: "x".repeat(20000) })),
        { "Content-Type": "application/json" },
      )
    ).status,
    422,
  );
  const valid = await post(
    path,
    Buffer.from(" ".repeat(17000) + JSON.stringify(input())),
  );
  assert.equal(valid.status, 201);
  assert.equal(
    await db.receivableSnapshot.count({ where: { entityId: id } }),
    0,
  );
  await db.entityAccess.update({
    where: { organisationId_userId_entityId: { ...identity, entityId: id } },
    data: { canImport: false },
  });
  assert.equal(
    (
      await post(
        `/api/v1/receivables/imports/${valid.data.stageId}/apply`,
        Buffer.from(
          JSON.stringify({
            expectedVersion: 0,
            confirmDigest: valid.data.digest,
          }),
        ),
        { "Content-Type": "application/json" },
      )
    ).status,
    403,
  );
  assert.equal(
    await db.receivableSnapshot.count({ where: { entityId: id } }),
    0,
  );
});

test("trusted administrator recovery and cleanup default to dry run and preserve business history", async () => {
  const account = await db.account.findUniqueOrThrow({
      where: { userId: identity.userId },
    }),
    before = await db.membership.findUniqueOrThrow({
      where: { organisationId_userId: identity },
    });
  const run = (file: string, args: string[]) =>
    spawnSync(
      process.execPath,
      ["--import", "tsx", `scripts/${file}.mts`, ...args],
      {
        env: { ...process.env, DATABASE_URL: env.DATABASE_URL },
        encoding: "utf8",
      },
    );
  const args = [identity.organisationId, account.username, "--recovery"];
  assert.equal(run("workspace-admin", args).status, 0);
  assert.equal(
    (
      await db.membership.findUniqueOrThrow({
        where: { organisationId_userId: identity },
      })
    ).version,
    before.version,
  );
  const n = await db.serverAudit.count();
  assert.equal(run("workspace-admin", [...args, "--apply"]).status, 0);
  assert.equal(
    (
      await db.membership.findUniqueOrThrow({
        where: { organisationId_userId: identity },
      })
    ).version,
    before.version + 1,
  );
  assert.equal(await db.serverAudit.count(), n + 1);
  const snapshots = await db.receivableSnapshot.count(),
    events = await db.serverAudit.count(),
    expired = await db.receivableImportStage.count({
      where: { expiresAt: { lte: new Date() } },
    });
  assert.ok(expired > 0);
  assert.equal(run("cleanup", []).status, 0);
  assert.equal(
    await db.receivableImportStage.count({
      where: { expiresAt: { lte: new Date() } },
    }),
    expired,
  );
  assert.equal(run("cleanup", ["--apply"]).status, 0);
  assert.equal(
    await db.receivableImportStage.count({
      where: { expiresAt: { lte: new Date() } },
    }),
    0,
  );
  assert.equal(await db.receivableSnapshot.count(), snapshots);
  assert.equal(await db.serverAudit.count(), events);
});
