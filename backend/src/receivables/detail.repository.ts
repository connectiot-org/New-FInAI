import { Inject, Injectable } from "@nestjs/common";
import { Prisma, type ReceivableSnapshot } from "@prisma/client";
import { Database } from "../database";
import { ChecklistRepository } from "../checklist.repository";
import type { Identity } from "../config";
import { ApiError } from "../errors";
import { safeNumber } from "./repository";
import type { DetailInput } from "./detail.validation";
import { recordAudit } from "../audit";
export const sourceMetadata = (s: ReceivableSnapshot) => ({
  snapshotId: s.id,
  version: s.version,
  sourceName: s.sourceName,
  sourceCapturedAt: s.sourceCapturedAt.toISOString(),
  importedAt: s.importedAt.toISOString(),
});
@Injectable()
export class ReceivablesDetailRepository {
  constructor(
    @Inject(Database) private db: Database,
    @Inject(ChecklistRepository) private permissions: ChecklistRepository,
  ) {}
  async history(
    identity: Identity,
    input: { entityId: string; offset: number; limit: number },
  ) {
    return this.db.$transaction(
      async (tx) => {
        await this.permissions.authorize(tx, identity, input.entityId);
        const where = {
            organisationId: identity.organisationId,
            entityId: input.entityId,
          },
          total = await tx.receivableSnapshot.count({ where });
        const items = await tx.receivableSnapshot.findMany({
          where,
          orderBy: { version: "desc" },
          skip: input.offset,
          take: input.limit,
        });
        return {
          entityId: input.entityId,
          offset: input.offset,
          limit: input.limit,
          total,
          nextOffset:
            input.offset + items.length < total
              ? input.offset + items.length
              : null,
          items: items.map((s) => ({
            ...sourceMetadata(s),
            importingActorId: s.importingActorId,
            digest: s.digest,
          })),
        };
      },
      { isolationLevel: "RepeatableRead" },
    );
  }
  async page(
    identity: Identity,
    input: DetailInput,
    view: "invoice" | "customer" | "issue-period",
    exporting = false,
  ) {
    return this.db.$transaction(
      async (tx) => {
        await this.permissions.authorize(tx, identity, input.entityId);
        const snapshot = await tx.receivableSnapshot.findFirst({
          where: {
            id: input.snapshotId,
            organisationId: identity.organisationId,
            entityId: input.entityId,
          },
        });
        if (!snapshot)
          throw new ApiError(404, "NOT_FOUND", "Resource not found.");
        const search = "%" + input.search.replace(/[\\%_]/g, "\\$&") + "%";
        const where = Prisma.sql`organisation_id=${identity.organisationId}::uuid AND entity_id=${input.entityId}::uuid AND snapshot_id=${snapshot.id}::uuid
   ${input.period === "all" ? Prisma.empty : Prisma.sql`AND issued_on>=${input.period + "-01"}::date AND issued_on<(${input.period + "-01"}::date+INTERVAL '1 month')`}
   ${input.status === "all" ? Prisma.empty : input.status === "outstanding" ? Prisma.sql`AND status<>'Draft' AND paid_cents<amount_cents` : Prisma.sql`AND status=${input.status}`}
   ${input.customerId ? Prisma.sql`AND customer_id COLLATE "C"=${input.customerId}` : Prisma.empty}
   ${input.search ? Prisma.sql`AND (invoice_id ILIKE ${search} OR customer_id ILIKE ${search} OR customer_name ILIKE ${search})` : Prisma.empty}`;
        const t = (
          await tx.$queryRaw<
            {
              invoices: string;
              customers: string;
              periods: string;
              cents: string;
            }[]
          >(
            Prisma.sql`SELECT COUNT(*)::text AS invoices,COUNT(DISTINCT customer_id COLLATE "C")::text AS customers,COUNT(DISTINCT to_char(issued_on,'YYYY-MM'))::text AS periods,COALESCE(SUM(amount_cents-paid_cents),0)::text AS cents FROM "ReceivableSnapshotInvoice" WHERE ${where}`,
          )
        )[0];
        const total = safeNumber(
            view === "invoice"
              ? t.invoices
              : view === "customer"
                ? t.customers
                : t.periods,
          ),
          limit = exporting ? 10000 : input.limit,
          offset = exporting ? 0 : input.offset;
        if (exporting && total > 10000)
          throw new ApiError(
            422,
            "VALIDATION_FAILED",
            "Export exceeds the supported register limit.",
          );
        let items: unknown[];
        if (view === "invoice") {
          const rows = await tx.$queryRaw<
            {
              invoiceId: string;
              customerId: string;
              customerName: string | null;
              issuedOn: string;
              status: string;
              amountCents: string;
              paidCents: string;
            }[]
          >(
            Prisma.sql`SELECT invoice_id AS "invoiceId",customer_id AS "customerId",customer_name AS "customerName",to_char(issued_on,'YYYY-MM-DD') AS "issuedOn",status,amount_cents::text AS "amountCents",paid_cents::text AS "paidCents" FROM "ReceivableSnapshotInvoice" WHERE ${where} ORDER BY invoice_id COLLATE "C" ASC LIMIT ${limit} OFFSET ${offset}`,
          );
          items = rows.map((r) => ({
            ...r,
            amountCents: safeNumber(r.amountCents),
            paidCents: safeNumber(r.paidCents),
            remainingCents: safeNumber(
              BigInt(r.amountCents) - BigInt(r.paidCents),
            ),
          }));
        } else if (view === "customer") {
          const rows = await tx.$queryRaw<
            {
              customerId: string;
              customerName: string | null;
              invoiceCount: string;
              remainingCents: string;
            }[]
          >(
            Prisma.sql`SELECT customer_id COLLATE "C" AS "customerId",MIN(customer_name) AS "customerName",COUNT(*)::text AS "invoiceCount",SUM(amount_cents-paid_cents)::text AS "remainingCents" FROM "ReceivableSnapshotInvoice" WHERE ${where} GROUP BY customer_id COLLATE "C" ORDER BY SUM(amount_cents-paid_cents) DESC,customer_id COLLATE "C" ASC LIMIT ${limit} OFFSET ${offset}`,
          );
          items = rows.map((r) => ({
            ...r,
            invoiceCount: safeNumber(r.invoiceCount),
            remainingCents: safeNumber(r.remainingCents),
          }));
        } else {
          const rows = await tx.$queryRaw<
            {
              period: string;
              invoiceCount: string;
              customerCount: string;
              remainingCents: string;
            }[]
          >(
            Prisma.sql`SELECT to_char(issued_on,'YYYY-MM') AS period,COUNT(*)::text AS "invoiceCount",COUNT(DISTINCT customer_id COLLATE "C")::text AS "customerCount",SUM(amount_cents-paid_cents)::text AS "remainingCents" FROM "ReceivableSnapshotInvoice" WHERE ${where} GROUP BY to_char(issued_on,'YYYY-MM') ORDER BY period ASC LIMIT ${limit} OFFSET ${offset}`,
          );
          items = rows.map((r) => ({
            ...r,
            invoiceCount: safeNumber(r.invoiceCount),
            customerCount: safeNumber(r.customerCount),
            remainingCents: safeNumber(r.remainingCents),
          }));
        }
        if (exporting)
          await recordAudit(
            tx,
            identity,
            "receivables.export_prepared",
            snapshot.id,
            input.entityId,
            { version: snapshot.version, rowCount: total },
          );
        return {
          view,
          entityId: input.entityId,
          period: input.period,
          currency: "USD",
          source: sourceMetadata(snapshot),
          filters: {
            status: input.status,
            customerId: input.customerId || null,
            search: input.search,
          },
          sort:
            view === "invoice"
              ? "invoiceId:asc"
              : view === "customer"
                ? "remainingCents:desc,customerId:asc"
                : "period:asc",
          offset,
          limit,
          total,
          invoiceCount: safeNumber(t.invoices),
          customerCount: safeNumber(t.customers),
          remainingCents: safeNumber(t.cents),
          nextOffset:
            offset + items.length < total ? offset + items.length : null,
          items,
        };
      },
      { isolationLevel: "RepeatableRead", timeout: 15000 },
    );
  }
}
