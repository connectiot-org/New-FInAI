import { z } from "zod";
import { uuid, month } from "../validation";
const count = z
  .string()
  .regex(/^\d{1,5}$/)
  .transform(Number);
export const historyInput = z.strictObject({
  entityId: uuid,
  offset: count.pipe(z.number().int().max(10000)).default(0),
  limit: count.pipe(z.number().int().min(1).max(50)).default(20),
});
const fields = {
  entityId: uuid,
  snapshotId: uuid,
  period: z.union([z.literal("all"), month]),
  status: z
    .enum(["all", "outstanding", "Draft", "Issued", "Partial", "Paid"])
    .default("outstanding"),
  customerId: z.string().trim().min(1).max(200).optional(),
  search: z.string().trim().max(100).default(""),
};
export const pageInput = z.strictObject({
  ...fields,
  offset: count.pipe(z.number().int().max(10000)).default(0),
  limit: count.pipe(z.number().int().min(1).max(50)).default(20),
});
export const exportInput = z.strictObject(fields);
export type DetailInput = z.infer<typeof pageInput>;
export const changesInput = z.strictObject({
  entityId: uuid,
  fromSnapshotId: uuid,
  toSnapshotId: uuid,
  offset: count.pipe(z.number().int().max(20000)).default(0),
  limit: count.pipe(z.number().int().min(1).max(50)).default(20),
});
export type ChangesInput = z.infer<typeof changesInput>;
