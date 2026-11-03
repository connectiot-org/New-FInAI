import { z } from "zod";
import { createHash } from "node:crypto";
import { ApiError } from "../errors";
export const id = z.uuid().transform((v) => v.toLowerCase());
export const text = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine((v) => v.isWellFormed() && !/[\u0000-\u001f\u007f]/.test(v));
export const minor = z.string().regex(/^(0|[1-9]\d{0,9})$/);
export const version = z.number().int().min(1).max(2147483647);
const date = z.iso.date().refine((v) => !v.startsWith("0000"));
export const lineSchema = z.strictObject({
  description: text,
  quantity: z.string().regex(/^(0|[1-9]\d{0,5})(\.\d{1,4})?$/),
  unitMinor: minor,
  taxCode: z.enum(["NONE", "STANDARD"]),
  taxBps: z.union([z.literal(0), z.literal(2000)]),
  recoverable: z.boolean(),
  account: z.string().regex(/^[A-Z0-9-]{1,20}$/),
  taxAccount: z.string().regex(/^[A-Z0-9-]{1,20}$/),
  payableAccount: z.string().regex(/^[A-Z0-9-]{1,20}$/),
  costCentre: text,
});
export const fields = z
  .strictObject({
    supplierId: id,
    reference: text,
    invoiceDate: date,
    dueDate: date,
    currency: z.literal("GBP"),
    declaredGross: minor,
    lines: z.array(lineSchema).min(1).max(50),
  })
  .refine((v) => v.dueDate >= v.invoiceDate, "Due date precedes invoice date.");
export const createSchema = z
  .strictObject({ id, entityId: id, ...fields.shape })
  .refine((v) => v.dueDate >= v.invoiceDate);
export const patchSchema = z
  .strictObject({ expectedVersion: version, ...fields.shape })
  .refine((v) => v.dueDate >= v.invoiceDate);
const chain = z
  .strictObject({
    verifierId: id.nullable(),
    approverIds: z.array(id).min(1).max(2),
  })
  .refine(
    (v) => new Set(v.approverIds).size === v.approverIds.length,
    "Approvers must be distinct.",
  );
export const policySchema = z
  .strictObject({
    currency: z.literal("GBP"),
    rules: z
      .array(
        z.strictObject({
          priority: z.number().int().min(1).max(100),
          minimumGross: minor,
          ...chain.shape,
        }),
      )
      .max(10),
    fallback: chain,
  })
  .superRefine((v, c) => {
    for (const [index, rule] of v.rules.entries())
      if (new Set(rule.approverIds).size !== rule.approverIds.length)
        c.addIssue({
          code: "custom",
          path: ["rules", index, "approverIds"],
          message: "Approvers must be distinct.",
        });
    for (let i = 1; i < v.rules.length; i++)
      if (
        v.rules[i].priority <= v.rules[i - 1].priority ||
        BigInt(v.rules[i].minimumGross) >= BigInt(v.rules[i - 1].minimumGross)
      )
        c.addIssue({
          code: "custom",
          message: "Priorities must increase and thresholds decrease.",
        });
  });
export const actionSchema = z
  .strictObject({
    operationId: id,
    expectedVersion: version,
    action: z.enum([
      "review",
      "verify",
      "approve",
      "challenge",
      "reject",
      "correction",
    ]),
    reason: text.optional(),
  })
  .refine(
    (v) =>
      !["challenge", "reject", "correction"].includes(v.action) || !!v.reason,
    "A reason is required.",
  );
export type Fields = z.infer<typeof fields>;
export type Policy = z.infer<typeof policySchema>;
export type Route = {
  policyVersion: number;
  reason: string;
  verifierId: string | null;
  approverIds: string[];
  step: number;
  verified: boolean;
  submittedBy: string;
};
export function fingerprint(value: unknown): string {
  const canonical = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(canonical)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.entries(v)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, x]) => [k, canonical(x)]),
          )
        : v;
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}
export const referenceKey = (v: string) =>
  v.normalize("NFKC").trim().toLowerCase();
