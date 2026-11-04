import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { Database } from "../src/database";
import { PayablesService } from "../src/payables/service";

test("persistent payables, assignment isolation, export replay and revisions", async (t) => {
  const original = process.env.DATABASE_URL!;
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(original).hostname));
  const schema = "test_ap_" + randomUUID().replaceAll("-", ""),
    url = new URL(original);
  url.searchParams.set("schema", schema);
  const admin = new PrismaClient({ datasourceUrl: original }),
    db = new Database({ datasourceUrl: url.toString() }),
    service = new PayablesService(db);
  const org = randomUUID(),
    entity = randomUUID(),
    actors = Array.from({ length: 4 }, () => ({
      organisationId: org,
      userId: randomUUID(),
    }));
  try {
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    for (let k = 0; k < 2; k++) {
      const r = spawnSync(
        process.execPath,
        ["node_modules/prisma/build/index.js", "migrate", "deploy"],
        {
          env: { ...process.env, DATABASE_URL: url.toString() },
          encoding: "utf8",
        },
      );
      assert.equal(r.status, 0, r.stderr);
    }
    await db.organisation.create({
      data: { id: org, name: "Synthetic invoice pilot" },
    });
    await db.entity.create({
      data: { id: entity, organisationId: org, name: "Synthetic entity" },
    });
    for (const a of actors) {
      await db.user.create({ data: { id: a.userId } });
      await db.account.create({
        data: {
          userId: a.userId,
          username: `ap-${a.userId}`,
          passwordHash: "synthetic-service-fixture-not-for-login",
        },
      });
      await db.membership.create({ data: { ...a, active: true } });
      await db.entityAccess.create({ data: { ...a, entityId: entity } });
      await db.$executeRaw`INSERT INTO "ApGrant" VALUES(${org}::uuid,${entity}::uuid,${a.userId}::uuid,true,true,true,true,true)`;
    }
    const supplierId = randomUUID(),
      invoiceId = randomUUID();
    await service.supplier(actors[0], {
      id: supplierId,
      entityId: entity,
      name: "Synthetic Supplier",
      taxId: "TEST",
    });
    const bill = {
      id: invoiceId,
      entityId: entity,
      supplierId,
      reference: "TEST-001",
      invoiceDate: "2026-11-01",
      dueDate: "2026-12-01",
      currency: "GBP" as const,
      declaredGross: "12000",
      lines: [
        {
          description: "Synthetic services",
          quantity: "1",
          unitMinor: "10000",
          taxCode: "STANDARD" as const,
          taxBps: 2000 as const,
          recoverable: true,
          account: "6000",
          taxAccount: "2200",
          payableAccount: "2100",
          costCentre: "Ops",
        },
      ],
    };
    await service.policy(actors[0], {
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
    await t.test(
      "retry-safe creation, duplicate reference and changed payload",
      async () => {
        assert.equal((await service.create(actors[0], bill)).id, invoiceId);
        assert.equal((await service.create(actors[0], bill)).id, invoiceId);
        await assert.rejects(
          service.create(actors[0], { ...bill, reference: "different" }),
        );
        await assert.rejects(
          service.create(actors[0], { ...bill, id: randomUUID() }),
        );
      },
    );
    let v = 1;
    await t.test(
      "original PDF persistence, safe replay, and quarantine",
      async () => {
        const bytes = Buffer.from("%PDF-1.4\n" + "0".repeat(20000) + "\n%%EOF");
        const input = {
          entityId: entity,
          operationId: randomUUID(),
          expectedVersion: v,
          filename: "synthetic.pdf",
        };
        const doc = await service.upload(
          actors[0],
          invoiceId,
          input,
          bytes,
          true,
        );
        assert.equal(
          (await service.upload(actors[0], invoiceId, input, bytes, true)).id,
          doc.id,
        );
        assert.deepEqual(
          await service.document(actors[0], invoiceId, doc.id),
          bytes,
        );
        v++;
      },
    );
    const act = async (actor: number, action: string) => {
      const r = await service.action(actors[actor], invoiceId, {
        operationId: randomUUID(),
        expectedVersion: v,
        action,
      });
      v++;
      return r;
    };
    await t.test(
      "assigned verification and sequential two-step chain",
      async () => {
        await act(0, "review");
        await assert.rejects(act(2, "approve"));
        await assert.rejects(act(0, "verify"));
        await act(1, "verify");
        await assert.rejects(act(0, "approve"));
        assert.equal((await act(2, "approve")).state, "approve");
        assert.equal((await act(3, "approve")).state, "approved");
      },
    );
    let exportId = "";
    await t.test("immutable balanced export and logical replay", async () => {
      exportId = (
        await service.export(actors[0], invoiceId, {
          operationId: randomUUID(),
          expectedVersion: v,
        })
      ).id;
      assert.equal(
        (
          await service.export(actors[0], invoiceId, {
            operationId: randomUUID(),
            expectedVersion: v,
          })
        ).id,
        exportId,
      );
      const rows = (await service.exportFile(actors[0], exportId))
        .toString()
        .trim()
        .split("\r\n")
        .slice(1)
        .map((r) => r.split(",").map((x) => x.slice(1, -1)));
      assert.equal(
        rows.reduce((s, r) => s + BigInt(r[5]) - BigInt(r[6]), 0n),
        0n,
      );
    });
    await t.test(
      "material edit invalidates current approval and retains historical export",
      async () => {
        const detail = await service.detail(actors[0], invoiceId);
        await service.patch(actors[0], invoiceId, {
          ...detail.data,
          reference: "TEST-002",
          expectedVersion: v,
        });
        v++;
        const revised = await service.detail(actors[0], invoiceId);
        assert.equal(revised.state, "review");
        assert.equal(revised.revision, 3);
        assert.equal(
          (await service.exportFile(actors[0], exportId)).length > 0,
          true,
        );
        await assert.rejects(
          service.export(actors[0], invoiceId, {
            operationId: randomUUID(),
            expectedVersion: v,
          }),
        );
        await db.$disconnect();
        await db.$connect();
        assert.equal(
          (await service.detail(actors[0], invoiceId)).data.reference,
          "TEST-002",
        );
      },
    );
    await t.test(
      "challenge starts a new revision; published policy does not change an in-flight route; concurrent final approval commits once",
      async () => {
        await act(0, "review");
        await service.policy(actors[0], {
          operationId: randomUUID(),
          entityId: entity,
          expectedVersion: 1,
          publish: true,
          definition: {
            currency: "GBP",
            rules: [],
            fallback: { verifierId: null, approverIds: [actors[3].userId] },
          },
        });
        assert.equal(
          (await service.detail(actors[0], invoiceId)).route?.policyVersion,
          1,
        );
        await assert.rejects(
          service.action(actors[1], invoiceId, {
            operationId: randomUUID(),
            expectedVersion: v,
            action: "challenge",
          }),
        );
        await service.action(actors[1], invoiceId, {
          operationId: randomUUID(),
          expectedVersion: v,
          action: "challenge",
          reason: "Confirm delivery scope",
        });
        v++;
        assert.equal((await service.detail(actors[0], invoiceId)).revision, 4);
        await act(0, "review");
        assert.equal(
          (await service.detail(actors[0], invoiceId)).route?.policyVersion,
          2,
        );
        const results = await Promise.allSettled(
          [1, 2].map(() =>
            service.action(actors[3], invoiceId, {
              operationId: randomUUID(),
              expectedVersion: v,
              action: "approve",
            }),
          ),
        );
        assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
        v++;
        assert.equal(
          (await service.detail(actors[0], invoiceId)).state,
          "approved",
        );
      },
    );
    await t.test(
      "quarantined source cannot preview or submit; mismatched totals cannot submit",
      async () => {
        const n = randomUUID();
        await service.create(actors[0], {
          ...bill,
          id: n,
          reference: "QUARANTINE",
          declaredGross: "12001",
        });
        const doc = await service.upload(
          actors[0],
          n,
          {
            entityId: entity,
            operationId: randomUUID(),
            expectedVersion: 1,
            filename: "unscanned.pdf",
          },
          Buffer.from("%PDF-1.4\nSynthetic unscanned fixture\n%%EOF"),
          false,
        );
        assert.equal(doc.scanState, "quarantined");
        await assert.rejects(service.document(actors[0], n, doc.id));
        await assert.rejects(
          service.action(actors[0], n, {
            operationId: randomUUID(),
            expectedVersion: 2,
            action: "review",
          }),
        );
        const detail = await service.detail(actors[0], n);
        assert.equal(detail.totals.matches, false);
        await service.patch(actors[0], n, {
          ...detail.data,
          declaredGross: "12000",
          expectedVersion: 2,
        });
        await assert.rejects(
          service.action(actors[0], n, {
            operationId: randomUUID(),
            expectedVersion: 3,
            action: "review",
          }),
          (e) => (e as { code: string }).code === "DOCUMENT_QUARANTINED",
        );
      },
    );
    await t.test(
      "rejection requires a reason and prevents reopening/export",
      async () => {
        const n = randomUUID();
        await service.create(actors[0], {
          ...bill,
          id: n,
          reference: "REJECTED",
        });
        await service.upload(
          actors[0],
          n,
          {
            entityId: entity,
            operationId: randomUUID(),
            expectedVersion: 1,
            filename: "synthetic.pdf",
          },
          Buffer.from("%PDF-1.4\nSynthetic test document\n%%EOF"),
          true,
        );
        await service.action(actors[0], n, {
          operationId: randomUUID(),
          expectedVersion: 2,
          action: "review",
        });
        await assert.rejects(
          service.action(actors[3], n, {
            operationId: randomUUID(),
            expectedVersion: 3,
            action: "reject",
          }),
        );
        await service.action(actors[3], n, {
          operationId: randomUUID(),
          expectedVersion: 3,
          action: "reject",
          reason: "Supplier cancelled invoice",
        });
        const detail = await service.detail(actors[0], n);
        assert.equal(detail.state, "rejected");
        await assert.rejects(
          service.patch(actors[0], n, { ...detail.data, expectedVersion: 4 }),
        );
        await assert.rejects(
          service.export(actors[0], n, {
            operationId: randomUUID(),
            expectedVersion: 4,
          }),
        );
      },
    );
    await t.test(
      "review correction requests block submission until corrected metadata is saved",
      async () => {
        const id = randomUUID();
        await service.create(actors[0], {
          ...bill,
          id,
          reference: "CORRECTION-001",
        });
        await service.action(actors[0], id, {
          operationId: randomUUID(),
          expectedVersion: 1,
          action: "correction",
          reason: "Confirm the supplier reference",
        });
        const flagged = await service.detail(actors[0], id);
        assert.equal(
          flagged.correctionReason,
          "Confirm the supplier reference",
        );
        await assert.rejects(
          service.action(actors[0], id, {
            operationId: randomUUID(),
            expectedVersion: 2,
            action: "review",
          }),
          (e) => (e as { code: string }).code === "CORRECTION_REQUIRED",
        );
        await service.patch(actors[0], id, {
          ...flagged.data,
          reference: "CORRECTION-002",
          expectedVersion: 2,
        });
        assert.equal(
          (await service.detail(actors[0], id)).correctionReason,
          null,
        );
      },
    );
    await t.test(
      "scan verdicts preserve originals, revoke unsafe previews and quarantine encrypted PDFs",
      async () => {
        const originalScanner = service.scanner;
        let infected = false,
          calls = 0;
        service.scanner = {
          scan: async () => {
            calls++;
            return {
              status: infected ? "infected" : "clean",
              engine: "controlled-service-scanner",
              scannedAt: new Date().toISOString(),
            };
          },
        };
        try {
          const id = randomUUID();
          await service.create(actors[0], {
            ...bill,
            id,
            reference: "SCANNER-001",
          });
          const bytes = Buffer.from(
            "%PDF-1.4\nControlled ordinary document\n%%EOF",
          );
          const doc = await service.upload(
            actors[0],
            id,
            {
              entityId: entity,
              operationId: randomUUID(),
              expectedVersion: 1,
              filename: "scan.pdf",
            },
            bytes,
            false,
          );
          assert.equal(doc.scanState, "clean");
          assert.deepEqual(
            await service.document(actors[0], id, doc.id),
            bytes,
          );
          infected = true;
          const beforeRescan = new Date("2001-01-01T00:00:00Z");
          await db.$executeRaw`UPDATE "ApInvoice" SET updated_at=${beforeRescan} WHERE id=${id}::uuid`;
          const scanned = await service.rescan(actors[0], id, doc.id, {
            operationId: randomUUID(),
            expectedVersion: 2,
          });
          assert.equal(scanned.scanState, "infected");
          const [changed] = await db.$queryRaw<
            { updated_at: Date }[]
          >`SELECT updated_at FROM "ApInvoice" WHERE id=${id}::uuid`;
          assert.ok(
            changed.updated_at > beforeRescan,
            "Rescan updates the invoice modification timestamp",
          );
          await assert.rejects(service.document(actors[0], id, doc.id));
          assert.equal(
            (await service.detail(actors[0], id)).events[0].reason,
            "infected",
          );
          const before = calls;
          const encrypted = await service.upload(
            actors[0],
            id,
            {
              entityId: entity,
              operationId: randomUUID(),
              expectedVersion: 3,
              filename: "encrypted.pdf",
            },
            Buffer.from("%PDF-1.4\n<< /Encr#79pt 1 0 R >>\n%%EOF"),
            false,
          );
          assert.equal(encrypted.scanState, "quarantined");
          assert.equal(calls, before);
        } finally {
          service.scanner = originalScanner;
        }
      },
    );
    await t.test(
      "audit failure rolls back the invoice decision and its success history",
      async () => {
        const id = randomUUID();
        await service.create(actors[0], {
          ...bill,
          id,
          reference: "AUDIT-ROLLBACK",
        });
        await service.upload(
          actors[0],
          id,
          {
            entityId: entity,
            operationId: randomUUID(),
            expectedVersion: 1,
            filename: "audit.pdf",
          },
          Buffer.from("%PDF-1.4\nSynthetic audit fixture\n%%EOF"),
          true,
        );
        await db.$executeRawUnsafe(
          `CREATE FUNCTION ap_audit_fail() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.action='payables.review' THEN RAISE EXCEPTION 'Synthetic audit failure'; END IF; RETURN NEW; END$$`,
        );
        await db.$executeRawUnsafe(
          `CREATE TRIGGER ap_audit_fail BEFORE INSERT ON "ServerAudit" FOR EACH ROW EXECUTE FUNCTION ap_audit_fail()`,
        );
        try {
          await assert.rejects(
            service.action(actors[0], id, {
              operationId: randomUUID(),
              expectedVersion: 2,
              action: "review",
            }),
          );
          const current = await service.detail(actors[0], id);
          assert.equal(current.state, "review");
          assert.equal(current.version, 2);
          assert.equal(
            current.events.filter((e) => e.action === "review").length,
            0,
          );
        } finally {
          await db.$executeRawUnsafe(
            `DROP TRIGGER ap_audit_fail ON "ServerAudit"`,
          );
          await db.$executeRawUnsafe(`DROP FUNCTION ap_audit_fail()`);
        }
      },
    );
    await t.test(
      "revoked and foreign access safely deny detail and export",
      async () => {
        await db.$executeRaw`UPDATE "ApGrant" SET view=false WHERE user_id=${actors[2].userId}::uuid`;
        await assert.rejects(service.detail(actors[2], invoiceId));
        await assert.rejects(service.exportFile(actors[2], exportId));
        await db.entityAccess.delete({
          where: {
            organisationId_userId_entityId: { ...actors[2], entityId: entity },
          },
        });
        assert.equal(
          await db.apGrant.count({ where: { ...actors[2], entityId: entity } }),
          0,
        );
        assert.equal(
          (await service.detail(actors[0], invoiceId)).state,
          "approved",
        );

        await assert.rejects(
          service.detail(
            { organisationId: randomUUID(), userId: actors[0].userId },
            invoiceId,
          ),
        );
      },
    );
  } finally {
    await db.$disconnect();
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.$disconnect();
  }
});
