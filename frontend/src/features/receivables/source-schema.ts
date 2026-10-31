import { z } from "zod";
const number = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  text = z.string().min(1).max(400);
export const sourceSchema = z.strictObject({
  snapshotId: z.uuid(),
  version: number.min(1).max(2147483647),
  sourceName: text,
  sourceCapturedAt: z.iso.datetime(),
  importedAt: z.iso.datetime(),
});
