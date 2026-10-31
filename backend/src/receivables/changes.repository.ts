import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { Database } from "../database";
import { ChecklistRepository } from "../checklist.repository";
import type { Identity } from "../config";
import { ApiError } from "../errors";
import { sourceMetadata } from "./detail.repository";
import type { ChangesInput } from "./detail.validation";

export type ChangeRecord = {
  customerId: string;
  customerName: string | null;
  issuedOn: string;
  status: "Draft" | "Issued" | "Partial" | "Paid";
  amountCents: string;
  paidCents: string;
};
const fields = [
  "customerId",
  "customerName",
  "issuedOn",
  "status",
  "amountCents",
  "paidCents",
] as const;
type JoinedRow = {
  invoiceId: string;
  earlier: ChangeRecord | null;
  later: ChangeRecord | null;
};
const contribution = (r: ChangeRecord | null) =>
  r && r.status !== "Draft" && BigInt(r.paidCents) < BigInt(r.amountCents)
    ? BigInt(r.amountCents) - BigInt(r.paidCents)
    : 0n;

@Injectable()
export class ReceivablesChangesRepository {
  constructor(
    @Inject(Database) private db: Database,
    @Inject(ChecklistRepository) private permissions: ChecklistRepository,
  ) {}
  async compare(identity: Identity, input: ChangesInput) {
    return this.db.$transaction(
      async (tx) => {
        await this.permissions.authorize(tx, identity, input.entityId);
        const sources = await tx.receivableSnapshot.findMany({
          where: {
            organisationId: identity.organisationId,
            entityId: input.entityId,
            id: { in: [input.fromSnapshotId, input.toSnapshotId] },
          },
        });
        const from = sources.find((s) => s.id === input.fromSnapshotId),
          to = sources.find((s) => s.id === input.toSnapshotId);
        if (!from || !to)
          throw new ApiError(404, "NOT_FOUND", "Resource not found.");
        if (from.version > to.version)
          throw new ApiError(
            422,
            "VALIDATION_FAILED",
            "Earlier import must not have a newer version than later import.",
          );
        // Fixed, parameterized scope on both sides; C collation is also used for matching.
        // All rows are bounded by the existing 10,000/source import limit. Never N+1 queries.
        const side = (
          snapshotId: string,
        ) => Prisma.sql`SELECT * FROM "ReceivableSnapshotInvoice"
        WHERE organisation_id=${identity.organisationId}::uuid AND entity_id=${input.entityId}::uuid AND snapshot_id=${snapshotId}::uuid`;
        const record = (alias: "a" | "b") => {
          const r = alias === "a" ? Prisma.sql`a` : Prisma.sql`b`;
          return Prisma.sql`CASE WHEN ${r}.invoice_id IS NULL THEN NULL ELSE json_build_object(
          'customerId',${r}.customer_id,'customerName',${r}.customer_name,
          'issuedOn',to_char(${r}.issued_on,'YYYY-MM-DD'),'status',${r}.status,
          'amountCents',${r}.amount_cents::text,'paidCents',${r}.paid_cents::text) END`;
        };
        const rows = await tx.$queryRaw<JoinedRow[]>(Prisma.sql`
        SELECT COALESCE(a.invoice_id,b.invoice_id) AS "invoiceId",${record("a")} AS earlier,${record("b")} AS later
        FROM (${side(from.id)}) a FULL OUTER JOIN (${side(to.id)}) b
        ON a.invoice_id COLLATE "C"=b.invoice_id COLLATE "C"
        ORDER BY COALESCE(a.invoice_id,b.invoice_id) COLLATE "C" ASC LIMIT 20001`);
        if (rows.length > 20000)
          throw new ApiError(
            503,
            "UNAVAILABLE",
            "Imported register exceeds the supported comparison size.",
          );
        let earlier = 0n,
          later = 0n,
          sumDelta = 0n;
        const bridge = {
          newInLaterCents: 0n,
          absentFromLaterCents: 0n,
          increasedCents: 0n,
          decreasedCents: 0n,
        };
        const changed = [];
        for (const row of rows) {
          const a = contribution(row.earlier),
            b = contribution(row.later),
            delta = b - a;
          earlier += a;
          later += b;
          sumDelta += delta;
          const changedFields =
            row.earlier && row.later
              ? fields.filter((f) => row.earlier![f] !== row.later![f])
              : [];
          if (row.earlier && row.later && !changedFields.length) continue;
          const flags: string[] = [];
          if (!row.earlier) {
            flags.push("new_in_later");
            bridge.newInLaterCents += delta;
          } else if (!row.later) {
            flags.push("absent_from_later");
            bridge.absentFromLaterCents += delta;
          } else if (delta > 0n) bridge.increasedCents += delta;
          else if (delta < 0n) bridge.decreasedCents += delta;
          if (delta > 0n) flags.push("outstanding_increased");
          if (delta < 0n) flags.push("outstanding_decreased");
          changed.push({
            ...row,
            changedFields,
            flags,
            earlierOutstandingCents: a.toString(),
            laterOutstandingCents: b.toString(),
            deltaCents: delta.toString(),
          });
        }
        if (
          later - earlier !== sumDelta ||
          Object.values(bridge).reduce((a, b) => a + b, 0n) !== sumDelta
        )
          throw new ApiError(
            503,
            "UNAVAILABLE",
            "Comparison reconciliation failed.",
          );
        const items = changed.slice(input.offset, input.offset + input.limit);
        return {
          entityId: input.entityId,
          currency: "USD",
          basis: "all_issue_dates_cumulative_paid",
          fromSource: sourceMetadata(from),
          toSource: sourceMetadata(to),
          earlierOutstandingCents: earlier.toString(),
          laterOutstandingCents: later.toString(),
          deltaCents: sumDelta.toString(),
          changedInvoiceCount: changed.length,
          unionInvoiceCount: rows.length,
          bridge: Object.fromEntries(
            Object.entries(bridge).map(([k, v]) => [k, v.toString()]),
          ),
          sourceCutoffReversed: to.sourceCapturedAt < from.sourceCapturedAt,
          offset: input.offset,
          limit: input.limit,
          nextOffset:
            input.offset + items.length < changed.length
              ? input.offset + items.length
              : null,
          sort: "invoiceId:asc",
          items,
        };
      },
      { isolationLevel: "RepeatableRead", timeout: 15000 },
    );
  }
}
