import { z } from "zod";
import { apiRequest } from "../../lib/api";
const cents = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  count = z.number().int().min(0).max(10000);
const text = z
  .string()
  .min(1)
  .max(400)
  .refine(
    (v) =>
      v.trim().length > 0 &&
      Array.from(v).length <= 200 &&
      Array.from(v).every((c) => {
        const n = c.codePointAt(0)!;
        return n < 0xd800 || n > 0xdfff;
      }) &&
      Array.from(v).every(
        (c) => c.codePointAt(0)! >= 32 && c.codePointAt(0) !== 127,
      ),
  );
const period = z.string().regex(/^(all|(?!0000)\d{4}-(0[1-9]|1[0-2]))$/);
const scope = { entityId: z.uuid(), period, currency: z.literal("USD") };
const row = z.strictObject({
  customerId: text,
  customerName: text.nullable(),
  invoiceCount: count.min(1),
  remainingCents: cents.min(1),
});
export const summarySchema = z
  .discriminatedUnion("dataState", [
    z.strictObject({ dataState: z.literal("no_snapshot"), ...scope }),
    z.strictObject({
      dataState: z.literal("ready"),
      ...scope,
      source: z.strictObject({
        snapshotId: z.uuid(),
        version: z.number().int().min(1).max(2147483647),
        sourceName: text,
        sourceCapturedAt: z.iso.datetime(),
        importedAt: z.iso.datetime(),
      }),
      totalCents: cents,
      invoiceCount: count,
      customerCount: count,
      rows: z.array(row).max(5),
    }),
  ])
  .superRefine((v, ctx) => {
    if (v.dataState !== "ready") return;
    const fail = () =>
      ctx.addIssue({
        code: "custom",
        message: "Inconsistent imported summary.",
      });
    const rows = v.rows,
      amount = rows.reduce((n, r) => n + BigInt(r.remainingCents), 0n),
      invoices = rows.reduce((n, r) => n + r.invoiceCount, 0),
      hidden = v.customerCount - rows.length;
    if (
      rows.length !== Math.min(5, v.customerCount) ||
      new Set(rows.map((r) => r.customerId)).size !== rows.length ||
      v.invoiceCount < v.customerCount ||
      BigInt(v.totalCents) < amount + BigInt(hidden) ||
      v.invoiceCount < invoices + hidden ||
      (v.customerCount === 0) !== (v.totalCents === 0) ||
      (v.customerCount === 0) !== (v.invoiceCount === 0)
    )
      fail();
    if (
      hidden === 0 &&
      (BigInt(v.totalCents) !== amount || v.invoiceCount !== invoices)
    )
      fail();
    if (
      Date.parse(v.source.sourceCapturedAt) >
        Date.parse(v.source.importedAt) + 300000 ||
      Date.parse(v.source.importedAt) > Date.now() + 300000
    )
      fail();
    for (let i = 1; i < rows.length; i++) {
      const a = rows[i - 1],
        b = rows[i];
      if (
        a.remainingCents < b.remainingCents ||
        (a.remainingCents === b.remainingCents &&
          compareIds(a.customerId, b.customerId) >= 0)
      )
        fail();
    }
  });
// PostgreSQL COLLATE C orders UTF-8 byte sequences, including non-BMP source IDs.
function compareIds(a: string, b: string) {
  const x = new TextEncoder().encode(a),
    y = new TextEncoder().encode(b);
  for (let i = 0; i < Math.min(x.length, y.length); i++)
    if (x[i] !== y[i]) return x[i] - y[i];
  return x.length - y.length;
}
export type ImportedSummary = z.infer<typeof summarySchema>;
export const validPeriod = (v: string) => period.safeParse(v).success;
export const receivablesApi = {
  entities: (signal: AbortSignal) =>
    apiRequest(
      "/entities",
      z.strictObject({
        items: z
          .array(
            z.strictObject({ id: z.uuid(), name: z.string().min(1).max(200) }),
          )
          .refine((v) => new Set(v.map((e) => e.id)).size === v.length),
      }),
      { signal },
    ),
  async summary(entityId: string, period: string, signal: AbortSignal) {
    const data = await apiRequest(
      `/receivables/outstanding-customers?${new URLSearchParams({ entityId, period })}`,
      summarySchema,
      { signal },
    );
    if (data.entityId !== entityId || data.period !== period)
      throw new Error("Backend returned a different receivables scope.");
    return data;
  },
};
