import { z } from "zod";
import { createHash } from "node:crypto";
import { month, parse, uuid } from "../validation";
import { ApiError } from "../errors";
export const MAX_BYTES = 5 * 1024 * 1024;
export const scope = z.strictObject({
  entityId: uuid,
  period: z.union([z.literal("all"), month]),
});
const text = z
  .string()
  .max(1000)
  .transform((v) => v.trim())
  .refine(
    (v) =>
      v.length > 0 &&
      Array.from(v).length <= 200 &&
      v.isWellFormed() &&
      !/[\u0000-\u001f\u007f]/.test(v),
    "Invalid source text.",
  );
const date = z
  .string()
  .regex(/^(?!0000)\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(v + "T00:00:00Z");
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
  });
const cents = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const invoice = z
  .strictObject({
    invoiceId: text,
    customerId: text,
    customerName: text.nullable(),
    issuedOn: date,
    status: z.enum(["Draft", "Issued", "Partial", "Paid"]),
    amountCents: cents,
    paidCents: cents,
  })
  .refine(
    (v) =>
      v.paidCents <= v.amountCents &&
      (v.status === "Partial"
        ? v.paidCents > 0 && v.paidCents < v.amountCents
        : v.status === "Paid"
          ? v.paidCents === v.amountCents
          : v.paidCents === 0),
    "Status and payments disagree.",
  );
export const registerSchema = z.strictObject({
  schemaVersion: z.literal(1),
  currency: z.literal("USD"),
  sourceName: text,
  sourceCapturedAt: z.iso.datetime(),
  completeRegister: z.literal(true),
  invoices: z.array(invoice).max(10000),
});
export type Register = z.infer<typeof registerSchema>;
export type Scope = z.infer<typeof scope>;
export function validateRegister(value: unknown, now = Date.now()): Register {
  // Bound the collection before schema traversal/error construction.
  if (
    value &&
    typeof value === "object" &&
    "invoices" in value &&
    Array.isArray(value.invoices) &&
    value.invoices.length > 10000
  )
    throw new ApiError(
      422,
      "VALIDATION_FAILED",
      "Import exceeds 10,000 invoices.",
    );
  const input = parse(registerSchema, value);
  if (new Date(input.sourceCapturedAt).getTime() > now + 300000)
    throw new ApiError(
      422,
      "VALIDATION_FAILED",
      "Source capture time is in the future.",
    );
  const ids = new Set<string>(),
    names = new Map<string, string | null>();
  for (const row of input.invoices) {
    if (
      ids.has(row.invoiceId) ||
      (names.has(row.customerId) &&
        names.get(row.customerId) !== row.customerName)
    )
      throw new ApiError(
        422,
        "VALIDATION_FAILED",
        "Duplicate invoices or conflicting customer names.",
      );
    ids.add(row.invoiceId);
    names.set(row.customerId, row.customerName);
  }
  return {
    ...input,
    sourceCapturedAt: new Date(input.sourceCapturedAt).toISOString(),
    invoices: [...input.invoices].sort((a, b) =>
      a.invoiceId < b.invoiceId ? -1 : a.invoiceId > b.invoiceId ? 1 : 0,
    ),
  };
}
export function parseRegister(bytes: Buffer) {
  if (bytes.length > MAX_BYTES)
    throw new ApiError(422, "VALIDATION_FAILED", "Import exceeds 5 MiB.");
  try {
    return validateRegister(
      JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(bytes),
        (_key: string, value: unknown, context?: { source?: string }) => {
          if (typeof value !== "number") return value;
          const source = context?.source || "";
          const match = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(
            source,
          );
          if (!match || source.length > 100 || !Number.isSafeInteger(value))
            throw new Error("Invalid number.");
          const coefficient = BigInt(
            (match[1] || "") + match[2] + (match[3] || ""),
          );
          const scale = Number(match[4] || 0) - (match[3]?.length || 0);
          if (coefficient === 0n) return value;
          if (Math.abs(scale) > 100) throw new Error("Unsafe number.");
          const power = 10n ** BigInt(Math.abs(scale));
          if (scale < 0 && coefficient % power !== 0n)
            throw new Error("Fractional minor units.");
          const exact = scale < 0 ? coefficient / power : coefficient * power;
          if (exact !== BigInt(value)) throw new Error("Rounded minor units.");
          return value;
        },
      ),
    );
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(422, "VALIDATION_FAILED", "Invalid UTF-8 JSON import.");
  }
}
export const registerDigest = (v: Register) =>
  createHash("sha256")
    .update(
      JSON.stringify([
        v.schemaVersion,
        v.currency,
        v.sourceName,
        v.sourceCapturedAt,
        v.invoices.map((i) => [
          i.invoiceId,
          i.customerId,
          i.customerName,
          i.issuedOn,
          i.status,
          i.amountCents,
          i.paidCents,
        ]),
      ]),
    )
    .digest("hex");