export function totals(input: Fields) {
  if (new Set(input.lines.map((line) => line.taxCode)).size > 1)
    throw new ApiError(
      422,
      "UNSUPPORTED_TAX",
      "Mixed tax treatments require a verified tax mapping and are not supported in this pilot.",
    );
  let net = 0n,
    tax = 0n,
    recoverable = 0n;
  const lines = input.lines.map((l) => {
    const [whole, fraction = ""] = l.quantity.split(".");
    const q = BigInt(whole) * 10000n + BigInt(fraction.padEnd(4, "0"));
    if (q === 0n || (l.taxCode === "NONE") !== (l.taxBps === 0))
      throw new ApiError(
        422,
        "VALIDATION_FAILED",
        "Unsupported quantity or tax mapping.",
      );
    const n = (q * BigInt(l.unitMinor) + 5000n) / 10000n;
    const t = (n * BigInt(l.taxBps) + 5000n) / 10000n;
    net += n;
    tax += t;
    if (l.recoverable) recoverable += t;
    return { net: n.toString(), tax: t.toString() };
  });
  if (net + tax > 1000000000n || net + tax <= 0n)
    throw new ApiError(
      422,
      "VALIDATION_FAILED",
      "Invoice total must be positive and at most GBP 10,000,000.",
    );
  return {
    net: net.toString(),
    tax: tax.toString(),
    gross: (net + tax).toString(),
    recoverable: recoverable.toString(),
    matches: net + tax === BigInt(input.declaredGross),
    lines,
  };
}
export function routePolicy(
  p: Policy,
  gross: string,
  policyVersion: number,
  submittedBy: string,
): Route {
  const rule = p.rules.find((r) => BigInt(gross) >= BigInt(r.minimumGross));
  const selected = rule || p.fallback;
  if (selected.approverIds.includes(submittedBy))
    throw new ApiError(
      422,
      "ROUTING_BLOCKED",
      "Submitter cannot approve this invoice. Select another reviewer or policy.",
    );
  return {
    policyVersion,
    reason: rule
      ? `Rule ${rule.priority}: gross at least ${rule.minimumGross} GBP minor units`
      : "Mandatory fallback",
    verifierId: selected.verifierId,
    approverIds: selected.approverIds,
    step: 0,
    verified: !selected.verifierId,
    submittedBy,
  };
}
export function csv(input: Fields, revision: number) {
  const t = totals(input);
  const rows = [
    [
      "reference",
      "revision",
      "currency",
      "account",
      "cost_centre",
      "debit_minor",
      "credit_minor",
      "supplier_id",
      "invoice_date",
      "due_date",
    ],
  ];
  input.lines.forEach((l, i) => {
    const n = BigInt(t.lines[i].net),
      tax = BigInt(t.lines[i].tax);
    rows.push([
      input.reference,
      String(revision),
      "GBP",
      l.account,
      l.costCentre,
      String(n + (l.recoverable ? 0n : tax)),
      "0",
    ]);
    if (l.recoverable && tax)
      rows.push([
        input.reference,
        String(revision),
        "GBP",
        l.taxAccount,
        l.costCentre,
        String(tax),
        "0",
      ]);
    rows.push([
      input.reference,
      String(revision),
      "GBP",
      l.payableAccount,
      l.costCentre,
      "0",
      String(n + tax),
    ]);
  });
  return (
    rows
      .map((r, index) =>
        index === 0
          ? r
          : [...r, input.supplierId, input.invoiceDate, input.dueDate],
      )
      .map((r) =>
        r
          .map(
            (v) =>
              '"' +
              (/^[=+\-@\t\r]/.test(v) ? "'" : "") +
              v.replaceAll('"', '""') +
              '"',
          )
          .join(","),
      )
      .join("\r\n") + "\r\n"
  );
}
