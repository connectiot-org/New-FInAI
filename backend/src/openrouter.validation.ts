import { z } from "zod";
import { uuid } from "./validation";
export const freeModelId = z
  .string()
  .min(1)
  .max(200)
  .regex(/^(?:[a-zA-Z0-9][a-zA-Z0-9._/-]*:free|openrouter\/free)$/);
export const aiEntity = z.strictObject({ entityId: uuid });
export const aiPrompt = z.strictObject({
  entityId: uuid,
  modelId: freeModelId,
  prompt: z
    .string()
    .max(4000)
    .transform((v) => v.trim())
    .refine(
      (v) => v.length > 0 && v.isWellFormed() && !v.includes("\0"),
      "Enter a prompt of 1–4000 characters without NUL.",
    ),
});
export type AiPrompt = z.infer<typeof aiPrompt>;
const model = z.object({
  id: freeModelId,
  name: z.string().trim().min(1).max(200),
  pricing: z.record(z.string(), z.string()),
  architecture: z.object({
    input_modalities: z.array(z.string()),
    output_modalities: z.array(z.string()),
  }),
});
export const zeroPrice = (value: unknown) =>
  typeof value === "string" && /^0+(?:\.0+)?(?:[eE][+-]?\d+)?$/.test(value);
/** Fail closed on unknown/nonzero price entries; never round a small paid price to zero. */
export function freeTextModel(
  value: unknown,
): { id: string; name: string } | undefined {
  const parsed = model.safeParse(value);
  if (!parsed.success) return;
  const v = parsed.data;
  if (
    !zeroPrice(v.pricing.prompt) ||
    !zeroPrice(v.pricing.completion) ||
    !Object.values(v.pricing).every(zeroPrice) ||
    !v.architecture.input_modalities.includes("text") ||
    !v.architecture.output_modalities.includes("text")
  )
    return;
  return { id: v.id, name: v.name };
}
