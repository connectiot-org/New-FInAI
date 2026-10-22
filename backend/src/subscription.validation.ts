import { z } from "zod";
import { uuid } from "./validation";
export const calendarDate = z
  .string()
  .regex(/^(?!0000)\d{4}-(0[1-9]|1[0-2])-\d{2}$/)
  .refine((value) => {
    const d = new Date(`${value}T00:00:00Z`);
    return (
      Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value
    );
  }, "Use a valid ISO calendar date.");
const name = z
  .string()
  .max(1000)
  .transform((s) => s.trim())
  .refine(
    (s) =>
      s.isWellFormed() &&
      Array.from(s).length >= 1 &&
      Array.from(s).length <= 200 &&
      !/[\u0000-\u001f\u007f]/.test(s),
    "Use 1–200 characters without control characters.",
  );
const details = {
  supplierName: name,
  subscriptionName: name,
  renewalDate: calendarDate,
  cancellationDeadline: calendarDate.nullable().optional().default(null),
  notes: z
    .string()
    .max(8000)
    .refine(
      (s) =>
        s.isWellFormed() &&
        Array.from(s).length <= 2000 &&
        !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(s),
      "Use at most 2,000 characters.",
    )
    .nullable()
    .optional()
    .default(null),
};
const validDeadline = (v: {
  renewalDate: string;
  cancellationDeadline: string | null;
}) => !v.cancellationDeadline || v.cancellationDeadline <= v.renewalDate;
const deadlineError = {
  message: "Cancellation deadline cannot be later than renewal date.",
  path: ["cancellationDeadline"],
};
export const subscriptionCreate = z
  .strictObject({ id: uuid, entityId: uuid, ...details })
  .refine(validDeadline, deadlineError);
const version = z.number().int().min(1).max(2147483647);
export const subscriptionUpdate = z
  .strictObject({ ...details, expectedVersion: version })
  .refine(validDeadline, deadlineError);
export const subscriptionArchive = z.strictObject({
  archived: z.boolean(),
  expectedVersion: version,
});
const integer = (fallback: string, max: number, min = 0) =>
  z
    .string()
    .regex(/^\d{1,7}$/)
    .default(fallback)
    .transform(Number)
    .pipe(z.number().int().min(min).max(max));
export const subscriptionList = z.strictObject({
  entityId: uuid,
  search: z.string().trim().max(200).default(""),
  status: z.enum(["active", "archived", "all"]).default("active"),
  offset: integer("0", 1000000),
  limit: integer("20", 50, 1),
});
export type SubscriptionCreate = z.infer<typeof subscriptionCreate>;
export type SubscriptionUpdate = z.infer<typeof subscriptionUpdate>;
export type SubscriptionArchive = z.infer<typeof subscriptionArchive>;
export type SubscriptionList = z.infer<typeof subscriptionList>;
