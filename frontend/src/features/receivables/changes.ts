import { z } from "zod";
import { sourceSchema } from "./source-schema";
import { compareSourceIds } from "./format";

const maxTotal = 10000n * BigInt(Number.MAX_SAFE_INTEGER);
const money = z
  .string()
  .regex(/^(0|-?[1-9][0-9]{0,19})$/)
  .pipe(
    z.string().refine((v) => BigInt(v) >= -maxTotal && BigInt(v) <= maxTotal),
  );
const unsigned = money.pipe(z.string().refine((v) => BigInt(v) >= 0n));
const rowMoney = unsigned.pipe(
  z.string().refine((v) => BigInt(v) <= BigInt(Number.MAX_SAFE_INTEGER)),
);
const text = z
  .string()
  .min(1)
  .max(400)
  .refine((v) => Array.from(v).length <= 200);
export const changeFields = [
  "customerId",
  "customerName",
  "issuedOn",
  "status",
  "amountCents",
  "paidCents",
] as const;
const record = z
  .strictObject({
    customerId: text,
    customerName: text.nullable(),
    issuedOn: z.iso.date(),
    status: z.enum(["Draft", "Issued", "Partial", "Paid"]),
    amountCents: rowMoney,
    paidCents: rowMoney,
  })
  .refine(
    (r) =>
      rowMoney.safeParse(r.paidCents).success &&
      rowMoney.safeParse(r.amountCents).success &&
      BigInt(r.paidCents) <= BigInt(r.amountCents),
  );
export type ChangeRecord = z.infer<typeof record>;
const contribution = (r: ChangeRecord | null) =>
  r && r.status !== "Draft" ? BigInt(r.amountCents) - BigInt(r.paidCents) : 0n;
const item = z.strictObject({
  invoiceId: text,
  earlier: record.nullable(),
  later: record.nullable(),
  changedFields: z.array(z.enum(changeFields)).max(6),
  flags: z
    .array(
      z.enum([
        "new_in_later",
        "absent_from_later",
        "outstanding_increased",
        "outstanding_decreased",
      ]),
    )
    .max(3),
  earlierOutstandingCents: rowMoney,
  laterOutstandingCents: rowMoney,
  deltaCents: money,
});
const count = z.number().int().min(0).max(20000);
const transportSchema = z.strictObject({
  entityId: z.uuid(),
  currency: z.literal("USD"),
  basis: z.literal("all_issue_dates_cumulative_paid"),
  fromSource: sourceSchema,
  toSource: sourceSchema,
  earlierOutstandingCents: unsigned,
  laterOutstandingCents: unsigned,
  deltaCents: money,
  changedInvoiceCount: count,
  unionInvoiceCount: count,
  bridge: z.strictObject({
    newInLaterCents: unsigned,
    absentFromLaterCents: money.refine((v) => BigInt(v) <= 0n),
    increasedCents: unsigned,
    decreasedCents: money.refine((v) => BigInt(v) <= 0n),
  }),
  sourceCutoffReversed: z.boolean(),
  offset: count,
  limit: z.number().int().min(1).max(50),
  nextOffset: count.nullable(),
  sort: z.literal("invoiceId:asc"),
  items: z.array(item).max(50),
});
// Validate the transport before arithmetic: a malformed decimal must be a
// validation failure, never an exception from BigInt during safeParse.
export const changesSchema = transportSchema.pipe(
  transportSchema.superRefine((v, c) => {
    const fail = () =>
      c.addIssue({ code: "custom", message: "Inconsistent comparison." });
    if (
      v.fromSource.version > v.toSource.version ||
      v.sourceCutoffReversed !==
        Date.parse(v.toSource.sourceCapturedAt) <
          Date.parse(v.fromSource.sourceCapturedAt) ||
      BigInt(v.laterOutstandingCents) - BigInt(v.earlierOutstandingCents) !==
        BigInt(v.deltaCents) ||
      Object.values(v.bridge).reduce((s, n) => s + BigInt(n), 0n) !==
        BigInt(v.deltaCents) ||
      v.changedInvoiceCount > v.unionInvoiceCount ||
      v.items.length !==
        Math.min(v.limit, Math.max(0, v.changedInvoiceCount - v.offset)) ||
      v.nextOffset !==
        (v.offset + v.items.length < v.changedInvoiceCount
          ? v.offset + v.items.length
          : null)
    )
      fail();
    if (
      v.fromSource.snapshotId === v.toSource.snapshotId &&
      (v.changedInvoiceCount !== 0 || v.deltaCents !== "0")
    )
      fail();
    const visibleBridge = {
      newInLaterCents: 0n,
      absentFromLaterCents: 0n,
      increasedCents: 0n,
      decreasedCents: 0n,
    };
    for (let i = 0; i < v.items.length; i++) {
      const r = v.items[i],
        a = contribution(r.earlier),
        b = contribution(r.later),
        d = b - a;
      const fields =
        r.earlier && r.later
          ? changeFields.filter((f) => r.earlier![f] !== r.later![f])
          : [];
      const flags = [];
      if (!r.earlier) {
        flags.push("new_in_later");
        visibleBridge.newInLaterCents += d;
      } else if (!r.later) {
        flags.push("absent_from_later");
        visibleBridge.absentFromLaterCents += d;
      } else if (d > 0n) visibleBridge.increasedCents += d;
      else if (d < 0n) visibleBridge.decreasedCents += d;
      if (d > 0n) flags.push("outstanding_increased");
      if (d < 0n) flags.push("outstanding_decreased");
      if (
        (!r.earlier && !r.later) ||
        (r.earlier && r.later && !fields.length) ||
        JSON.stringify(r.changedFields) !== JSON.stringify(fields) ||
        JSON.stringify(r.flags) !== JSON.stringify(flags) ||
        a !== BigInt(r.earlierOutstandingCents) ||
        b !== BigInt(r.laterOutstandingCents) ||
        d !== BigInt(r.deltaCents) ||
        (i > 0 && compareSourceIds(v.items[i - 1].invoiceId, r.invoiceId) >= 0)
      )
        fail();
    }
    if (v.offset === 0 && v.nextOffset === null)
      for (const k of Object.keys(
        visibleBridge,
      ) as (keyof typeof visibleBridge)[])
        if (visibleBridge[k] !== BigInt(v.bridge[k])) fail();
  }),
);
export type ChangesPage = z.infer<typeof changesSchema>;
export function usdChangeCents(value: string, signed = false) {
  if (!money.safeParse(value).success)
    throw new Error("Invalid monetary value.");
  const n = BigInt(value),
    a = n < 0n ? -n : n;
  return (
    (n < 0n ? "−" : signed && n > 0n ? "+" : "") +
    "$" +
    new Intl.NumberFormat("en-US").format(a / 100n) +
    "." +
    (a % 100n).toString().padStart(2, "0")
  );
}
