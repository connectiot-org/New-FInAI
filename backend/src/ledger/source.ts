import { z } from "zod";
import {
  Inject,
  Injectable,
  Controller,
  Get,
  Req,
  Query,
} from "@nestjs/common";
import type { Request } from "express";
import { createHash, randomUUID } from "node:crypto";
import { Database } from "../database";
import type { Identity } from "../config";
import { ChecklistRepository } from "../checklist.repository";
import { requireImport } from "../workspace/permissions";
import { recordAudit } from "../audit";
import { ApiError } from "../errors";
import { parse, uuid, month } from "../validation";
import { text } from "../assistant/validation";
const cents = z
    .string()
    .regex(/^(0|[1-9]\d{0,15})$/)
    .refine((v) => BigInt(v) <= 9007199254740991n),
  date = z
    .string()
    .regex(/^(?!0000)\d{4}-(0[1-9]|1[0-2])-\d{2}$/)
    .refine((v) => {
      const d = new Date(v + "T00:00:00Z");
      return Number.isFinite(+d) && d.toISOString().startsWith(v);
    });
const account = z.strictObject({
  id: text(200).refine(Boolean),
  name: text(200).refine(Boolean),
  classification: z.enum([
    "cash",
    "receivable",
    "asset",
    "liability",
    "equity",
    "revenue",
    "expense",
  ]),
  normal: z.enum(["debit", "credit"]),
  openingDebit: cents,
  openingCredit: cents,
});
export const ledgerInput = z.strictObject({
  schemaVersion: z.literal(1),
  sourceName: text(200).refine(Boolean),
  capturedAt: z.iso.datetime({ offset: true }),
  mappingId: text(100).refine(Boolean),
  basis: z.enum(["accrual", "cash"]),
  currency: z.string().regex(/^[A-Z]{3}$/),
  precision: z.number().int().min(0).max(6),
  periodStart: date,
  periodEnd: date,
  completePostedRegister: z.literal(true),
  accounts: z.array(account).min(1).max(500),
  journals: z
    .array(
      z.strictObject({
        id: text(200).refine(Boolean),
        date,
        status: z.enum(["Posted", "Draft"]),
        lines: z
          .array(
            z.strictObject({
              id: text(200).refine(Boolean),
              accountId: text(200).refine(Boolean),
              debit: cents,
              credit: cents,
            }),
          )
          .min(2)
          .max(1000),
      }),
    )
    .max(5000),
});
export type LedgerInput = z.infer<typeof ledgerInput>;
export function validateLedger(value: unknown) {
  const x = parse(ledgerInput, value),
    fail = () => {
      throw new ApiError(
        422,
        "VALIDATION_FAILED",
        "Ledger must contain complete, balanced, uniquely identified accounts/journals in the declared source period.",
      );
    };
  if (
    !x.periodStart.endsWith("-01") ||
    x.periodEnd < x.periodStart ||
    Date.parse(x.capturedAt) > Date.now() + 300000 ||
    Date.parse(x.capturedAt) <
      Date.parse(x.periodEnd + "T00:00:00Z") + 86400000 ||
    new Date(Date.parse(x.periodEnd + "T00:00:00Z") + 86400000).getUTCDate() !==
      1
  )
    fail();
  const accounts = new Map(x.accounts.map((a) => [a.id, a]));
  if (accounts.size !== x.accounts.length) fail();
  let opening = 0n;
  for (const a of x.accounts) {
    if (
      a.normal !==
        (["revenue", "equity", "liability"].includes(a.classification)
          ? "credit"
          : "debit") ||
      (BigInt(a.openingDebit) > 0n && BigInt(a.openingCredit) > 0n)
    )
      fail();
    opening += BigInt(a.openingDebit) - BigInt(a.openingCredit);
  }
  if (
    opening !== 0n ||
    new Set(x.journals.map((j) => j.id)).size !== x.journals.length ||
    x.journals.reduce((n, j) => n + j.lines.length, 0) > 10000
  )
    fail();
  for (const j of x.journals) {
    if (
      j.date < x.periodStart ||
      j.date > x.periodEnd ||
      new Set(j.lines.map((l) => l.id)).size !== j.lines.length
    )
      fail();
    let balance = 0n;
    for (const l of j.lines) {
      if (
        !accounts.has(l.accountId) ||
        (BigInt(l.debit) > 0n && BigInt(l.credit) > 0n)
      )
        fail();
      balance += BigInt(l.debit) - BigInt(l.credit);
    }
    if (balance !== 0n) fail();
  }
  x.capturedAt = new Date(x.capturedAt).toISOString();
  x.accounts.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  x.journals.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const j of x.journals)
    j.lines.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return x;
}
export function mappingDigest(x: LedgerInput) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        x.currency,
        x.precision,
        x.basis,
        x.accounts
          .map((a) => [a.id, a.classification, a.normal])
          .sort((a, b) =>
            String(a[0]) < String(b[0])
              ? -1
              : String(a[0]) > String(b[0])
                ? 1
                : 0,
          ),
      ]),
    )
    .digest("hex");
}
function exact(n: bigint) {
  if (n > 9007199254740991n || n < -9007199254740991n)
    throw new ApiError(
      503,
      "UNSUPPORTED_RANGE",
      "Ledger totals exceed supported exact range.",
    );
  return n.toString();
}
export function calculateLedger(x: LedgerInput, period: string) {
  if (period < x.periodStart.slice(0, 7) || period > x.periodEnd.slice(0, 7))
    throw new ApiError(
      422,
      "SOURCE_COVERAGE",
      "The complete ledger source does not cover this month.",
    );
  const closing = new Map(
      x.accounts.map((a) => [
        a.id,
        BigInt(a.openingDebit) - BigInt(a.openingCredit),
      ]),
    ),
    movement = new Map(x.accounts.map((a) => [a.id, 0n]));
  for (const j of x.journals) {
    if (j.status !== "Posted" || j.date.slice(0, 7) > period) continue;
    for (const l of j.lines) {
      const n = BigInt(l.debit) - BigInt(l.credit);
      closing.set(l.accountId, closing.get(l.accountId)! + n);
      if (j.date.startsWith(period))
        movement.set(l.accountId, movement.get(l.accountId)! + n);
    }
  }
  const sum = (classes: string[], m: Map<string, bigint>) =>
    x.accounts
      .filter((a) => classes.includes(a.classification))
      .reduce((n, a) => n + m.get(a.id)!, 0n);
  const revenue = -sum(["revenue"], movement),
    expense = sum(["expense"], movement),
    assets = sum(["cash", "receivable", "asset"], closing),
    equity = -sum(["equity"], closing) - sum(["revenue", "expense"], closing),
    liabilities = -sum(["liability"], closing);
  if (assets !== equity + liabilities)
    throw new ApiError(
      503,
      "RECONCILIATION_FAILED",
      "Ledger source did not reconcile.",
    );
  return {
    metrics: Object.fromEntries(
      Object.entries({
        cash: sum(["cash"], closing),
        receivable: sum(["receivable"], closing),
        revenue,
        expense,
        profit: revenue - expense,
        assets,
        equity,
        liabilities,
      }).map(([k, v]) => [k, exact(v)]),
    ),
    accounts: x.accounts.map((a) => ({
      ...a,
      closing: exact(closing.get(a.id)! * (a.normal === "debit" ? 1n : -1n)),
      movement: exact(movement.get(a.id)! * (a.normal === "debit" ? 1n : -1n)),
    })),
  };
}
@Injectable()
export class LedgerService {
  approved = new Set<string>();
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
  ) {
    const content = validateLedger(value),
      digest = createHash("sha256")
        .update(JSON.stringify(content))
        .digest("hex");
    if (
      !Number.isInteger(expectedVersion) ||
      expectedVersion < 0 ||
      expectedVersion >= 2147483647
    )
      throw new ApiError(422, "VALIDATION_FAILED", "Invalid expected version.");
    const fingerprint = mappingDigest(content),
      review = {
        digest,
        mappingId: content.mappingId,
        mappingDigest: fingerprint,
        mappingApproval: `${content.mappingId}@${fingerprint}`,
      };
    return this.db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`ledger:${identity.organisationId}:${entityId}`},0))`;
        await requireImport(tx, identity, entityId);
        await tx.$queryRaw`SELECT entity_id FROM "EntityAccess" WHERE organisation_id=${identity.organisationId}::uuid AND user_id=${identity.userId}::uuid AND entity_id=${entityId}::uuid FOR SHARE`;
        await requireImport(tx, identity, entityId);
        const where = { organisationId: identity.organisationId, entityId },
          current = await tx.ledgerSnapshot.findFirst({
            where,
            orderBy: { version: "desc" },
          }),
          version = current?.version || 0;
        if (
          current?.digest === digest &&
          (expectedVersion === version || expectedVersion === version - 1)
        )
          return { status: "unchanged", version, ...review };
        if (
          expectedVersion !== version ||
          (await tx.ledgerSnapshot.findFirst({ where: { ...where, digest } }))
        )
          throw new ApiError(
            409,
            "VERSION_CONFLICT",
            "Source version changed or historical source was retried.",
          );
        if (!apply)
          return { status: "dry_run", version: version + 1, ...review };
        const row = await tx.ledgerSnapshot.create({
          data: {
            id: randomUUID(),
            ...where,
            version: version + 1,
            digest,
            actorId: identity.userId,
            sourceName: content.sourceName,
            capturedAt: new Date(content.capturedAt),
            content,
          },
        });
        await recordAudit(tx, identity, "ledger.imported", row.id, entityId, {
          version: row.version,
          count: content.journals.length,
        });
        return { status: "imported", version: row.version, ...review };
      },
      { timeout: 30000 },
    );
  }
  async read(
    identity: Identity,
    entityId: string,
    period: string,
    snapshotId?: string,
    offset = 0,
    limit = 20,
  ) {
    return this.db.$transaction(
      async (tx) => {
        await this.permissions.authorize(tx, identity, entityId);
        const row = await tx.ledgerSnapshot.findFirst({
          where: {
            organisationId: identity.organisationId,
            entityId,
            ...(snapshotId ? { id: snapshotId } : {}),
          },
          orderBy: { version: "desc" },
        });
        if (!row) {
          if (snapshotId)
            throw new ApiError(404, "NOT_FOUND", "Source not found.");
          return { dataState: "no_snapshot" as const, entityId, month: period };
        }
        const content = validateLedger(row.content);
        if (
          createHash("sha256").update(JSON.stringify(content)).digest("hex") !==
            row.digest ||
          row.sourceName !== content.sourceName ||
          row.capturedAt.toISOString() !== content.capturedAt
        )
          throw new ApiError(
            503,
            "SOURCE_INTEGRITY",
            "Ledger source integrity check failed.",
          );
        if (
          period < content.periodStart.slice(0, 7) ||
          period > content.periodEnd.slice(0, 7)
        )
          throw new ApiError(
            422,
            "SOURCE_COVERAGE",
            "The complete ledger source does not cover this month.",
          );
        const verified = this.approved.has(
          `${content.mappingId}@${mappingDigest(content)}`,
        );
        const calculation = verified ? calculateLedger(content, period) : null,
          journals = content.journals.filter(
            (j) => j.status === "Posted" && j.date.slice(0, 7) <= period,
          );
        return {
          dataState: "ready" as const,
          entityId,
          month: period,
          currency: content.currency,
          precision: content.precision,
          mappingVerified: verified,
          source: {
            snapshotId: row.id,
            version: row.version,
            sourceName: row.sourceName,
            capturedAt: row.capturedAt.toISOString(),
            importedAt: row.importedAt.toISOString(),
            actorId: row.actorId,
            digest: row.digest,
            mappingId: content.mappingId,
            mappingDigest: mappingDigest(content),
            periodStart: content.periodStart,
            periodEnd: content.periodEnd,
          },
          basis: `${content.basis} source. Complete imported posted journals; opening balances before source start; closing through selected month; period movements exclude openings and drafts.`,
          ...(calculation || { metrics: null, accounts: content.accounts }),
          offset,
          limit,
          total: journals.length,
          nextOffset: offset + limit < journals.length ? offset + limit : null,
          journals: journals.slice(offset, offset + limit),
        };
      },
      { isolationLevel: "RepeatableRead" },
    );
  }
}
@Controller("api/v1/ledger")
export class LedgerController {
  constructor(@Inject(LedgerService) private service: LedgerService) {}
  @Get() read(
    @Req() r: Request & { identity: Identity },
    @Query() query: unknown,
  ) {
    const integer = z
        .string()
        .regex(/^\d{1,5}$/)
        .transform(Number),
      q = parse(
        z.strictObject({
          entityId: uuid,
          month,
          snapshotId: uuid.optional(),
          offset: integer.pipe(z.number().max(10000)).default(0),
          limit: integer.pipe(z.number().min(1).max(100)).default(20),
        }),
        query,
      );
    return this.service.read(
      r.identity,
      q.entityId,
      q.month,
      q.snapshotId,
      q.offset,
      q.limit,
    );
  }
}
