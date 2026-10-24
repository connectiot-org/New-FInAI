import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { Database } from "../database";
import { ChecklistRepository } from "../checklist.repository";
import type { Identity } from "../config";
import { ApiError } from "../errors";
import { registerDigest, validateRegister, type Scope } from "./validation";
import { requireImport } from "../workspace/permissions";
import { recordAudit } from "../audit";
const conflict = () =>
  new ApiError(
    409,
    "VERSION_CONFLICT",
    "Snapshot changed or historical content was retried. Review the current version.",
  );
export function safeNumber(v: string | bigint) {
  const n = BigInt(v);
  if (n < 0n || n > BigInt(Number.MAX_SAFE_INTEGER))
    throw new ApiError(
      503,
      "UNAVAILABLE",
      "Imported balances exceed the supported range.",
    );
  return Number(n);
}
@Injectable()
export class ReceivablesRepository {
  constructor(
    @Inject(Database) private db: Database,
    @Inject(ChecklistRepository) private permissions: ChecklistRepository,
  ) {}
  async import(
    identity: Identity,
    entityId: string,
    expectedVersion: number,
    value: unknown,
    apply = false,
    transaction?: Prisma.TransactionClient,
  ) {
    const input = validateRegister(value),
      digest = registerDigest(input);
    if (
      !Number.isInteger(expectedVersion) ||
      expectedVersion < 0 ||
      expectedVersion > 2147483646
    )
      throw new ApiError(
        422,
        "VALIDATION_FAILED",
        "Invalid expected snapshot version.",
      );
    const run = async (tx: Prisma.TransactionClient) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`receivables:${identity.organisationId}:${entityId}`},0))`;
      await requireImport(tx, identity, entityId);
      await tx.$queryRaw`SELECT a.entity_id FROM "EntityAccess" a JOIN "Membership" m ON m.organisation_id=a.organisation_id AND m.user_id=a.user_id WHERE a.organisation_id=${identity.organisationId}::uuid AND a.entity_id=${entityId}::uuid AND a.user_id=${identity.userId}::uuid FOR SHARE OF a,m`;
      await requireImport(tx, identity, entityId);
      const where = { organisationId: identity.organisationId, entityId };
      const current = await tx.receivableSnapshot.findFirst({
          where,
          orderBy: { version: "desc" },
        }),
        version = current?.version || 0;
      if (
        current?.digest === digest &&
        (expectedVersion === version || expectedVersion === version - 1)
      )
        return {
          status: "unchanged",
          version,
          rowCount: input.invoices.length,
        };
      if (
        expectedVersion !== version ||
        (await tx.receivableSnapshot.findFirst({
          where: { ...where, digest },
        }))
      )
        throw conflict();
      if (!apply)
        return {
          status: "dry_run",
          version: version + 1,
          rowCount: input.invoices.length,
        };
      const id = randomUUID();
      await tx.receivableSnapshot.create({
        data: {
          ...where,
          id,
          version: version + 1,
          sourceName: input.sourceName,
          sourceCapturedAt: new Date(input.sourceCapturedAt),
          importingActorId: identity.userId,
          digest,
          rowCount: input.invoices.length,
        },
      });
      for (let i = 0; i < input.invoices.length; i += 500)
        await tx.receivableSnapshotInvoice.createMany({
          data: input.invoices.slice(i, i + 500).map((v) => ({
            ...where,
            snapshotId: id,
            invoiceId: v.invoiceId,
            customerId: v.customerId,
            customerName: v.customerName,
            issuedOn: new Date(v.issuedOn + "T00:00:00Z"),
            status: v.status,
            amountCents: BigInt(v.amountCents),
            paidCents: BigInt(v.paidCents),
          })),
        });
      await recordAudit(tx, identity, "receivables.imported", id, entityId, {
        version: version + 1,
        rowCount: input.invoices.length,
      });
      return {
        status: "imported",
        version: version + 1,
        rowCount: input.invoices.length,
      };
    };
    return transaction
      ? run(transaction)
      : this.db.$transaction(run, {
          isolationLevel: "ReadCommitted",
          timeout: 30000,
          maxWait: 15000,
        });
  }
  async summary(identity: Identity, input: Scope) {
    return this.db.$transaction(
      async (tx) => {
        await this.permissions.authorize(tx, identity, input.entityId);
        const snapshot = await tx.receivableSnapshot.findFirst({
          where: {
            organisationId: identity.organisationId,
            entityId: input.entityId,
          },
          orderBy: { version: "desc" },
        });
        const common = {
          entityId: input.entityId,
          period: input.period,
          currency: "USD" as const,
        };
        if (!snapshot) return { dataState: "no_snapshot" as const, ...common };
        const scoped = Prisma.sql`organisation_id=${identity.organisationId}::uuid AND entity_id=${input.entityId}::uuid AND snapshot_id=${snapshot.id}::uuid AND status<>'Draft' AND paid_cents<amount_cents ${input.period === "all" ? Prisma.empty : Prisma.sql`AND issued_on >= ${input.period + "-01"}::date AND issued_on < (${input.period + "-01"}::date + INTERVAL '1 month')`}`;
        const totals = await tx.$queryRaw<
          { total: string; invoices: string; customers: string }[]
        >(
          Prisma.sql`SELECT COALESCE(SUM(amount_cents-paid_cents),0)::text AS total, COUNT(*)::text AS invoices, COUNT(DISTINCT customer_id COLLATE "C")::text AS customers FROM "ReceivableSnapshotInvoice" WHERE ${scoped}`,
        );
        const rows = await tx.$queryRaw<
          {
            customerId: string;
            customerName: string | null;
            invoiceCount: string;
            remainingCents: string;
          }[]
        >(
          Prisma.sql`SELECT customer_id COLLATE "C" AS "customerId", MIN(customer_name) AS "customerName", COUNT(*)::text AS "invoiceCount", SUM(amount_cents-paid_cents)::text AS "remainingCents" FROM "ReceivableSnapshotInvoice" WHERE ${scoped} GROUP BY customer_id COLLATE "C" ORDER BY SUM(amount_cents-paid_cents) DESC, customer_id COLLATE "C" ASC LIMIT 5`,
        );
        return {
          dataState: "ready" as const,
          ...common,
          source: {
            snapshotId: snapshot.id,
            version: snapshot.version,
            sourceName: snapshot.sourceName,
            sourceCapturedAt: snapshot.sourceCapturedAt.toISOString(),
            importedAt: snapshot.importedAt.toISOString(),
          },
          totalCents: safeNumber(totals[0].total),
          invoiceCount: safeNumber(totals[0].invoices),
          customerCount: safeNumber(totals[0].customers),
          rows: rows.map((v) => ({
            ...v,
            invoiceCount: safeNumber(v.invoiceCount),
            remainingCents: safeNumber(v.remainingCents),
          })),
        };
      },
      { isolationLevel: "RepeatableRead", timeout: 15000 },
    );
  }
}
