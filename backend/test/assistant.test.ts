import { before, after, test } from "node:test";
import { request as httpRequest } from "node:http";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { randomUUID, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import Ajv from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { Database } from "../src/database";
import { ChecklistRepository } from "../src/checklist.repository";
import { ReceivablesDetailRepository } from "../src/receivables/detail.repository";
import { ReceivablesRepository } from "../src/receivables/repository";
import { AssistantService } from "../src/assistant/service";
import { AssistantFacts } from "../src/assistant/facts";
import {
  OpenRouterProvider,
  type AssistantProvider,
  ProviderFailure,
} from "../src/assistant/provider";
import {
  plan,
  composition,
  create,
  send,
  preference,
} from "../src/assistant/validation";
import {
  LedgerService,
  validateLedger,
  calculateLedger,
  mappingDigest,
} from "../src/ledger/source";
import { LOCAL } from "../src/config";
import { createApplication } from "../src/app";
import { digest } from "../src/auth";
const original = process.env.DATABASE_URL!;
assert.ok(["127.0.0.1", "localhost"].includes(new URL(original).hostname));
const schema = "assistant_" + randomUUID().replaceAll("-", ""),
  url = new URL(original);
url.searchParams.set("schema", schema);
const env = {
  ...process.env,
  DATABASE_URL: url.toString(),
  NODE_ENV: "test",
  CHECKLIST_IDENTITY: "local",
  API_HOST: "127.0.0.1",
  API_PORT: "0",
  FRONTEND_ORIGINS: "http://127.0.0.1:5173",
};
const admin = new PrismaClient({ datasourceUrl: original });
let db: Database,
  acl: ChecklistRepository,
  ledger: LedgerService,
  facts: AssistantFacts,
  service: AssistantService;
const identity = { organisationId: LOCAL.organisationId, userId: LOCAL.userId };
export function fixtureLedger() {
  return {
    schemaVersion: 1,
    sourceName: "Synthetic September complete books",
    capturedAt: "2026-10-24T00:00:00Z",
    mappingId: "engineering-v1",
    basis: "accrual",
    currency: "USD",
    precision: 2,
    periodStart: "2026-09-01",
    periodEnd: "2026-09-30",
    completePostedRegister: true,
    accounts: [
      ["bank", "cash", "debit", "100000", "0"],
      ["ar", "receivable", "debit", "0", "0"],
      ["equity", "equity", "credit", "0", "100000"],
      ["sales", "revenue", "credit", "0", "0"],
      ["cost", "expense", "debit", "0", "0"],
    ].map(([id, classification, normal, openingDebit, openingCredit]) => ({
      id,
      name: id,
      classification,
      normal,
      openingDebit,
      openingCredit,
    })),
    journals: [
      ["sale", "ar", "25000", "sales"],
      ["expense", "cost", "5000", "bank"],
      ["receipt", "bank", "10000", "ar"],
    ].map(([id, debit, amount, credit]) => ({
      id,
      date: "2026-09-10",
      status: "Posted",
      lines: [
        { id: "d", accountId: debit, debit: amount, credit: "0" },
        { id: "c", accountId: credit, debit: "0", credit: amount },
      ],
    })),
  };
}
const operation = (kind: string = "receivables", period = "current") => ({
  kind,
  period,
  customerId: null,
  accountId: null,
  metric: "all",
  reason: "none",
});
class ControlledProvider implements AssistantProvider {
  model = "controlled-provider-fixture";
  configured = true;
  dailyLimit = 10000000;
  calls = 0;
  delay = 0;
  kind = "receivables";
  bad = false;
  fail = false;
  async plan(_input: unknown, signal: AbortSignal) {
    this.calls++;
    if (this.delay)
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, this.delay);
        signal.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            reject(new ProviderFailure("CANCELLED"));
          },
          { once: true },
        );
      });
    if (this.fail) throw new ProviderFailure("PROVIDER_TIMEOUT");
    return plan.parse({ operations: [operation(this.kind)] });
  }
  async compose(input: any) {
    if (this.bad) return { factIds: ["invented"], noteIds: [] };
    return composition.parse({
      factIds: input.evidence.facts
        .slice(0, input.preference.detail === "detailed" ? 12 : 3)
        .map((f: any) => f.id),
      noteIds: Object.keys(input.evidence.notes).slice(0, 8),
    });
  }
}
const provider = new ControlledProvider();
async function entity() {
  const id = randomUUID();
  await db.entity.create({
    data: {
      id,
      organisationId: identity.organisationId,
      name: "Synthetic assistant entity",
    },
  });
  await db.entityAccess.create({
    data: { ...identity, entityId: id, canWrite: true, canImport: true },
  });
  return id;
}
async function chat(entityId: string = LOCAL.entityId) {
  return service.create(identity, {
    id: randomUUID(),
    entityId,
    month: "2026-09",
    currency: "USD",
  });
}
async function awaitTurn(id: string) {
  for (let i = 0; i < 120; i++) {
    const c = await service.read(identity, id);
    if (c.turns.at(-1)?.status !== "pending") return c;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("Synthetic provider turn did not finish");
}
const ajv = new Ajv({ strict: false });
addFormats(ajv);
const spec = JSON.parse(
  readFileSync("../contracts/assistant.schema.json", "utf8"),
);
const matches = (name: string, v: unknown) => {
  const validate = ajv.compile({ ...spec.$defs[name], $defs: spec.$defs });
  assert.equal(validate(v), true, JSON.stringify(validate.errors));
};
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
  acl = new ChecklistRepository(db);
  ledger = new LedgerService(db, acl);
  facts = new AssistantFacts(
    db,
    acl,
    new ReceivablesDetailRepository(db, acl),
    ledger,
  );
  service = new AssistantService(db, acl, facts);
  service.provider = provider;
});
after(async () => {
  service.onModuleDestroy();
  await db.$disconnect();
  await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
  await admin.$disconnect();
  process.env.DATABASE_URL = original;
});
test("complete ledger fixture reconciles exact openings/movements; drafts, bad mappings, boundaries and overflow", () => {
  const x = validateLedger(fixtureLedger()),
    r = calculateLedger(x, "2026-09");
  assert.deepEqual(r.metrics, {
    cash: "105000",
    receivable: "15000",
    revenue: "25000",
    expense: "5000",
    profit: "20000",
    assets: "120000",
    equity: "120000",
    liabilities: "0",
  });
  const openingIncome = structuredClone(x);
  openingIncome.accounts.find((a) => a.id === "bank")!.openingDebit = "110000";
  openingIncome.accounts.find((a) => a.id === "sales")!.openingCredit = "10000";
  const carried = calculateLedger(validateLedger(openingIncome), "2026-09");
  assert.equal(carried.metrics.revenue, "25000");
  assert.equal(carried.metrics.profit, "20000");
  assert.equal(carried.metrics.cash, "115000");
  const draft = structuredClone(x.journals[0]);
  draft.id = "draft";
  draft.status = "Draft";
  x.journals.push(draft);
  assert.deepEqual(calculateLedger(x, "2026-09").metrics, r.metrics);
  for (const mutate of [
    (a: any) => a.accounts.push(a.accounts[0]),
    (a: any) => (a.journals[0].lines[0].debit = "24999"),
    (a: any) => (a.accounts[0].normal = "credit"),
    (a: any) => (a.accounts[0].openingDebit = "100001"),
    (a: any) => (a.journals[0].date = "2026-08-31"),
    (a: any) => (a.accounts[0].openingDebit = 100000),
    (a: any) => (a.completePostedRegister = false),
  ]) {
    const bad = fixtureLedger();
    mutate(bad);
    assert.throws(() => validateLedger(bad));
  }
  assert.throws(() => calculateLedger(x, "2026-08"));
  const change = structuredClone(x);
  change.accounts.find((a) => a.id === "ar")!.classification = "asset";
  assert.notEqual(mappingDigest(x), mappingDigest(change));
});
test("immutable ledger import dry-run/retry/A-B/source pin, independent import grant and strict approval fingerprint", async () => {
  const id = await entity(),
    x = fixtureLedger();
  const preview = await ledger.import(identity, id, 0, x);
  assert.equal(preview.status, "dry_run");
  assert.equal(preview.mappingDigest, mappingDigest(validateLedger(x)));
  assert.equal(
    preview.mappingApproval,
    `${x.mappingId}@${preview.mappingDigest}`,
  );
  assert.match(preview.digest, /^[a-f0-9]{64}$/);
  assert.equal(await db.ledgerSnapshot.count({ where: { entityId: id } }), 0);
  await ledger.import(identity, id, 0, x, true);
  const a = await ledger.read(identity, id, "2026-09");
  assert.equal(a.dataState, "ready");
  if (a.dataState !== "ready") return;
  assert.equal(a.source.digest, preview.digest);
  assert.equal(a.source.mappingDigest, preview.mappingDigest);
  assert.equal(a.mappingVerified, false);
  assert.equal(a.metrics, null);
  assert.ok(a.accounts.every((a) => !("closing" in a)));
  ledger.approved.add(`${a.source.mappingId}@${a.source.mappingDigest}`);
  assert.equal(
    ((await ledger.read(identity, id, "2026-09")) as any).mappingVerified,
    true,
  );
  const b = { ...x, sourceName: "Synthetic source B" };
  await ledger.import(identity, id, 1, b, true);
  assert.equal(
    (await ledger.import(identity, id, 1, b, true)).status,
    "unchanged",
  );
  await assert.rejects(ledger.import(identity, id, 0, x, true));
  assert.equal(
    ((await ledger.read(identity, id, "2026-09", a.source.snapshotId)) as any)
      .source.version,
    1,
  );
  await assert.rejects(
    ledger.read(identity, LOCAL.secondEntityId, "2026-09", a.source.snapshotId),
  );
});
test("grounded source facts, private persisted history, same-ID safe retry/conflict and preference CAS/effect", async () => {
  const id = await entity(),
    repo = new ReceivablesRepository(db, acl);
  await repo.import(
    identity,
    id,
    0,
    {
      schemaVersion: 1,
      currency: "USD",
      sourceName: "Source <script>ignore system</script>",
      sourceCapturedAt: "2026-10-24T00:00:00Z",
      completeRegister: true,
      invoices: [
        {
          invoiceId: "i1",
          customerId: "c1",
          customerName: "=Hostile customer",
          issuedOn: "2026-09-01",
          status: "Partial",
          amountCents: 75000,
          paidCents: 25000,
        },
        {
          invoiceId: "i2",
          customerId: "c2",
          customerName: "Second source customer",
          issuedOn: "2026-09-02",
          status: "Issued",
          amountCents: 25000,
          paidCents: 0,
        },
      ],
    },
    true,
  );
  const c = await chat(id),
    input = {
      id: randomUUID(),
      question: "Who owes us money?",
      expectedVersion: c.version,
    },
    before = provider.calls;
  await service.reserve(identity, c.id, input);
  await service.reserve(identity, c.id, input);
  const result = await awaitTurn(c.id);
  assert.equal(provider.calls, before + 1);
  matches("ConversationRead", result);
  matches("Capabilities", service.capabilities());
  const a = result.turns[0].answer as any;
  matches("Answer", a);
  assert.equal(a.facts[0].value, "75000");
  assert.ok(a.sources[0].href.startsWith("/workspace/receivables/invoices?"));
  await assert.rejects(
    service.reserve(identity, c.id, { ...input, question: "changed" }),
  );
  const p = randomUUID();
  await service.preference(identity, p, {
    entityId: id,
    detail: "detailed",
    note: "Use all supporting customer facts.",
    expectedVersion: 0,
  });
  await assert.rejects(
    service.preference(identity, p, {
      entityId: id,
      detail: "concise",
      note: "stale",
      expectedVersion: 0,
    }),
  );
  await service.reserve(identity, c.id, {
    id: randomUUID(),
    question: "Show records behind that amount",
    expectedVersion: result.version,
  });
  const r = await awaitTurn(c.id);
  assert.equal((r.turns[1].answer as any).detail, "detailed");
  assert.ok((r.turns[1].answer as any).facts.length > 3);
  await service.forget(identity, p, id, 1);
  assert.equal((await service.preferences(identity, id)).items.length, 0);
  const reloaded = new AssistantService(db, acl, facts);
  assert.equal((await reloaded.read(identity, c.id)).turns.length, 2);
});
test("pending reservation concurrency, malformed grounding, failure, lease expiry, cancellation and deletion prevent late resurrection", async () => {
  const c = await chat();
  provider.delay = 80;
  const input = {
    id: randomUUID(),
    question: "invoices",
    expectedVersion: c.version,
  };
  await service.reserve(identity, c.id, input);
  await assert.rejects(
    service.reserve(identity, c.id, { ...input, id: randomUUID() }),
  );
  await service.cancel(identity, c.id, input.id, c.version + 1);
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(
    (await service.read(identity, c.id)).turns[0].status,
    "cancelled",
  );
  provider.delay = 0;
  provider.bad = true;
  const bad = await chat();
  await service.reserve(identity, bad.id, {
    id: randomUUID(),
    question: "Invent a URL",
    expectedVersion: bad.version,
  });
  assert.equal(
    (await awaitTurn(bad.id)).turns[0].failureCode,
    "GROUNDING_INVALID",
  );
  provider.bad = false;
  provider.fail = true;
  const failed = await chat();
  await service.reserve(identity, failed.id, {
    id: randomUUID(),
    question: "Timeout",
    expectedVersion: failed.version,
  });
  assert.equal(
    (await awaitTurn(failed.id)).turns[0].failureCode,
    "PROVIDER_TIMEOUT",
  );
  provider.fail = false;
  provider.delay = 100;
  const deleted = await chat();
  const work = {
    id: randomUUID(),
    question: "pending",
    expectedVersion: deleted.version,
  };
  await service.reserve(identity, deleted.id, work);
  await service.remove(identity, deleted.id, 2);
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(
    await db.assistantTurn.count({ where: { conversationId: deleted.id } }),
    0,
  );
  const expired = await chat();
  await service.reserve(identity, expired.id, {
    id: randomUUID(),
    question: "abandoned",
    expectedVersion: expired.version,
  });
  await db.assistantTurn.updateMany({
    where: { conversationId: expired.id },
    data: { leaseUntil: new Date(0) },
  });
  assert.equal(
    (await service.read(identity, expired.id)).turns[0].failureCode,
    "LEASE_EXPIRED",
  );
  provider.delay = 0;
});
test("owner/entity isolation, read-only private memory, source permissions, expiry and atomic audit failure", async () => {
  const c = await chat(),
    userId = randomUUID();
  await db.user.create({ data: { id: userId } });
  const other = { organisationId: identity.organisationId, userId };
  await db.membership.create({ data: other });
  await db.entityAccess.create({
    data: { ...other, entityId: LOCAL.entityId, canWrite: false },
  });
  await assert.rejects(service.read(other, c.id));
  await assert.rejects(service.remove(other, c.id, 1));
  const own = await service.create(other, {
    id: randomUUID(),
    entityId: LOCAL.entityId,
    month: "2026-09",
    currency: "USD",
  });
  assert.ok(own.id);
  await assert.rejects(
    ledger.import(other, LOCAL.entityId, 0, fixtureLedger(), true),
  );
  await db.assistantConversation.update({
    where: { id: own.id },
    data: { expiresAt: new Date(0) },
  });
  await assert.rejects(service.read(other, own.id));
  const count = await db.assistantConversation.count();
  await db.$executeRawUnsafe(
    `ALTER TABLE "ServerAudit" ADD CONSTRAINT assistant_fail CHECK(action<>'assistant.conversation_created') NOT VALID`,
  );
  try {
    await assert.rejects(chat());
    assert.equal(await db.assistantConversation.count(), count);
  } finally {
    await db.$executeRawUnsafe(
      `ALTER TABLE "ServerAudit" DROP CONSTRAINT assistant_fail`,
    );
  }
});
test("strict transport inputs and bounded model plans reject forged identity, fields and invalid dates", () => {
  for (const schema of [create, send, preference])
    assert.equal(
      schema.safeParse({ userId: identity.userId, role: "admin" }).success,
      false,
    );
  assert.equal(
    plan.safeParse({ operations: [{ ...operation(), sql: "SELECT *" }] })
      .success,
    false,
  );
  assert.equal(
    create.safeParse({
      id: randomUUID(),
      entityId: LOCAL.entityId,
      month: "0000-01",
      currency: "USD",
    }).success,
    false,
  );
});
test("provider request pins model/privacy/price/no fallback and handles refusal, malformed and credit errors", async () => {
  const e = {
    ASSISTANT_ENABLED: "true",
    OPENROUTER_API_KEY: "synthetic-secret",
    ASSISTANT_MODEL: "test/model",
    ASSISTANT_OPENROUTER_PROVIDERS: "ApprovedProvider",
    ASSISTANT_DAILY_TOKEN_LIMIT: "100000",
    ASSISTANT_MAX_INPUT_PRICE: "0",
    ASSISTANT_MAX_OUTPUT_PRICE: "0",
  };
  let mode = "good";
  const transport = (async (url: any, opts: any) => {
    assert.equal(url, "https://openrouter.ai/api/v1/chat/completions");
    assert.equal(opts.redirect, "error");
    const b = JSON.parse(opts.body);
    assert.deepEqual(b.provider.only, ["ApprovedProvider"]);
    assert.equal(b.provider.allow_fallbacks, false);
    assert.deepEqual(b.provider.max_price, { prompt: 0, completion: 0 });
    assert.equal(b.provider.data_collection, "deny");
    assert.equal(b.provider.zdr, true);
    assert.equal(b.response_format.type, "json_schema");
    if (mode === "credit")
      return new Response("private error", { status: 402 });
    return Response.json({
      model: "test/model",
      provider: "ApprovedProvider",
      choices: [
        {
          finish_reason: "stop",
          message: {
            content:
              mode === "bad"
                ? "private nonJSON"
                : JSON.stringify({ operations: [operation()] }),
            ...(mode === "refusal" ? { refusal: "private refusal" } : {}),
          },
        },
      ],
    });
  }) as typeof fetch;
  const p = new OpenRouterProvider(e, transport);
  assert.equal(p.configured, true);
  matches(
    "Plan",
    await p.plan({ question: "synthetic" }, new AbortController().signal),
  );
  for (const [m, code] of [
    ["bad", "PROVIDER_INVALID"],
    ["refusal", "PROVIDER_REFUSAL"],
    ["credit", "PROVIDER_CREDIT"],
  ]) {
    mode = m;
    await assert.rejects(
      p.plan({}, new AbortController().signal),
      (err: any) => err.code === code,
    );
  }
  assert.equal(new OpenRouterProvider({}).configured, false);
  for (const field of [
    "ASSISTANT_MAX_INPUT_PRICE",
    "ASSISTANT_MAX_OUTPUT_PRICE",
  ]) {
    for (const value of ["", "   ", "0.01", "1", "-1"])
      assert.equal(
        new OpenRouterProvider({ ...e, [field]: value }).configured,
        false,
      );
  }
  assert.equal(
    new OpenRouterProvider({
      ...e,
      ASSISTANT_MAX_INPUT_PRICE: "0",
      ASSISTANT_MAX_OUTPUT_PRICE: "0",
    }).configured,
    true,
  );
});
test("real HTTP session/CSRF/private owner guard and revocation during inference never publish", async () => {
  const key = randomBytes(32).toString("hex"),
    token = randomBytes(32).toString("hex"),
    csrf = "synthetic-csrf";
  await db.account.create({
    data: {
      userId: identity.userId,
      username: "assistant-http",
      passwordHash: "unused",
    },
  });
  await db.session.create({
    data: {
      ...identity,
      tokenHash: digest(token),
      csrfHash: digest(csrf),
      expiresAt: new Date(Date.now() + 60000),
    },
  });
  const p = new ControlledProvider();
  p.delay = 100;
  const app = await createApplication({
    env: {
      ...env,
      CHECKLIST_IDENTITY: "session",
      PUBLIC_ORIGIN: "https://frontend.example",
      API_TRUSTED_HOST: "127.0.0.1",
      API_PROXY_TOKEN: key,
    },
    assistantProvider: p,
    quiet: true,
  });
  try {
    const base = await app.getUrl(),
      headers = {
        Host: "127.0.0.1",
        "x-finai-proxy-token": key,
        "x-finai-public-host": "frontend.example",
        "x-forwarded-proto": "https",
        cookie: `__Host-finai_session=${token}`,
        origin: "https://frontend.example",
        "content-type": "application/json",
        "x-csrf-token": csrf,
      };
    const request = (
      path: string,
      body?: unknown,
      patch: Record<string, string> = {},
    ) =>
      new Promise<{ status: number }>((resolve, reject) => {
        const r = httpRequest(
          base + path,
          { method: body ? "POST" : "GET", headers: { ...headers, ...patch } },
          (response) => {
            response.resume();
            response.on("end", () => resolve({ status: response.statusCode! }));
          },
        );
        r.on("error", reject);
        r.end(body ? JSON.stringify(body) : undefined);
      });
    assert.equal(
      (
        await request(
          "/api/v1/assistant/conversations?entityId=" + LOCAL.entityId,
          undefined,
          { cookie: "" },
        )
      ).status,
      401,
    );
    const input = {
      id: randomUUID(),
      entityId: LOCAL.entityId,
      month: "2026-09",
      currency: "USD",
    };
    assert.equal(
      (
        await request("/api/v1/assistant/conversations", input, {
          "x-csrf-token": "bad",
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await request("/api/v1/assistant/conversations", {
          ...input,
          userId: randomUUID(),
        })
      ).status,
      422,
    );
    assert.equal(
      (await request("/api/v1/assistant/conversations", input)).status,
      200,
    );
    assert.equal(
      (
        await request(
          `/api/v1/assistant/source?entityId=${LOCAL.entityId}&month=2026-09&kind=checklist`,
        )
      ).status,
      200,
    );
    const sent = await request(
      `/api/v1/assistant/conversations/${input.id}/turns`,
      { id: randomUUID(), question: "private", expectedVersion: 1 },
    );
    assert.equal(sent.status, 202);
    await db.session.delete({ where: { tokenHash: digest(token) } });
    await new Promise((r) => setTimeout(r, 160));
    const row = await db.assistantTurn.findFirstOrThrow({
      where: { conversationId: input.id },
    });
    assert.notEqual(row.status, "completed");
    assert.equal(row.answer, null);
  } finally {
    await app.close();
  }
});

test("fresh grounded ledger answers use approved mapping, historical replies keep A and unsupported/comparison states stay explicit", async () => {
  const id = await entity(),
    x = fixtureLedger();
  await ledger.import(identity, id, 0, x, true);
  const normalized = validateLedger(x);
  ledger.approved.add(`${normalized.mappingId}@${mappingDigest(normalized)}`);
  provider.kind = "ledger";
  const c = await chat(id),
    pref = randomUUID();
  await service.preference(identity, pref, {
    entityId: id,
    detail: "detailed",
    note: "",
    expectedVersion: 0,
  });
  await service.reserve(identity, c.id, {
    id: randomUUID(),
    question: "cash revenue expense profit",
    expectedVersion: 1,
  });
  let r = await awaitTurn(c.id);
  assert.equal(r.turns[0].status, "completed");
  const old = r.turns[0].answer as any;
  assert.equal(
    old.facts.find((f: any) => f.label.endsWith(": cash")).value,
    "105000",
  );
  assert.equal(
    old.facts.find((f: any) => f.label.endsWith(": profit")).value,
    "20000",
  );
  const updated = fixtureLedger();
  updated.sourceName = "New complete source";
  updated.journals[0].lines[0].debit = "35000";
  updated.journals[0].lines[1].credit = "35000";
  await ledger.import(identity, id, 1, updated, true);
  await service.reserve(identity, c.id, {
    id: randomUUID(),
    question: "same source metrics again",
    expectedVersion: r.version,
  });
  r = await awaitTurn(c.id);
  assert.equal(
    (r.turns[1].answer as any).facts.find((f: any) =>
      f.label.endsWith(": profit"),
    ).value,
    "30000",
  );
  assert.equal((r.turns[0].answer as any).sources[0].version, 1);
  assert.equal((r.turns[1].answer as any).sources[0].version, 2);
  const evidence = await facts.retrieve(
    identity,
    { entityId: id, month: "2026-09", currency: "USD" },
    plan.parse({ operations: [operation("ledger", "previous")] }),
  );
  assert.equal(evidence.facts.length, 0);
  assert.ok(evidence.notes.ledger_coverage);
  ledger.approved.clear();
  const unapproved = await facts.retrieve(
    identity,
    { entityId: id, month: "2026-09", currency: "USD" },
    plan.parse({ operations: [operation("ledger")] }),
  );
  assert.equal(unapproved.facts.length, 0);
  assert.ok(unapproved.notes.unapproved_mapping);
  provider.kind = "receivables";
});
test("retention purges dependent chat turns/preferences atomically; quotas and missing configuration fail without spending", async () => {
  const c = await chat(),
    p = randomUUID();
  await service.preference(identity, p, {
    entityId: LOCAL.entityId,
    detail: "concise",
    note: "Explicit",
    expectedVersion: 0,
  });
  const calls = provider.calls;
  provider.configured = false;
  await assert.rejects(
    service.reserve(identity, c.id, {
      id: randomUUID(),
      question: "unavailable",
      expectedVersion: 1,
    }),
    (e: any) => e.code === "ASSISTANT_NOT_CONFIGURED",
  );
  assert.equal(provider.calls, calls);
  provider.configured = true;
  const limit = provider.dailyLimit;
  provider.dailyLimit = 50000;
  await assert.rejects(
    service.reserve(identity, c.id, {
      id: randomUUID(),
      question: "budget",
      expectedVersion: 1,
    }),
    (e: any) => e.code === "ASSISTANT_BUDGET",
  );
  provider.dailyLimit = limit;
  await service.reserve(identity, c.id, {
    id: randomUUID(),
    question: "saved",
    expectedVersion: 1,
  });
  await awaitTurn(c.id);
  await db.assistantConversation.update({
    where: { id: c.id },
    data: { expiresAt: new Date(0) },
  });
  await db.assistantPreference.update({
    where: { id: p },
    data: { expiresAt: new Date(0) },
  });
  assert.equal(
    (await service.preferences(identity, LOCAL.entityId)).items.length,
    0,
  );
  const run = (apply: boolean) =>
    spawnSync(
      process.execPath,
      ["--import", "tsx", "scripts/cleanup.mts", ...(apply ? ["--apply"] : [])],
      { env: { ...env }, encoding: "utf8" },
    );
  assert.equal(run(false).status, 0);
  assert.ok(await db.assistantConversation.findUnique({ where: { id: c.id } }));
  assert.equal(run(true).status, 0);
  assert.equal(
    await db.assistantConversation.findUnique({ where: { id: c.id } }),
    null,
  );
  assert.equal(
    await db.assistantTurn.count({ where: { conversationId: c.id } }),
    0,
  );
  assert.equal(
    await db.assistantPreference.findUnique({ where: { id: p } }),
    null,
  );
  const other = await entity();
  await db.assistantConversation.createMany({
    data: Array.from({ length: 100 }, () => ({
      id: randomUUID(),
      ...identity,
      entityId: other,
      month: "2026-09",
      currency: "USD",
      createDigest: "a".repeat(64),
      expiresAt: new Date(Date.now() + 86400000),
    })),
  });
  await assert.rejects(chat(other), (e: any) => e.code === "CAPACITY_REACHED");
  await db.assistantConversation.deleteMany({
    where: { ...identity, entityId: other },
  });
});
test("ledger comparison is an exact same-snapshot calculation and account detail traces opening versus period movements", async () => {
  const id = await entity(),
    raw = fixtureLedger();
  raw.periodStart = "2026-08-01";
  const prior = structuredClone(raw.journals[0]);
  prior.id = "prior-sale";
  prior.date = "2026-08-10";
  prior.lines[0].debit = "10000";
  prior.lines[1].credit = "10000";
  raw.journals.push(prior);
  await ledger.import(identity, id, 0, raw, true);
  const x = validateLedger(raw);
  ledger.approved.add(`${x.mappingId}@${mappingDigest(x)}`);
  const e = await facts.retrieve(
    identity,
    { entityId: id, month: "2026-09", currency: "USD" },
    plan.parse({
      operations: [
        { ...operation("ledger"), metric: "revenue" },
        { ...operation("ledger", "previous"), metric: "revenue" },
      ],
    }),
  );
  assert.equal(
    e.facts.find((f) => f.label.includes("change in revenue"))!.value,
    "15000",
  );
  assert.equal(e.sources[0].snapshotId, e.sources[1].snapshotId);
  const account = await facts.retrieve(
    identity,
    { entityId: id, month: "2026-09", currency: "USD" },
    plan.parse({ operations: [{ ...operation("ledger"), accountId: "bank" }] }),
  );
  assert.equal(account.facts[0].value, "105000");
  assert.equal(account.facts[1].value, "5000");
  assert.equal(account.facts[0].recordId, "bank");
});
test("deletion receipts reject delayed conversation/preference create retries without restoring content", async () => {
  const id = await entity(),
    input = {
      id: randomUUID(),
      entityId: id,
      month: "2026-09",
      currency: "USD",
    },
    c = await service.create(identity, input);
  await service.remove(identity, c.id, c.version);
  await assert.rejects(
    service.create(identity, input),
    (e: any) => e.status === 404,
  );
  const pref = {
      entityId: id,
      detail: "concise" as const,
      note: "Explicit private note",
      expectedVersion: 0,
    },
    prefId = randomUUID();
  await service.preference(identity, prefId, pref);
  await service.forget(identity, prefId, id, 1);
  await assert.rejects(
    service.preference(identity, prefId, pref),
    (e: any) => e.status === 404,
  );
  assert.equal((await service.preferences(identity, id)).items.length, 0);
});
test("org-wide concurrency and repeated create IDs cannot multiply work or provider spend", async () => {
  // The earlier revocation exercise intentionally leaves an unpublished lease. Expire that isolated fixture before testing two fresh worker slots.
  await db.assistantTurn.updateMany({
    where: { status: "pending", conversation: identity },
    data: { leaseUntil: new Date(0) },
  });
  const a = await chat(),
    b = await chat(),
    c = await chat();
  const input = {
    id: randomUUID(),
    entityId: a.entityId,
    month: a.month,
    currency: a.currency,
  };
  const created = await service.create(identity, input);
  assert.deepEqual(await service.create(identity, input), created);
  await assert.rejects(service.create(identity, { ...input, currency: "EUR" }));
  provider.delay = 200;
  const before = provider.calls;
  await service.reserve(identity, a.id, {
    id: randomUUID(),
    question: "one",
    expectedVersion: 1,
  });
  await service.reserve(identity, b.id, {
    id: randomUUID(),
    question: "two",
    expectedVersion: 1,
  });
  await assert.rejects(
    service.reserve(identity, c.id, {
      id: randomUUID(),
      question: "three",
      expectedVersion: 1,
    }),
    (e: any) => e.code === "ASSISTANT_BUSY",
  );
  for (let n = 0; n < 100 && provider.calls < before + 2; n++)
    await new Promise((r) => setTimeout(r, 10));
  assert.equal(provider.calls, before + 2);
  for (const convo of [a, b]) {
    const r = await service.read(identity, convo.id);
    await service.cancel(identity, convo.id, r.turns[0].id, r.version);
  }
  provider.delay = 0;
});
test("operational citations preserve exact entity/month, bounded records and current-versus-historical basis", async () => {
  const id = await entity();
  for (const title of ["First incomplete", "Second incomplete"])
    await acl.create(identity, {
      id: randomUUID(),
      entityId: id,
      month: "2026-09",
      title,
    });
  await acl.create(identity, {
    id: randomUUID(),
    entityId: id,
    month: "2026-08",
    title: "Foreign month",
  });
  await db.subscriptionRenewal.create({
    data: {
      id: randomUUID(),
      organisationId: identity.organisationId,
      entityId: id,
      supplierName: "Synthetic supplier",
      subscriptionName: "September source",
      renewalDate: new Date("2026-09-12"),
    },
  });
  await db.subscriptionRenewal.create({
    data: {
      id: randomUUID(),
      organisationId: identity.organisationId,
      entityId: id,
      supplierName: "Other period",
      subscriptionName: "October source",
      renewalDate: new Date("2026-10-12"),
    },
  });
  const p = await service.operationalSource(
    identity,
    id,
    "2026-09",
    "checklist",
    0,
    1,
  );
  matches("OperationalSource", p);
  assert.equal(p.total, 2);
  assert.equal(p.items.length, 1);
  assert.equal(p.nextOffset, 1);
  const s = await service.operationalSource(
    identity,
    id,
    "2026-09",
    "subscriptions",
    0,
    20,
  );
  matches("OperationalSource", s);
  assert.equal(s.total, 1);
  assert.equal((s.items[0] as any).subscriptionName, "September source");
  const evidence = await facts.retrieve(
    identity,
    { entityId: id, month: "2026-09", currency: "USD" },
    plan.parse({
      operations: [operation("checklist"), operation("subscriptions")],
    }),
  );
  for (const source of evidence.sources) {
    const q = new URL(source.href, "https://local.example").searchParams;
    assert.equal(q.get("entityId"), id);
    assert.equal(q.get("month"), "2026-09");
    assert.ok(source.basis.includes("retrieved"));
  }
  await assert.rejects(
    service.operationalSource(
      { organisationId: identity.organisationId, userId: randomUUID() },
      id,
      "2026-09",
      "checklist",
      0,
      20,
    ),
  );
});
test("provider byte/deadline/context and rate boundaries fail safely without fallback", async () => {
  const env = {
    ASSISTANT_ENABLED: "true",
    OPENROUTER_API_KEY: "synthetic-test-only",
    ASSISTANT_MODEL: "test/model",
    ASSISTANT_OPENROUTER_PROVIDERS: "ApprovedProvider",
    ASSISTANT_DAILY_TOKEN_LIMIT: "100000",
    ASSISTANT_MAX_INPUT_PRICE: "0",
    ASSISTANT_MAX_OUTPUT_PRICE: "0",
  };
  let mode = "large",
    calls = 0;
  const transport = (async () => {
    calls++;
    if (mode === "large") return new Response("x".repeat(32769));
    if (mode === "rate")
      return new Response("private provider error", { status: 429 });
    if (mode === "timeout") throw new DOMException("private", "TimeoutError");
    if (mode === "network") throw new TypeError("private network error");
    throw new DOMException("private", "AbortError");
  }) as typeof fetch;
  const provider = new OpenRouterProvider(env, transport);
  for (const [m, code] of [
    ["large", "PROVIDER_OVERSIZED"],
    ["rate", "PROVIDER_RATE_LIMIT"],
    ["timeout", "PROVIDER_TIMEOUT"],
    ["network", "PROVIDER_UNAVAILABLE"],
  ]) {
    mode = m;
    await assert.rejects(
      provider.plan({}, new AbortController().signal),
      (e: any) => e.code === code,
    );
  }
  const n = calls;
  await assert.rejects(
    provider.plan(
      { question: "x".repeat(16001) },
      new AbortController().signal,
    ),
    (e: any) => e.code === "CONTEXT_LIMIT",
  );
  assert.equal(calls, n);
  mode = "abort";
  const c = new AbortController();
  c.abort();
  await assert.rejects(
    provider.plan({}, c.signal),
    (e: any) => e.code === "CANCELLED",
  );
});
test("entity access lost during planning blocks source disclosure/composition and late publication", async () => {
  const id = await entity(),
    c = await chat(id),
    token = randomBytes(32).toString("hex"),
    hash = digest(token);
  await db.session.create({
    data: {
      ...identity,
      tokenHash: hash,
      csrfHash: digest("unused"),
      expiresAt: new Date(Date.now() + 60000),
    },
  });
  const controlled = new ControlledProvider();
  controlled.delay = 100;
  let composed = 0;
  const original = controlled.compose.bind(controlled);
  controlled.compose = async (input) => {
    composed++;
    return original(input);
  };
  service.provider = controlled;
  try {
    const input = {
      id: randomUUID(),
      question: "Read my source",
      expectedVersion: 1,
    };
    await service.reserve(identity, c.id, input, hash);
    await db.entityAccess.delete({
      where: { organisationId_userId_entityId: { ...identity, entityId: id } },
    });
    await new Promise((r) => setTimeout(r, 160));
    assert.equal(composed, 0);
    const row = await db.assistantTurn.findUniqueOrThrow({
      where: { id: input.id },
    });
    assert.equal(row.answer, null);
    assert.notEqual(row.status, "completed");
    await db.entityAccess.create({
      data: { ...identity, entityId: id, canWrite: false },
    });
    await db.assistantTurn.update({
      where: { id: input.id },
      data: { leaseUntil: new Date(0) },
    });
    assert.equal(
      (await service.read(identity, c.id, hash)).turns[0].failureCode,
      "LEASE_EXPIRED",
    );
  } finally {
    service.provider = provider;
  }
});

test("production compose forwards secure Assistant settings and defaults to disabled", () => {
  const settings = {
    ASSISTANT_ENABLED: "true",
    OPENROUTER_API_KEY: "synthetic-not-a-real-key",
    ASSISTANT_MODEL: "test/model:free",
    ASSISTANT_OPENROUTER_PROVIDERS: "ApprovedProvider",
    ASSISTANT_DAILY_TOKEN_LIMIT: "100000",
    ASSISTANT_MAX_INPUT_PRICE: "0",
    ASSISTANT_MAX_OUTPUT_PRICE: "0",
    ASSISTANT_LEDGER_MAPPING_IDS: "synthetic@fingerprint",
    Openrouter: "synthetic-alias-key",
  };
  const render = (configured: boolean) => {
    const clean = { ...process.env };
    for (const name of Object.keys(settings)) delete clean[name];
    const r = spawnSync(
      "docker",
      [
        "compose",
        "--env-file",
        "/dev/null",
        "-f",
        "compose.production.yaml",
        "config",
        "--format",
        "json",
      ],
      {
        encoding: "utf8",
        env: {
          ...clean,
          FINAI_IMAGE: "synthetic:test",
          POSTGRES_PASSWORD: "synthetic-password",
          DATABASE_URL: "postgresql://synthetic:synthetic@db:5432/synthetic",
          API_TRUSTED_HOST: "backend.example",
          PUBLIC_ORIGIN: "https://frontend.example",
          API_PROXY_TOKEN: "synthetic-proxy-token",
          ...(configured ? settings : {}),
        },
      },
    );
    assert.equal(r.status, 0, "Synthetic compose configuration must resolve");
    return JSON.parse(r.stdout).services.api.environment as Record<
      string,
      string
    >;
  };
  const configured = render(true);
  for (const [name, value] of Object.entries(settings))
    assert.equal(configured[name], value);
  assert.equal(new OpenRouterProvider(configured).configured, true);
  const disabled = render(false);
  assert.equal(disabled.ASSISTANT_ENABLED, "false");
  assert.equal(disabled.OPENROUTER_API_KEY, "");
  assert.equal(new OpenRouterProvider(disabled).configured, false);
});

test("Openrouter server secret alias authorizes the fixed provider endpoint and canonical name takes precedence", async () => {
  const settings = {
    ASSISTANT_ENABLED: "true",
    ASSISTANT_MODEL: "test/model:free",
    ASSISTANT_OPENROUTER_PROVIDERS: "ApprovedProvider",
    ASSISTANT_DAILY_TOKEN_LIMIT: "50000",
    ASSISTANT_MAX_INPUT_PRICE: "0",
    ASSISTANT_MAX_OUTPUT_PRICE: "0",
  };
  for (const [credentials, expected] of [
    [{ Openrouter: " synthetic-alias " }, "synthetic-alias"],
    [
      {
        OPENROUTER_API_KEY: "synthetic-canonical",
        Openrouter: "synthetic-alias",
      },
      "synthetic-canonical",
    ],
    [
      { OPENROUTER_API_KEY: "  ", Openrouter: "synthetic-alias" },
      "synthetic-alias",
    ],
  ] as const) {
    let calls = 0;
    const transport = (async (url, options) => {
      calls++;
      assert.equal(url, "https://openrouter.ai/api/v1/chat/completions");
      assert.equal(
        new Headers(options?.headers).get("Authorization"),
        `Bearer ${expected}`,
      );
      const request = JSON.parse(String(options?.body));
      assert.deepEqual(request.provider.max_price, {
        prompt: 0,
        completion: 0,
      });
      assert.equal(request.provider.allow_fallbacks, false);
      return Response.json({
        model: settings.ASSISTANT_MODEL,
        provider: "ApprovedProvider",
        choices: [
          {
            finish_reason: "stop",
            message: { content: JSON.stringify({ operations: [operation()] }) },
          },
        ],
      });
    }) as typeof fetch;
    const adapter = new OpenRouterProvider(
      { ...settings, ...credentials },
      transport,
    );
    assert.equal(adapter.configured, true);
    const result = await adapter.plan(
      { question: "synthetic source question" },
      new AbortController().signal,
    );
    assert.equal(result.operations.length, 1);
    assert.equal(calls, 1);
  }
  assert.equal(
    new OpenRouterProvider({ ...settings, Openrouter: "  " }).configured,
    false,
  );
});

test("free catalog filters unsupported/priced models, shares fetches and pins chosen model across grounded calls and retries", async () => {
  const originalProvider = service.provider;
  const settings = {
    ASSISTANT_ENABLED: "true",
    OPENROUTER_API_KEY: "synthetic-catalog-key",
    ASSISTANT_MODEL: "test/default:free",
    ASSISTANT_OPENROUTER_PROVIDERS: "ApprovedProvider",
    ASSISTANT_DAILY_TOKEN_LIMIT: "100000000",
    ASSISTANT_MAX_INPUT_PRICE: "0",
    ASSISTANT_MAX_OUTPUT_PRICE: "0",
  };
  const eligible = (id: string) => ({
    id,
    name: id,
    pricing: { prompt: "0", completion: "0", request: "0" },
    supported_parameters: ["structured_outputs"],
    architecture: { input_modalities: ["text"], output_modalities: ["text"] },
  });
  let catalogs = 0;
  const sent: string[] = [];
  const transport = (async (url, options) => {
    if (String(url).endsWith("/models")) {
      catalogs++;
      assert.equal(new Headers(options?.headers).has("Authorization"), false);
      return Response.json({
        data: [
          eligible(settings.ASSISTANT_MODEL),
          eligible("test/other:free"),
          {
            ...eligible("test/paid"),
            pricing: { prompt: "0.01", completion: "0" },
          },
          {
            ...eligible("test/per-request"),
            pricing: { prompt: "0", completion: "0", request: "0.01" },
          },
          {
            ...eligible("test/json-only:free"),
            supported_parameters: ["response_format"],
          },
          {
            ...eligible("test/image:free"),
            architecture: {
              input_modalities: ["image"],
              output_modalities: ["image"],
            },
          },
        ],
      });
    }
    const b = JSON.parse(String(options?.body));
    sent.push(b.model);
    assert.deepEqual(b.provider.max_price, { prompt: 0, completion: 0 });
    assert.equal(b.provider.allow_fallbacks, false);
    const input = JSON.parse(b.messages.at(-1).content);
    const result =
      b.response_format.json_schema.name === "plan"
        ? { operations: [operation("checklist")] }
        : {
            factIds: input.evidence.facts.slice(0, 3).map((f: any) => f.id),
            noteIds: Object.keys(input.evidence.notes).slice(0, 8),
          };
    return Response.json({
      model: b.model,
      provider: "ApprovedProvider",
      choices: [
        { finish_reason: "stop", message: { content: JSON.stringify(result) } },
      ],
    });
  }) as typeof fetch;
  const adapter = new OpenRouterProvider(settings, transport);
  assert.throws(() => adapter.selectModel("test/other:free"));
  const [a, b] = await Promise.all([adapter.models(), adapter.models()]);
  assert.deepEqual(a, b);
  assert.equal(catalogs, 1);
  matches("ModelList", a);
  assert.deepEqual(
    a.items.map((m) => m.id),
    [settings.ASSISTANT_MODEL, "test/other:free"],
  );
  await adapter.models();
  assert.equal(catalogs, 1);
  for (const id of [
    "test/paid",
    "test/json-only:free",
    "https://evil.example/model",
    "not-in-catalog",
  ])
    assert.throws(() => adapter.selectModel(id));
  service.provider = new OpenRouterProvider(settings, transport);
  try {
    const c = await chat(await entity());
    const input = {
      id: randomUUID(),
      question: "Which saved tasks are incomplete?",
      expectedVersion: c.version,
      model: "test/other:free",
    };
    const r = await service.reserve(identity, c.id, input);
    assert.equal(r.turn.model, input.model);
    assert.equal(catalogs, 2); // Cold replica validates independently of GET.
    const done = await awaitTurn(c.id);
    assert.equal(done.turns[0].status, "completed");
    assert.equal(done.turns[0].model, input.model);
    assert.deepEqual(sent, [input.model, input.model]);
    assert.equal(adapter.model, settings.ASSISTANT_MODEL);
    await service.reserve(identity, c.id, input);
    await assert.rejects(
      service.reserve(identity, c.id, {
        ...input,
        model: settings.ASSISTANT_MODEL,
      }),
    );
    await assert.rejects(
      service.reserve(identity, c.id, {
        ...input,
        id: randomUUID(),
        expectedVersion: done.version,
        model: "test/paid",
      }),
    );
    assert.equal(sent.length, 2);
  } finally {
    service.provider = originalProvider;
  }
  const broken = new OpenRouterProvider(
    settings,
    (async () => new Response("unavailable", { status: 503 })) as typeof fetch,
  );
  await assert.rejects(
    broken.models(),
    (e: any) => e.code === "MODEL_CATALOG_UNAVAILABLE",
  );
});

test("expired or oversized model catalogs fail closed instead of accepting stale selections", async () => {
  const settings = { ASSISTANT_MODEL: "default/model" };
  let unavailable = false;
  const adapter = new OpenRouterProvider(settings, (async () =>
    unavailable
      ? new Response("unavailable", { status: 503 })
      : Response.json({
          data: [
            {
              id: "test/free",
              name: "Synthetic free",
              pricing: { prompt: "0", completion: "0" },
              supported_parameters: ["structured_outputs"],
              architecture: {
                input_modalities: ["text"],
                output_modalities: ["text"],
              },
            },
          ],
        })) as typeof fetch);
  await adapter.models();
  assert.equal(adapter.selectModel("test/free").model, "test/free");
  const realNow = Date.now;
  try {
    Date.now = () => realNow() + 300001;
    assert.throws(() => adapter.selectModel("test/free"));
    unavailable = true;
    await assert.rejects(adapter.models());
    assert.throws(() => adapter.selectModel("test/free"));
  } finally {
    Date.now = realNow;
  }
  let cancelled = false;
  const oversized = new OpenRouterProvider(
    settings,
    (async () =>
      new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(new Uint8Array(8 * 1024 * 1024 + 1));
          },
          cancel() {
            cancelled = true;
          },
        }),
      )) as typeof fetch,
  );
  await assert.rejects(oversized.models());
  assert.equal(cancelled, true);
});
