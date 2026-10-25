import { z } from "zod";
import { uuid, month } from "../validation";
export const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine(
      (v) =>
        v.isWellFormed() &&
        !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v),
      "Invalid text.",
    );
export const version = z.number().int().min(1).max(2147483647);
export const create = z.strictObject({
  id: uuid,
  entityId: uuid,
  month,
  currency: z.string().regex(/^[A-Z]{3}$/),
});
export const send = z.strictObject({
  id: uuid,
  question: text(2000).refine((v) => v.length > 0),
  expectedVersion: version,
});
export const preference = z.strictObject({
  entityId: uuid,
  detail: z.enum(["concise", "detailed"]),
  note: text(500),
  expectedVersion: z.number().int().min(0).max(2147483647),
});
const offset = z
  .string()
  .regex(/^\d{1,5}$/)
  .transform(Number);
export const page = z.strictObject({
  offset: offset.pipe(z.number().max(10000)).default(0),
  limit: offset.pipe(z.number().min(1).max(50)).default(20),
});
export const list = page.extend({ entityId: uuid });
export const operation = z.strictObject({
  kind: z.enum([
    "receivables",
    "invoices",
    "checklist",
    "subscriptions",
    "ledger",
    "clarify",
    "unsupported",
  ]),
  period: z.enum(["current", "previous"]),
  customerId: text(200).nullable(),
  accountId: text(200).nullable(),
  metric: z.enum([
    "all",
    "cash",
    "revenue",
    "expense",
    "profit",
    "receivable",
    "assets",
    "equity",
  ]),
  reason: z.enum([
    "none",
    "ambiguous",
    "unsupported",
    "missing_ledger",
    "scope_change",
  ]),
});
export const plan = z.strictObject({
  operations: z.array(operation).min(1).max(3),
});
export const composition = z.strictObject({
  factIds: z.array(z.string().max(80)).max(12),
  noteIds: z.array(z.string().max(80)).max(8),
});
export const fact = z.strictObject({
  id: z.string(),
  label: z.string(),
  value: z.string(),
  unit: z.enum(["text", "minor", "count"]),
  currency: z.string().nullable(),
  precision: z.number().int().min(0).max(6),
  sourceId: z.string(),
  recordId: z.string().max(200).optional(),
  recordKind: z.enum(["customer", "account"]).optional(),
});
export const source = z.strictObject({
  id: z.string(),
  label: z.string(),
  href: z.string().regex(/^\/workspace\//),
  basis: z.string(),
  capturedAt: z.iso.datetime().nullable(),
  importedAt: z.iso.datetime().nullable(),
  retrievedAt: z.iso.datetime(),
  version: z.number().int().nullable(),
  snapshotId: z.uuid().nullable(),
});
export const answer = z.strictObject({
  facts: z.array(fact).max(12),
  sources: z.array(source).max(6),
  notes: z.array(z.string()).max(8),
  basis: z.string(),
  detail: z.enum(["concise", "detailed"]),
});
export type Plan = z.infer<typeof plan>;
export type Fact = z.infer<typeof fact>;
export type Source = z.infer<typeof source>;
export const POLICY = "grounded-facts-v1";
