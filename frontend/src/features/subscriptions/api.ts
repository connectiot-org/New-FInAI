import { z } from "zod";
import { apiRequest } from "../../lib/api";
const date = z.string().regex(/^(?!0000)\d{4}-(0[1-9]|1[0-2])-\d{2}$/);
const details = {
  supplierName: z
    .string()
    .min(1)
    .refine((v) => Array.from(v).length <= 200),
  subscriptionName: z
    .string()
    .min(1)
    .refine((v) => Array.from(v).length <= 200),
  renewalDate: date,
  cancellationDeadline: date.nullable(),
  notes: z
    .string()
    .refine((v) => Array.from(v).length <= 2000)
    .nullable(),
};
export const recordSchema = z.strictObject({
  id: z.uuid(),
  entityId: z.uuid(),
  ...details,
  archived: z.boolean(),
  version: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  renewalIndicator: z
    .enum(["Renewal date passed.", "Renewing soon."])
    .nullable(),
  cancellationIndicator: z
    .enum([
      "Cancellation deadline passed.",
      "Cancellation deadline approaching.",
    ])
    .nullable(),
});
const pageSchema = z.strictObject({
  items: z.array(recordSchema).max(50),
  total: z.number().int().nonnegative(),
  offset: z.number().int().nonnegative(),
  limit: z.number().int().min(1).max(50),
  nextOffset: z.number().int().nonnegative().nullable(),
  today: date,
  timezone: z.string(),
});
export type Renewal = z.infer<typeof recordSchema>;
export type RenewalPage = z.infer<typeof pageSchema>;
export type Details = Pick<
  Renewal,
  | "supplierName"
  | "subscriptionName"
  | "renewalDate"
  | "cancellationDeadline"
  | "notes"
>;
export const subscriptionApi = {
  entities: (signal: AbortSignal) =>
    apiRequest(
      "/entities",
      z.strictObject({
        items: z.array(z.strictObject({ id: z.uuid(), name: z.string() })),
      }),
      { signal },
    ),
  async list(
    entityId: string,
    search: string,
    status: string,
    offset: number,
    signal: AbortSignal,
  ) {
    const page = await apiRequest(
      `/subscription-renewals?${new URLSearchParams({ entityId, search, status, offset: String(offset), limit: "20" })}`,
      pageSchema,
      { signal },
    );
    if (
      page.items.some((v) => v.entityId !== entityId) ||
      new Set(page.items.map((v) => v.id)).size !== page.items.length ||
      page.offset !== offset ||
      page.limit !== 20
    )
      throw new Error("Backend returned inconsistent records.");
    return page;
  },
  create: (id: string, entityId: string, body: Details) =>
    apiRequest("/subscription-renewals", recordSchema, {
      method: "POST",
      body: { id, entityId, ...body },
    }),
  update: (row: Renewal, body: Details) =>
    apiRequest(`/subscription-renewals/${row.id}`, recordSchema, {
      method: "PATCH",
      body: { ...body, expectedVersion: row.version },
    }),
  archive: (row: Renewal) =>
    apiRequest(`/subscription-renewals/${row.id}/archive`, recordSchema, {
      method: "PATCH",
      body: { archived: !row.archived, expectedVersion: row.version },
    }),
};
