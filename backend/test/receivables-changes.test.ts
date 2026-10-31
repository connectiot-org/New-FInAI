import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { PrismaClient } from "@prisma/client";
import Ajv from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { parse as yaml } from "yaml";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/app";
import { Database } from "../src/database";
import { ReceivablesRepository } from "../src/receivables/repository";
import { LOCAL } from "../src/config";
import { digest } from "../src/auth";

const initial = process.env.DATABASE_URL!;
assert.ok(["localhost", "127.0.0.1"].includes(new URL(initial).hostname));
const schema = "changes_" + randomUUID().replaceAll("-", ""),
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
};
const identity = { organisationId: LOCAL.organisationId, userId: LOCAL.userId };
let db: Database,
  repo: ReceivablesRepository,
  app: INestApplication,
  base: string;
const apps: INestApplication[] = [];
const spec = yaml(
    readFileSync("../contracts/receivables-detail.openapi.yaml", "utf8"),
  ),
  ajv = new Ajv({ strict: false });
addFormats(ajv);
const validate = ajv.compile({
  ...spec.components.schemas.Changes,
  components: spec.components,
});
before(async () => {
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  process.env.DATABASE_URL = env.DATABASE_URL;
  for (const args of [
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    ["--import", "tsx", "prisma/seed.ts"],
  ]) {
    const r = spawnSync(process.execPath, args, { env, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
  }
  app = await createApplication({ env, quiet: true });
  apps.push(app);
  db = app.get(Database);
  repo = app.get(ReceivablesRepository);
  base = await app.getUrl();
});
after(async () => {
  for (const a of apps) await a.close();
  await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
  await admin.$disconnect();
});
async function entity() {
  const id = randomUUID();
  await db.entity.create({
    data: {
      id,
      organisationId: identity.organisationId,
      name: "Synthetic comparison entity",
    },
  });
  await db.entityAccess.create({
    data: { ...identity, entityId: id, canWrite: true, canImport: true },
  });
  return id;
}
const invoice = (
  invoiceId: string,
  amountCents: number,
  status = "Issued",
  paidCents = 0,
) => ({
  invoiceId,
  customerId: "C-1",
  customerName: "Synthetic customer",
  issuedOn: "2026-09-01",
  status,
  amountCents,
  paidCents,
});
const fixture = () => [
  invoice("INV-001", 100000),
  invoice("INV-002", 30000),
  invoice("INV-003", 50000),
  invoice("INV-004", 10000, "Paid", 10000),
  invoice("INV-005", 75000),
];
async function save(
  entityId: string,
  invoices: ReturnType<typeof fixture>,
  expected: number,
  captured = "2026-10-23T00:00:00Z",
) {
  await repo.import(
    identity,
    entityId,
    expected,
    {
      schemaVersion: 1,
      currency: "USD",
      sourceName: "Synthetic comparison " + expected,
      sourceCapturedAt: captured,
      completeRegister: true,
      invoices,
    },
    true,
  );
  return (
    await db.receivableSnapshot.findFirstOrThrow({
      where: { entityId, version: expected + 1 },
    })
  ).id;
}
async function get(
  entityId: string,
  from: string,
  to: string,
  extra = "",
  headers: Record<string, string> = {},
  origin = base,
) {
  return new Promise<{ status: number; data: any }>((resolve, reject) => {
    const req = httpRequest(
      `${origin}/api/v1/receivables/changes?entityId=${entityId}&fromSnapshotId=${from}&toSnapshotId=${to}${extra}`,
      { headers },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("error", reject);
        res.on("end", () => {
          try {
            const data = JSON.parse(body);
            assert.ok(res.headers["x-request-id"]);
            assert.equal(res.headers["cache-control"], "no-store");
            if (res.statusCode === 200)
              assert.equal(
                validate(data),
                true,
                JSON.stringify(validate.errors),
              );
            resolve({ status: res.statusCode!, data });
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}
function reconciles(v: any) {
  assert.equal(
    BigInt(v.laterOutstandingCents) - BigInt(v.earlierOutstandingCents),
    BigInt(v.deltaCents),
  );
  assert.equal(
    Object.values(v.bridge).reduce<bigint>(
      (s, n) => s + BigInt(n as string),
      0n,
    ),
    BigInt(v.deltaCents),
  );
  if (v.offset === 0 && v.nextOffset === null)
    assert.equal(
      v.items.reduce((s: bigint, r: any) => s + BigInt(r.deltaCents), 0n),
      BigInt(v.deltaCents),
    );
}
test("basic and mixed import comparisons reconcile exact full totals before changed-row paging, without writes", async () => {
  const id = await entity(),
    a = await save(id, fixture(), 0),
    basic = fixture();
  basic[0].paidCents = 40000;
  basic[0].status = "Partial";
  const b = await save(id, basic, 1),
    first = await get(id, a, b);
  assert.equal(first.status, 200);
  assert.deepEqual(
    [
      first.data.earlierOutstandingCents,
      first.data.laterOutstandingCents,
      first.data.deltaCents,
      first.data.changedInvoiceCount,
    ],
    ["255000", "215000", "-40000", 1],
  );
  assert.deepEqual(first.data.items[0].changedFields, ["status", "paidCents"]);
  assert.equal(first.data.items[0].earlier.paidCents, "0");
  assert.equal(first.data.items[0].later.paidCents, "40000");
  reconciles(first.data);
  const mixed = basic.filter((r) => r.invoiceId !== "INV-003");
  mixed[1].amountCents += 10000;
  mixed.find((r) => r.invoiceId === "INV-005")!.status = "Draft";
  mixed.push(invoice("INV-006", 20000));
  const c = await save(id, mixed, 2),
    counts = [
      await db.receivableSnapshot.count(),
      await db.receivableSnapshotInvoice.count(),
      await db.serverAudit.count(),
    ];
  const full = (await get(id, a, c)).data;
  reconciles(full);
  assert.deepEqual(
    [
      full.earlierOutstandingCents,
      full.laterOutstandingCents,
      full.deltaCents,
      full.changedInvoiceCount,
      full.unionInvoiceCount,
    ],
    ["255000", "120000", "-135000", 5, 6],
  );
  assert.deepEqual(full.bridge, {
    newInLaterCents: "20000",
    absentFromLaterCents: "-50000",
    increasedCents: "10000",
    decreasedCents: "-115000",
  });
  assert.equal(
    full.items.find((r: any) => r.invoiceId === "INV-003").later,
    null,
  );
  assert.equal(
    full.items.find((r: any) => r.invoiceId === "INV-006").earlier,
    null,
  );
  for (let offset = 0; offset < 5; offset++) {
    const p = (await get(id, a, c, `&offset=${offset}&limit=1`)).data;
    assert.equal(p.deltaCents, full.deltaCents);
    assert.equal(p.changedInvoiceCount, 5);
    assert.deepEqual(p.bridge, full.bridge);
    assert.equal(p.items[0].invoiceId, full.items[offset].invoiceId);
    assert.equal(p.nextOffset, offset < 4 ? offset + 1 : null);
  }
  assert.deepEqual(
    [
      await db.receivableSnapshot.count(),
      await db.receivableSnapshotInvoice.count(),
      await db.serverAudit.count(),
    ],
    counts,
  );
  // A newer source cannot change explicit A/B, even if snapshot history changes.
  assert.deepEqual((await get(id, a, b)).data, first.data);
});
test("metadata-only, paid and Draft changes, exact IDs, identical sources and backward capture cutoffs", async () => {
  const id = await entity(),
    a = await save(id, fixture(), 0),
    rows = fixture();
  rows[0].issuedOn = "2026-08-01";
  rows[0].customerId = "Corrected-C";
  rows[0].customerName = "Corrected customer";
  const b = await save(id, rows, 1, "2026-10-22T00:00:00Z"),
    v = (await get(id, a, b)).data;
  assert.equal(v.sourceCutoffReversed, true);
  assert.equal(v.deltaCents, "0");
  assert.equal(v.changedInvoiceCount, 1);
  assert.deepEqual(v.items[0].changedFields, [
    "customerId",
    "customerName",
    "issuedOn",
  ]);
  assert.deepEqual(v.items[0].flags, []);
  reconciles(v);
  const same = (await get(id, a, a)).data;
  assert.equal(same.changedInvoiceCount, 0);
  assert.equal(same.unionInvoiceCount, 5);
  reconciles(same);
  rows[0].invoiceId = "INV-NEW-ID";
  rows[3].issuedOn = "2026-08-01";
  const c = await save(id, rows, 2),
    changed = (await get(id, b, c)).data;
  assert.equal(changed.changedInvoiceCount, 3);
  assert.equal(changed.deltaCents, "0");
  assert.deepEqual(
    changed.items.find((r: any) => r.invoiceId === "INV-001").flags,
    ["absent_from_later", "outstanding_decreased"],
  );
  assert.equal(
    changed.items.find((r: any) => r.invoiceId === "INV-004").deltaCents,
    "0",
  );
  reconciles(changed);
  assert.equal((await get(id, b, a)).status, 422);
});
test("strict inputs, same-entity source authorization, foreign organisation and revoked read access", async () => {
  const id = await entity(),
    other = await entity(),
    a = await save(id, fixture(), 0),
    b = await save(other, fixture(), 0);
  for (const suffix of [
    "&limit=0",
    "&limit=51",
    "&offset=20001",
    "&offset=-1",
    "&offset=1.5",
    "&limit=1&limit=2",
    "&period=all",
    "&organisationId=" + identity.organisationId,
  ])
    assert.equal((await get(id, a, a, suffix)).status, 422, suffix);
  assert.equal((await get(id, "not-a-uuid", a)).status, 422);
  const missing = await get(id, a, randomUUID()),
    foreign = await get(id, a, b);
  assert.equal(foreign.status, 404);
  assert.equal(missing.status, 404);
  assert.equal(foreign.data.message, missing.data.message);
  const foreignOrg = randomUUID(),
    foreignEntity = randomUUID(),
    foreignSource = randomUUID();
  await db.organisation.create({
    data: { id: foreignOrg, name: "Foreign synthetic organisation" },
  });
  await db.entity.create({
    data: {
      id: foreignEntity,
      organisationId: foreignOrg,
      name: "Foreign entity",
    },
  });
  await db.receivableSnapshot.create({
    data: {
      id: foreignSource,
      organisationId: foreignOrg,
      entityId: foreignEntity,
      version: 1,
      sourceName: "Do not disclose",
      sourceCapturedAt: new Date(),
      importingActorId: identity.userId,
      digest: "f".repeat(64),
      rowCount: 0,
    },
  });
  assert.equal((await get(id, a, foreignSource)).status, 404);
  await db.entityAccess.update({
    where: { organisationId_userId_entityId: { ...identity, entityId: id } },
    data: { canWrite: false, canImport: false },
  });
  assert.equal((await get(id, a, a)).status, 200);
  await db.entityAccess.delete({
    where: { organisationId_userId_entityId: { ...identity, entityId: id } },
  });
  assert.equal((await get(id, a, a)).status, 404);
});
test("20000 disjoint IDs, empty sources, exact overflow totals and database C ordering", async () => {
  const id = await entity(),
    amount = Number.MAX_SAFE_INTEGER;
  const rows = (prefix: string) =>
    Array.from({ length: 10000 }, (_, i) =>
      invoice(prefix + String(i).padStart(5, "0"), amount),
    );
  const a = await save(id, rows("A"), 0),
    b = await save(id, rows("z"), 1);
  const first = (await get(id, a, b, "&limit=1")).data,
    last = (await get(id, a, b, "&offset=19999&limit=1")).data;
  assert.equal(first.unionInvoiceCount, 20000);
  assert.equal(first.changedInvoiceCount, 20000);
  assert.equal(first.earlierOutstandingCents, "90071992547409910000");
  assert.equal(first.deltaCents, "0");
  assert.equal(first.items[0].invoiceId, "A00000");
  assert.equal(last.items[0].invoiceId, "z09999");
  assert.equal(last.nextOffset, null);
  assert.deepEqual(last.bridge, first.bridge);
  reconciles(first);
  const empty = await save(id, [], 2),
    v = (await get(id, b, empty)).data;
  assert.equal(v.laterOutstandingCents, "0");
  assert.equal(v.deltaCents, "-90071992547409910000");
  reconciles(v);
  const e = await entity(),
    x = await save(
      e,
      [invoice("é", 1), invoice("Z", 1), invoice("a", 1), invoice("😀", 1)],
      0,
    ),
    y = await save(e, [], 1);
  assert.deepEqual(
    (await get(e, x, y)).data.items.map((r: any) => r.invoiceId),
    ["Z", "a", "é", "😀"],
  );
});
test("session endpoint denies anonymous, expired, revoked and inactive membership without disclosing sources", async () => {
  const id = await entity(),
    a = await save(id, fixture(), 0),
    token = randomBytes(32).toString("hex"),
    proxy = randomBytes(32).toString("hex");
  await db.account.create({
    data: {
      userId: identity.userId,
      username: "changes-test",
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
  const origin = await server.getUrl(),
    headers = {
      Host: "backend.example",
      "x-finai-proxy-token": proxy,
      "x-finai-public-host": "frontend.example",
      "x-forwarded-proto": "https",
      Cookie: `__Host-finai_session=${token}`,
    };
  assert.equal((await get(id, a, a, "", headers, origin)).status, 401);
  await db.session.create({
    data: {
      tokenHash: digest(token),
      csrfHash: digest("csrf"),
      ...identity,
      expiresAt: new Date(Date.now() + 60000),
    },
  });
  assert.equal((await get(id, a, a, "", headers, origin)).status, 200);
  await db.membership.update({
    where: { organisationId_userId: identity },
    data: { active: false },
  });
  assert.equal((await get(id, a, a, "", headers, origin)).status, 401);
  await db.membership.update({
    where: { organisationId_userId: identity },
    data: { active: true },
  });
  await db.session.update({
    where: { tokenHash: digest(token) },
    data: { expiresAt: new Date(0) },
  });
  assert.equal((await get(id, a, a, "", headers, origin)).status, 401);
  await db.session.delete({ where: { tokenHash: digest(token) } });
  assert.equal((await get(id, a, a, "", headers, origin)).status, 401);
});
