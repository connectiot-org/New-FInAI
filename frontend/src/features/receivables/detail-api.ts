import { z } from "zod";
import { apiRequest } from "../../lib/api";
import { compareSourceIds } from "./format";
import { sourceSchema } from "./source-schema";
export { sourceSchema } from "./source-schema";
const number = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  count = number.max(10000),
  text = z.string().min(1).max(400);
const invoice = z
  .strictObject({
    invoiceId: text,
    customerId: text,
    customerName: text.nullable(),
    issuedOn: z.iso.date(),
    status: z.enum(["Draft", "Issued", "Partial", "Paid"]),
    amountCents: number,
    paidCents: number,
    remainingCents: number,
  })
  .refine(
    (r) =>
      r.paidCents <= r.amountCents &&
      r.amountCents - r.paidCents === r.remainingCents,
  );
const customer = z.strictObject({
  customerId: text,
  customerName: text.nullable(),
  invoiceCount: count.min(1),
  remainingCents: number,
});
const period = z.string().regex(/^(all|(?!0000)\d{4}-(0[1-9]|1[0-2]))$/);
const bucket = z.strictObject({
  period: period.refine((v) => v !== "all"),
  invoiceCount: count.min(1),
  customerCount: count.min(1),
  remainingCents: number,
});
export const detailStatus = z.enum([
  "all",
  "outstanding",
  "Draft",
  "Issued",
  "Partial",
  "Paid",
]);
const common = {
  entityId: z.uuid(),
  period,
  currency: z.literal("USD"),
  source: sourceSchema,
  filters: z.strictObject({
    status: detailStatus,
    customerId: text.nullable(),
    search: z.string().max(100),
  }),
  sort: z.string(),
  offset: count,
  limit: count.min(1),
  total: count,
  invoiceCount: count,
  customerCount: count,
  remainingCents: number,
  nextOffset: count.nullable(),
};
export const detailSchema = z
  .discriminatedUnion("view", [
    z.strictObject({
      view: z.literal("invoice"),
      ...common,
      items: z.array(invoice).max(10000),
    }),
    z.strictObject({
      view: z.literal("customer"),
      ...common,
      items: z.array(customer).max(50),
    }),
    z.strictObject({
      view: z.literal("issue-period"),
      ...common,
      items: z.array(bucket).max(50),
    }),
  ])
  .superRefine((v, c) => {
    const fail = () =>
      c.addIssue({ code: "custom", message: "Inconsistent register page." });
    if (
      v.items.length !== Math.min(v.limit, Math.max(0, v.total - v.offset)) ||
      v.nextOffset !==
        (v.offset + v.items.length < v.total
          ? v.offset + v.items.length
          : null) ||
      v.customerCount > v.invoiceCount ||
      v.items.reduce((n, r) => n + BigInt(r.remainingCents), 0n) >
        BigInt(v.remainingCents)
    )
      fail();
    if (v.view === "invoice") {
      if (
        v.total !== v.invoiceCount ||
        v.sort !== "invoiceId:asc" ||
        new Set(v.items.map((r) => r.invoiceId)).size !== v.items.length
      )
        fail();
      for (let i = 1; i < v.items.length; i++)
        if (
          compareSourceIds(v.items[i - 1].invoiceId, v.items[i].invoiceId) >= 0
        )
          fail();
    }
    if (v.view === "customer") {
      if (
        v.total !== v.customerCount ||
        v.sort !== "remainingCents:desc,customerId:asc" ||
        new Set(v.items.map((r) => r.customerId)).size !== v.items.length
      )
        fail();
      for (let i = 1; i < v.items.length; i++) {
        const a = v.items[i - 1],
          b = v.items[i];
        if (
          a.remainingCents < b.remainingCents ||
          (a.remainingCents === b.remainingCents &&
            compareSourceIds(a.customerId, b.customerId) >= 0)
        )
          fail();
      }
    }
    if (v.view === "issue-period") {
      if (v.sort !== "period:asc" || v.total > v.invoiceCount) fail();
      for (let i = 1; i < v.items.length; i++)
        if (v.items[i - 1].period >= v.items[i].period) fail();
    }
    if (
      v.offset === 0 &&
      v.items.length === v.total &&
      v.items.reduce((n, r) => n + BigInt(r.remainingCents), 0n) !==
        BigInt(v.remainingCents)
    )
      fail();
  });
const historySchema = z.strictObject({
  entityId: z.uuid(),
  offset: count,
  limit: count.min(1).max(50),
  total: number,
  nextOffset: number.nullable(),
  items: z
    .array(
      sourceSchema.extend({
        importingActorId: z.uuid(),
        digest: z.string().regex(/^[a-f0-9]{64}$/),
      }),
    )
    .max(50),
});
export type DetailPage = z.infer<typeof detailSchema>;
export type DetailScope = {
  entityId: string;
  snapshotId: string;
  period: string;
  status: z.infer<typeof detailStatus>;
  customerId?: string;
  search: string;
  offset: number;
  limit: number;
};
export const receivablesDetailApi = {
  async history(entityId: string, signal?: AbortSignal, offset = 0) {
    const v = await apiRequest(
      `/receivables/snapshots?${new URLSearchParams({ entityId, offset: String(offset), limit: "20" })}`,
      historySchema,
      { signal },
    );
    if (
      v.entityId !== entityId ||
      v.offset !== offset ||
      v.limit !== 20 ||
      v.items.some((r, i) => i > 0 && v.items[i - 1].version <= r.version)
    )
      throw new Error("Invalid snapshot history.");
    return v;
  },
  async page(
    view: DetailPage["view"],
    s: DetailScope,
    signal: AbortSignal,
    exporting = false,
  ) {
    const path = exporting
      ? "export"
      : view === "invoice"
        ? "invoices"
        : view === "customer"
          ? "customers"
          : "issue-periods";
    const q = new URLSearchParams({
      entityId: s.entityId,
      snapshotId: s.snapshotId,
      period: s.period,
      status: s.status,
      search: s.search.trim(),
    });
    if (s.customerId) q.set("customerId", s.customerId);
    if (!exporting) {
      q.set("offset", String(s.offset));
      q.set("limit", String(s.limit));
    }
    const v = await apiRequest(`/receivables/${path}?${q}`, detailSchema, {
      signal,
    });
    if (
      v.view !== (exporting ? "invoice" : view) ||
      v.entityId !== s.entityId ||
      v.period !== s.period ||
      v.source.snapshotId !== s.snapshotId ||
      v.offset !== (exporting ? 0 : s.offset) ||
      v.limit !== (exporting ? 10000 : s.limit) ||
      v.filters.status !== s.status ||
      v.filters.search !== s.search.trim() ||
      v.filters.customerId !== (s.customerId || null)
    )
      throw new Error("Backend returned a different register scope.");
    return v;
  },
};
