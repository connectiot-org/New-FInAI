import { z } from "zod";
import { ApiError } from "./errors";
export const uuid = z.uuid().transform((s) => s.toLowerCase());
export const month = z.string().regex(/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/);
const title = z
  .string()
  .max(1000)
  .transform((s) => s.trim())
  .refine(
    (s) =>
      Array.from(s).length >= 1 &&
      Array.from(s).length <= 200 &&
      !/[\u0000-\u001f\u007f]/.test(s) &&
      s.isWellFormed(),
    "Use 1–200 characters without control characters.",
  );
export const createInput = z.strictObject({
  id: uuid,
  entityId: uuid,
  month,
  title,
});
export const listInput = z.strictObject({ entityId: uuid, month });
export const updateInput = z.strictObject({
  completed: z.boolean(),
  expectedVersion: z.number().int().min(1).max(2147483647),
});
export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new ApiError(
      422,
      "VALIDATION_FAILED",
      "Please check the request fields.",
      result.error.issues.slice(0, 20).map((i) => ({
        field: i.path.join(".").slice(0, 100),
        message: i.message.slice(0, 200),
      })),
    );
  return result.data;
}
export function parseVersion(value: unknown) {
  if (typeof value !== "string" || !/^"[1-9]\d{0,9}"$/.test(value))
    throw new ApiError(
      422,
      "VALIDATION_FAILED",
      "If-Match must contain a quoted positive integer version.",
    );
  return parse(
    z.number().int().min(1).max(2147483647),
    Number(value.slice(1, -1)),
  );
}
export type CreateInput = z.infer<typeof createInput>;

export const copyInput = z.strictObject({
  entityId: uuid,
  month: month.refine(
    (v) => v !== "0001-01",
    "Previous month is outside the supported range.",
  ),
});
export function previousMonth(value: string) {
  const [year, m] = value.split("-").map(Number);
  return m === 1
    ? `${String(year - 1).padStart(4, "0")}-12`
    : `${String(year).padStart(4, "0")}-${String(m - 1).padStart(2, "0")}`;
}
