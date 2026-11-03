import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { request as httpRequest } from "node:http";
import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { Database } from "../src/database";
import { ChecklistRepository } from "../src/checklist.repository";
import { ReceivablesDetailRepository } from "../src/receivables/detail.repository";
import { LedgerService } from "../src/ledger/source";
import { PayablesService } from "../src/payables/service";
import { AssistantFacts } from "../src/assistant/facts";
import { AssistantService } from "../src/assistant/service";
import { plan } from "../src/assistant/validation";
import type { AssistantProvider } from "../src/assistant/provider";
import { confirmedInvoiceCommand } from "../src/payables/assistant";
import { createApplication } from "../src/app";
import { digest } from "../src/auth";

test("supplier invoice Assistant: grounded proposals, confirmed transactions, isolation and revocation", async (t) => {
  const original = process.env.DATABASE_URL!;
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(original).hostname));
  const schema = "test_invoice_assistant_" + randomUUID().replaceAll("-", ""),
    url = new URL(original);
  url.searchParams.set("schema", schema);
  const admin = new PrismaClient({ datasourceUrl: original }),
    db = new Database({ datasourceUrl: url.toString() }),
    org = randomUUID(),
    entity = randomUUID(),
    other = randomUUID(),
    actors = Array.from({ length: 4 }, () => ({
      organisationId: org,
      userId: randomUUID(),
    }));
  const ap = new PayablesService(db),
    acl = new ChecklistRepository(db),
    facts = new AssistantFacts(
      db,
      acl,
      new ReceivablesDetailRepository(db, acl),
      new LedgerService(db, acl),
      ap,
    ),
    assistant = new AssistantService(db, acl, facts);
  let invoiceId = "",
    action = "explain",
    invented = false,
    composed = 0,
    planned = 0;
  let invoiceSearch: string | null = null;
  let duringCompose: (() => Promise<void>) | undefined;
  const provider: AssistantProvider = {
    configured: true,
    model: "controlled-invoice-provider",
    dailyLimit: 10000000,
    async plan() {
      planned++;
      return plan.parse({
        operations: [
          {
            kind: "supplier_invoices",
            period: "current",
            invoiceId: invoiceSearch
              ? null
              : invented
                ? randomUUID()
                : invoiceId || null,
            invoiceSearch,
            invoiceAction: action,
            customerId: null,
            accountId: null,
            metric: "all",
            reason: "none",
          },
        ],
      });
    },
    async compose(input: unknown) {
      composed++;
      const e = input as {
        evidence: { facts: { id: string }[]; notes: Record<string, string> };
      };
      assert.equal(JSON.stringify(input).includes("%PDF"), false);
      await duringCompose?.();
      return {
        factIds: e.evidence.facts.slice(0, 3).map((f) => f.id),
        noteIds: Object.keys(e.evidence.notes).slice(0, 8),
      };
    },
  };
  assistant.provider = provider;
  let app: Awaited<ReturnType<typeof createApplication>> | undefined;
  const bill = {
    supplierId: randomUUID(),
    reference: "ASSISTANT-001",
    invoiceDate: "2026-11-01",
    dueDate: "2026-12-01",
    currency: "GBP" as const,
    declaredGross: "12000",
    lines: [
      {
        description: "Synthetic service",
        quantity: "1",
        unitMinor: "10000",
        taxCode: "STANDARD" as const,
        taxBps: 2000 as const,
        recoverable: true,
        account: "6000",
        taxAccount: "2200",
        payableAccount: "2100",
        costCentre: "Operations",
      },
    ],
  };
  const ask = async (
    actor = 0,
    question = `Explain supplier invoice ${invoiceId}`,
    currency = "GBP",
  ) => {
    const c = await assistant.create(actors[actor], {
      id: randomUUID(),
      entityId: entity,
      month: "2026-11",
      currency,
    });
    const body = { id: randomUUID(), question, expectedVersion: c.version };
    await assistant.reserve(actors[actor], c.id, body);
    for (let n = 0; n < 200; n++) {
      const row = await db.assistantTurn.findUniqueOrThrow({
        where: { id: body.id },
      });
      if (row.status !== "pending")
        return {
          c,
          body,
          row,
          answer: row.answer as {
            proposals: {
              operationId: string;
              entityId: string;
              invoiceId: string;
              expectedVersion: number;
              action: string;
              reasonRequired: boolean;
            }[];
            facts: { value: string; recordKind?: string }[];
            sources: { version: number; href: string }[];
            notes: string[];
          },
        };
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error("Controlled invoice turn did not finish");
  };
  try {
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    const migrated = spawnSync(
      process.execPath,
      ["node_modules/prisma/build/index.js", "migrate", "deploy"],
      {
        env: { ...process.env, DATABASE_URL: url.toString() },
        encoding: "utf8",
      },
    );
    assert.equal(migrated.status, 0, migrated.stderr);
    await db.organisation.create({
      data: { id: org, name: "Synthetic invoice Assistant" },
    });
    for (const id of [entity, other])
      await db.entity.create({
        data: { id, organisationId: org, name: "Synthetic company" },
      });
    for (const [index, i] of actors.entries()) {
      await db.user.create({ data: { id: i.userId } });
      await db.account.create({
        data: {
          userId: i.userId,
          username: `invoice-assistant-${index}`,
          passwordHash: "not-for-login",
        },
      });
      await db.membership.create({ data: { ...i } });
      for (const entityId of [entity, other]) {
        await db.entityAccess.create({ data: { ...i, entityId } });
        await db.$executeRaw`INSERT INTO "ApGrant" VALUES(${org}::uuid,${entityId}::uuid,${i.userId}::uuid,true,${index === 0},${index === 1},${index >= 2},${index === 0})`;
      }
    }
    await ap.supplier(actors[0], {
      id: bill.supplierId,
      entityId: entity,
      name: "Synthetic supplier",
      taxId: "TEST",
    });
    invoiceId = randomUUID();
    await ap.create(actors[0], { ...bill, id: invoiceId, entityId: entity });
    await ap.policy(actors[0], {
      operationId: randomUUID(),
      entityId: entity,
      expectedVersion: 0,
      publish: true,
      definition: {
        currency: "GBP",
        rules: [],
        fallback: {
          verifierId: actors[1].userId,
          approverIds: [actors[2].userId, actors[3].userId],
        },
      },
    });
    await ap.upload(
      actors[0],
      invoiceId,
      {
        operationId: randomUUID(),
        entityId: entity,
        expectedVersion: 1,
        filename: "synthetic.pdf",
      },
      Buffer.from("%PDF-1.4\nsynthetic fixture\n%%EOF"),
      true,
    );

    await t.test(
      "exact GBP facts cite mutable version and proposals make no writes; schema defaults remain compatible",
      async () => {
        action = "review";
        const before = await ap.detail(actors[0], invoiceId),
          result = await ask();
        assert.equal(result.row.status, "completed");
        assert.deepEqual(
          result.answer.facts.map((f) => f.value),
          ["10000", "2000", "12000"],
        );
        assert.ok(
          result.answer.facts.every((f) => f.recordKind === "supplier_invoice"),
        );
        assert.equal(result.answer.sources[0].version, before.version);
        assert.equal(
          new URLSearchParams(result.answer.sources[0].href.split("?")[1]).get(
            "entityId",
          ),
          entity,
        );
        assert.equal(
          result.answer.proposals[0].expectedVersion,
          before.version,
        );
        assert.equal(
          (await ap.detail(actors[0], invoiceId)).version,
          before.version,
        );
        const invalid = await ask(2);
        assert.deepEqual(invalid.answer.proposals, []);
        assert.ok(invalid.answer.notes.some((n) => n.includes("unavailable")));
        const legacy = plan.parse({
          operations: [
            {
              kind: "ledger",
              period: "current",
              customerId: null,
              accountId: null,
              metric: "all",
              reason: "none",
            },
          ],
        });
        assert.equal(legacy.operations[0].invoiceAction, "explain");
        const json = z.toJSONSchema(plan) as unknown as {
          properties: { operations: { items: { required: string[] } } };
        };
        assert.ok(
          json.properties.operations.items.required.includes("invoiceId"),
        );
        assert.ok(
          json.properties.operations.items.required.includes("invoiceAction"),
        );
      },
    );
    await t.test(
      "company, month, currency, exact ID grounding, and AP view bound every source",
      async () => {
        await assert.rejects(
          ap.assistantSnapshot(actors[0], other, "2026-11", invoiceId),
        );
        await assert.rejects(
          ap.assistantSnapshot(actors[0], entity, "2026-10", invoiceId),
        );
        const usd = await ask(0, `Explain ${invoiceId}`, "USD");
        assert.equal(usd.answer.facts.length, 0);
        assert.equal(usd.answer.proposals.length, 0);
        invented = true;
        const bogus = await ask();
        invented = false;
        assert.equal(bogus.answer.facts.length, 0);
        assert.equal(bogus.answer.proposals.length, 0);
        action = "approve";
        const noRoute = await ask(2);
        assert.equal(noRoute.answer.proposals.length, 0);
      },
    );

    await t.test(
      "literal supplier/reference search is bounded, exact and never a wildcard or cross-company disclosure",
      async () => {
        invoiceSearch = "Synthetic supplier";
        let found = await ask(0, 'Find invoices matching "Synthetic supplier"');
        assert.equal(found.answer.facts[0].value, "1");
        invoiceSearch = "invented undisclosed phrase";
        found = await ask(0, "Find supplier invoices");
        assert.equal(found.answer.facts.length, 0);
        assert.equal(found.answer.proposals.length, 0);
        invoiceSearch = null;
        const matched = await ap.assistantSnapshot(
          actors[0],
          entity,
          "2026-11",
          null,
          "synthetic supplier",
        );
        assert.equal(matched.total, 1);
        assert.equal(matched.gross, "12000");
        assert.equal(
          (
            await ap.assistantSnapshot(
              actors[0],
              entity,
              "2026-11",
              null,
              "ASSISTANT-001",
            )
          ).total,
          1,
        );
        assert.equal(
          (await ap.assistantSnapshot(actors[0], entity, "2026-11", null, "%_"))
            .total,
          0,
        );
        assert.equal(
          (
            await ap.assistantSnapshot(
              actors[0],
              other,
              "2026-11",
              null,
              "synthetic",
            )
          ).total,
          0,
        );
        const result = await facts.retrieve(
          actors[0],
          { entityId: entity, month: "2026-11", currency: "GBP" },
          plan.parse({
            operations: [
              {
                kind: "supplier_invoices",
                period: "current",
                invoiceSearch: "Synthetic supplier",
                customerId: null,
                accountId: null,
                metric: "all",
                reason: "none",
              },
            ],
          }),
        );
        assert.equal(result.facts[0].value, "1");
        assert.ok(result.facts.some((f) => f.label.includes("ASSISTANT-001")));
        assert.equal(
          new URLSearchParams(result.sources[0].href.split("?")[1]).get(
            "search",
          ),
          "Synthetic supplier",
        );
      },
    );
    await t.test(
      "monthly summary refuses truncation above1000 and exact IDs/search remain available",
      async () => {
        const data = {
          ...bill,
          invoiceDate: "2026-12-01",
          dueDate: "2027-01-01",
        };
        await db.$executeRaw`INSERT INTO "ApInvoice"(id,organisation_id,entity_id,supplier_id,reference_key,data,create_digest) SELECT gen_random_uuid(),${org}::uuid,${entity}::uuid,${bill.supplierId}::uuid,'limit-'||g,jsonb_set(${JSON.stringify(data)}::jsonb,'{reference}',to_jsonb('LIMIT-'||g)),${"a".repeat(64)} FROM generate_series(1,1000) g`;
        const full = await ap.assistantSnapshot(actors[0], entity, "2026-12");
        assert.equal(full.total, 1000);
        assert.equal(full.gross, "12000000");
        await ap.create(actors[0], {
          ...data,
          id: randomUUID(),
          entityId: entity,
          reference: "LIMIT-extra",
        });
        await assert.rejects(
          ap.assistantSnapshot(actors[0], entity, "2026-12"),
          (e: unknown) => (e as { code: string }).code === "SOURCE_LIMIT",
        );
        assert.equal(
          (
            await ap.assistantSnapshot(
              actors[0],
              entity,
              "2026-12",
              null,
              "LIMIT-extra",
            )
          ).total,
          1,
        );
        const sample = full.items[0].id;
        assert.equal(
          (await ap.assistantSnapshot(actors[0], entity, "2026-12", sample))
            .total,
          1,
        );
      },
    );

    const key = randomBytes(32).toString("hex"),
      csrf = "synthetic-csrf",
      tokens = actors.map(() => randomBytes(32).toString("hex"));
    for (const [index, i] of actors.entries())
      await db.session.create({
        data: {
          ...i,
          tokenHash: digest(tokens[index]),
          csrfHash: digest(csrf),
          expiresAt: new Date(Date.now() + 300000),
        },
      });
    process.env.DATABASE_URL = url.toString();
    app = await createApplication({
      env: {
        ...process.env,
        DATABASE_URL: url.toString(),
        NODE_ENV: "test",
        CHECKLIST_IDENTITY: "session",
        API_HOST: "127.0.0.1",
        API_PORT: "0",
        PUBLIC_ORIGIN: "https://frontend.example",
        API_TRUSTED_HOST: "127.0.0.1",
        API_PROXY_TOKEN: key,
      },
      assistantProvider: provider,
      quiet: true,
    });
    const base = await app.getUrl();
    const command = (
      actor: number,
      body: unknown,
      patch: Record<string, string> = {},
    ) =>
      new Promise<{ status: number; body: any }>((resolve, reject) => {
        const r = httpRequest(
          base + `/api/v1/payables/invoices/${invoiceId}/assistant-actions`,
          {
            method: "POST",
            headers: {
              Host: "127.0.0.1",
              "x-finai-proxy-token": key,
              "x-finai-public-host": "frontend.example",
              "x-forwarded-proto": "https",
              cookie: `__Host-finai_session=${tokens[actor]}`,
              origin: "https://frontend.example",
              "content-type": "application/json",
              "x-csrf-token": csrf,
              ...patch,
            },
          },
          (response) => {
            let data = "";
            response.on("data", (b) => (data += b));
            response.on("end", () =>
              resolve({ status: response.statusCode!, body: JSON.parse(data) }),
            );
          },
        );
        r.on("error", reject);
        r.end(JSON.stringify(body));
      });
    await t.test(
      "confirmation HTTP boundary requires session, CSRF, company, reason and strict payload",
      async () => {
        const body = {
          operationId: randomUUID(),
          entityId: entity,
          expectedVersion: 2,
          action: "correction",
        };
        assert.equal((await command(0, body, { cookie: "" })).status, 401);
        assert.equal(
          (await command(0, body, { "x-csrf-token": "wrong" })).status,
          403,
        );
        assert.equal((await command(0, body)).status, 422);
        assert.equal(
          (
            await command(0, {
              ...body,
              reason: "Check document",
              entityId: other,
            })
          ).status,
          404,
        );
        assert.equal(
          (
            await command(0, {
              ...body,
              reason: "Check document",
              userId: actors[2].userId,
            })
          ).status,
          422,
        );
        assert.equal(
          confirmedInvoiceCommand.safeParse({ ...body, reason: "\u0000" })
            .success,
          false,
        );
        assert.equal((await ap.detail(actors[0], invoiceId)).version, 2);
      },
    );
    await t.test(
      "confirmed review, verification, sequential approvals and CSV use existing atomic rules; replay binds origin",
      async () => {
        for (const [actor, intent, state] of [
          [0, "review", "verify"],
          [1, "verify", "approve"],
          [2, "approve", "approve"],
          [3, "approve", "approved"],
        ] as const) {
          action = intent;
          const result = await ask(
              actor,
              `Propose ${intent} for supplier invoice ${invoiceId}`,
            ),
            p = result.answer.proposals[0];
          assert.ok(p);
          const body = {
            operationId: p.operationId,
            entityId: p.entityId,
            expectedVersion: p.expectedVersion,
            action: p.action,
          };
          const before = await ap.detail(actors[0], invoiceId);
          assert.equal(before.version, p.expectedVersion);
          assert.equal((await command((actor + 1) % 4, body)).status, 403);
          const saved = await command(actor, body);
          assert.equal(saved.status, 201, JSON.stringify(saved.body));
          assert.equal(saved.body.state, state);
          assert.deepEqual((await command(actor, body)).body, saved.body);
          assert.equal(
            (
              await command(actor, {
                ...body,
                expectedVersion: p.expectedVersion + 1,
              })
            ).status,
            409,
          );
          await assert.rejects(ap.action(actors[actor], invoiceId, body));
        }
        action = "export";
        const result = await ask(),
          p = result.answer.proposals[0];
        assert.ok(p);
        const body = {
          operationId: p.operationId,
          entityId: p.entityId,
          expectedVersion: p.expectedVersion,
          action: p.action,
        };
        const exported = await command(0, body);
        assert.equal(exported.status, 201);
        assert.equal(exported.body.kind, "export");
        assert.deepEqual((await command(0, body)).body, exported.body);
        const csv = await ap.exportFile(actors[0], exported.body.id);
        assert.ok(csv.toString().includes(bill.reference));
        const events = await db.$queryRaw<
          { snapshot: { metadata?: { origin?: string } } }[]
        >`SELECT snapshot FROM "ApEvent" WHERE invoice_id=${invoiceId}::uuid AND action IN ('review','verify','approve','exported')`;
        assert.equal(events.length, 5);
        assert.ok(
          events.every((e) => e.snapshot.metadata?.origin === "assistant"),
        );
        assert.equal(
          (
            await db.$queryRaw<
              { count: bigint }[]
            >`SELECT count(*) FROM "ServerAudit" WHERE metadata->>'reasonCode'='assistant_command'`
          )[0].count,
          5n,
        );
      },
    );
    await t.test(
      "revisions invalidate proposals and reasoned commands retain immutable safe retries",
      async () => {
        let detail = await ap.detail(actors[0], invoiceId);
        await ap.patch(actors[0], invoiceId, {
          ...detail.data,
          expectedVersion: detail.version,
        });
        action = "review";
        const proposed = await ask(),
          p = proposed.answer.proposals[0];
        assert.ok(p);
        detail = await ap.detail(actors[0], invoiceId);
        await ap.patch(actors[0], invoiceId, {
          ...detail.data,
          expectedVersion: detail.version,
        });
        assert.equal(
          (
            await command(0, {
              operationId: p.operationId,
              entityId: entity,
              expectedVersion: p.expectedVersion,
              action: p.action,
            })
          ).status,
          409,
        );
        action = "correction";
        const correction = await ask(),
          cp = correction.answer.proposals[0];
        assert.equal(cp.reasonRequired, true);
        const body = {
          operationId: cp.operationId,
          entityId: entity,
          expectedVersion: cp.expectedVersion,
          action: cp.action,
          reason: "Document coding needs correction",
        };
        assert.equal((await command(0, body)).status, 201);
        assert.equal(
          (await command(0, { ...body, reason: "Changed reason" })).status,
          409,
        );
        assert.equal(
          (await ap.detail(actors[0], invoiceId)).correctionReason,
          body.reason,
        );
      },
    );
    await t.test(
      "revoked AP authority blocks stored answers, replay, subsequent model context and late publication",
      async () => {
        action = "explain";
        const saved = await ask();
        await db.$executeRaw`UPDATE "ApGrant" SET view=false WHERE user_id=${actors[0].userId}::uuid AND entity_id=${entity}::uuid`;
        await assert.rejects(assistant.read(actors[0], saved.c.id));
        await assert.rejects(
          assistant.reserve(actors[0], saved.c.id, saved.body),
        );
        const oldPlanned = planned,
          oldComposed = composed;
        await assistant.reserve(actors[0], saved.c.id, {
          id: randomUUID(),
          question: "More about that invoice",
          expectedVersion: 2,
        });
        for (let n = 0; n < 100; n++) {
          if (
            (
              await db.assistantTurn.findMany({
                where: { conversationId: saved.c.id, status: "pending" },
              })
            ).length === 0
          )
            break;
          await new Promise((r) => setTimeout(r, 10));
        }
        assert.equal(planned, oldPlanned);
        assert.equal(composed, oldComposed);
        await db.$executeRaw`UPDATE "ApGrant" SET view=true WHERE user_id=${actors[0].userId}::uuid AND entity_id=${entity}::uuid`;
        duringCompose = async () => {
          await db.$executeRaw`UPDATE "ApGrant" SET view=false WHERE user_id=${actors[0].userId}::uuid AND entity_id=${entity}::uuid`;
        };
        const c = await assistant.create(actors[0], {
          id: randomUUID(),
          entityId: entity,
          month: "2026-11",
          currency: "GBP",
        });
        const sent = await assistant.reserve(actors[0], c.id, {
          id: randomUUID(),
          question: `Explain ${invoiceId}`,
          expectedVersion: 1,
        });
        for (let n = 0; n < 100; n++) {
          if (composed > oldComposed) break;
          await new Promise((r) => setTimeout(r, 10));
        }
        await new Promise((r) => setTimeout(r, 40));
        const row = await db.assistantTurn.findUniqueOrThrow({
          where: { id: sent.turn.id },
        });
        assert.equal(row.answer, null);
        assert.notEqual(row.status, "completed");
        duringCompose = undefined;
      },
    );
  } finally {
    assistant.onModuleDestroy();
    await app?.close();
    await db.$disconnect();
    await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.$disconnect();
    process.env.DATABASE_URL = original;
  }
});
