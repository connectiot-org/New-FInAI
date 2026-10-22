import { z } from "zod";
import { apiRequest, ApiError } from "../../lib/api";
const modelId = z
  .string()
  .min(1)
  .max(200)
  .regex(/^(?:[a-zA-Z0-9][a-zA-Z0-9._/-]*:free|openrouter\/free)$/);
const modelsSchema = z.strictObject({
  items: z
    .array(z.strictObject({ id: modelId, name: z.string().min(1).max(200) }))
    .min(1)
    .max(2000),
});
export type FreeModel = z.infer<typeof modelsSchema>["items"][number];
const replySchema = z.strictObject({
  entityId: z.uuid(),
  modelId,
  reply: z.string().trim().min(1).max(16000),
});
export type AiReply = z.infer<typeof replySchema>;
export async function loadFreeModels(entityId: string, signal: AbortSignal) {
  const result = await apiRequest(
    `/ai/models?${new URLSearchParams({ entityId })}`,
    modelsSchema,
    { signal, expectedStatus: 200 },
  );
  if (new Set(result.items.map((m) => m.id)).size !== result.items.length)
    throw new ApiError("The model list could not be verified. Reload models.");
  return result.items;
}
export async function sendPrompt(
  input: { entityId: string; modelId: string; prompt: string },
  signal: AbortSignal,
) {
  const result = await apiRequest("/ai/chat", replySchema, {
    method: "POST",
    body: input,
    signal,
    expectedStatus: 200,
    timeoutMs: 40000,
  });
  if (result.entityId !== input.entityId || result.modelId !== input.modelId)
    throw new ApiError(
      "The AI response could not be verified. Wait before trying again.",
    );
  return result;
}
