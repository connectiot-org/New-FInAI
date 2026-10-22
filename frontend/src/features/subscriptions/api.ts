import { z } from "zod";
import { ApiError, apiRequest } from "../../lib/api";
import { loadAuthorizedEntities } from "../../lib/authorized-entities";
import { validCalendarDate } from "../../lib/calendar";
const date = z.string().refine(validCalendarDate);
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
export const recordSchema = z
  .strictObject({
    id: z.uuid(),
    entityId: z.uuid(),
    ...details,
    archived: z.boolean(),
    version: z.number().int().positive().max(2147483647),
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
  })
  .refine(
    (row) =>
      !row.cancellationDeadline || row.cancellationDeadline <= row.renewalDate,
  )
  .refine(
    (row) =>
      !row.archived || (!row.renewalIndicator && !row.cancellationIndicator),
  );
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
  entities: loadAuthorizedEntities,
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
      { signal, expectedStatus: 200 },
    );
    if (
      page.items.some((v) => v.entityId !== entityId) ||
      new Set(page.items.map((v) => v.id)).size !== page.items.length ||
      page.offset !== offset ||
      page.limit !== 20 ||
      page.items.length > page.limit ||
      page.nextOffset !==
        (page.offset + page.items.length < page.total
          ? page.offset + page.items.length
          : null) ||
      (status !== "all" &&
        page.items.some((row) => row.archived !== (status === "archived")))
    )
      throw new Error("Backend returned inconsistent records.");
    return page;
  },
  async create(id: string, entityId: string, body: Details) {
    const record = await apiRequest("/subscription-renewals", recordSchema, {
      method: "POST",
      body: { id, entityId, ...body },
      expectedStatus: [200, 201],
    });
    if (
      record.id !== id ||
      record.entityId !== entityId ||
      record.archived ||
      !sameDetails(record, body)
    )
      throw new ApiError("Backend returned inconsistent records.");
    return record;
  },
  async update(row: Renewal, body: Details) {
    const record = await apiRequest(
      `/subscription-renewals/${row.id}`,
      recordSchema,
      {
        method: "PATCH",
        body: { ...body, expectedVersion: row.version },
        expectedStatus: 200,
      },
    );
    if (
      record.id !== row.id ||
      record.entityId !== row.entityId ||
      record.version !== row.version + 1 ||
      record.archived !== row.archived ||
      !sameDetails(record, body)
    )
      throw new ApiError("Backend returned inconsistent records.");
    return record;
  },
  async archive(row: Renewal) {
    const record = await apiRequest(
      `/subscription-renewals/${row.id}/archive`,
      recordSchema,
      {
        method: "PATCH",
        body: { archived: !row.archived, expectedVersion: row.version },
        expectedStatus: 200,
      },
    );
    if (
      record.id !== row.id ||
      record.entityId !== row.entityId ||
      record.version !== row.version + 1 ||
      record.archived !== !row.archived ||
      !sameDetails(record, row)
    )
      throw new ApiError("Backend returned inconsistent records.");
    return record;
  },
};
function sameDetails(record: Renewal, body: Details) {
  return (
    record.supplierName === body.supplierName.trim() &&
    record.subscriptionName === body.subscriptionName.trim() &&
    record.renewalDate === body.renewalDate &&
    record.cancellationDeadline === body.cancellationDeadline &&
    record.notes === body.notes
  );
}
