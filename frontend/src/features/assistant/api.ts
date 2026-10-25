import { z } from "zod";
import { apiRequest } from "../../lib/api";
const version = z.number().int().min(1).max(2147483647),
  date = z.iso.datetime();
export const fact = z
  .strictObject({
    id: z.string(),
    label: z.string(),
    value: z.string(),
    unit: z.enum(["text", "minor", "count"]),
    currency: z.string().nullable(),
    precision: z.number().int().min(0).max(6),
    sourceId: z.string(),
    recordId: z.string().max(200).optional(),
    recordKind: z.enum(["customer", "account"]).optional(),
  })
  .superRefine((v, c) => {
    if (v.unit !== "text" && !/^-?\d+$/.test(v.value))
      c.addIssue({ code: "custom", message: "Invalid exact fact." });
  });
const source = z.strictObject({
  id: z.string(),
  label: z.string(),
  href: z
    .string()
    .refine(
      (v) =>
        /^\/workspace\/(receivables\/invoices\?|ledger\?|assistant\/source\?|checklist$|subscriptions$)/.test(
          v,
        ) && Array.from(v).every((c) => c.charCodeAt(0) > 31 && c !== "\\"),
    ),
  basis: z.string(),
  capturedAt: date.nullable(),
  importedAt: date.nullable(),
  retrievedAt: date,
  version: version.nullable(),
  snapshotId: z.uuid().nullable(),
});
export const answer = z
  .strictObject({
    facts: z.array(fact).max(12),
    sources: z.array(source).max(6),
    notes: z.array(z.string()).max(8),
    basis: z.string(),
    detail: z.enum(["concise", "detailed"]),
  })
  .superRefine((v, c) => {
    if (
      new Set(v.facts.map((f) => f.id)).size !== v.facts.length ||
      new Set(v.sources.map((s) => s.id)).size !== v.sources.length ||
      v.facts.some((f) => !v.sources.some((s) => s.id === f.sourceId))
    )
      c.addIssue({ code: "custom", message: "Invalid source references." });
  });
export const conversation = z.strictObject({
  id: z.uuid(),
  entityId: z.uuid(),
  month: z.string().regex(/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/),
  currency: z.string().regex(/^[A-Z]{3}$/),
  version,
  createdAt: date,
  expiresAt: date,
});
const turn = z
  .strictObject({
    id: z.uuid(),
    question: z.string(),
    status: z.enum(["pending", "completed", "failed", "cancelled"]),
    answer: answer.nullable(),
    failureCode: z.string().nullable(),
    model: z.string(),
    policy: z.string(),
    createdAt: date,
    finishedAt: date.nullable(),
  })
  .superRefine((v, c) => {
    if ((v.status === "completed") !== !!v.answer)
      c.addIssue({ code: "custom", message: "Invalid completed answer." });
  });
export const readSchema = conversation.extend({
  offset: z.number().int().min(0),
  limit: z.number().int().min(1).max(50),
  total: z.number().int().min(0).max(200),
  turns: z.array(turn).max(50),
});
const preference = z.strictObject({
  id: z.uuid(),
  entityId: z.uuid(),
  detail: z.enum(["concise", "detailed"]),
  note: z.string().max(500),
  version,
  createdAt: date,
  updatedAt: date,
  expiresAt: date,
});
export const capabilities = z.strictObject({
  configured: z.boolean(),
  ledgerMappingsEnabled: z.boolean(),
  model: z.string().nullable(),
  policy: z.string(),
  limits: z.strictObject({
    conversations: z.number(),
    turns: z.number(),
    questionCharacters: z.number(),
    leaseSeconds: z.number(),
    conversationDays: z.number(),
    preferenceDays: z.number(),
    maxTools: z.number(),
    tokenReservation: z.number(),
  }),
});
export type Conversation = z.infer<typeof conversation>;
export type ReadConversation = z.infer<typeof readSchema>;
export type Preference = z.infer<typeof preference>;
export const modelList = z.strictObject({
  items: z
    .array(
      z.strictObject({
        id: z.string().regex(/^[a-zA-Z0-9._:/-]{1,200}$/),
        name: z.string().min(1).max(200),
      }),
    )
    .max(500),
  retrievedAt: date,
  defaultModel: z.string().nullable(),
  freeOnly: z.literal(true),
});
export const assistantApi = {
  models: (signal: AbortSignal) =>
    apiRequest("/assistant/models", modelList, { signal }),
  capabilities: (signal: AbortSignal) =>
    apiRequest("/assistant/capabilities", capabilities, { signal }),
  list: (entityId: string, offset: number, signal: AbortSignal) =>
    apiRequest(
      `/assistant/conversations?${new URLSearchParams({ entityId, offset: String(offset), limit: "20" })}`,
      z.strictObject({
        offset: z.number().int(),
        limit: z.number().int(),
        total: z.number().int(),
        items: z.array(conversation).max(20),
      }),
      { signal },
    ),
  create: (
    body: { id: string; entityId: string; month: string; currency: string },
    signal: AbortSignal,
  ) =>
    apiRequest("/assistant/conversations", conversation, {
      method: "POST",
      body,
      signal,
    }),
  read: async (id: string, signal: AbortSignal, offset?: number) => {
    const v = await apiRequest(
      `/assistant/conversations/${id}${offset === undefined ? "" : `/turns?offset=${offset}&limit=50`}`,
      readSchema,
      { signal },
    );
    if (v.id !== id) throw new Error("Conversation scope mismatch.");
    return v;
  },
  send: (
    id: string,
    body: {
      id: string;
      question: string;
      expectedVersion: number;
      model?: string;
    },
    signal: AbortSignal,
  ) =>
    apiRequest(
      `/assistant/conversations/${id}/turns`,
      z.strictObject({ conversationVersion: version, turn }),
      { method: "POST", body, signal },
    ),
  remove: (id: string, expectedVersion: number, signal: AbortSignal) =>
    apiRequest(
      `/assistant/conversations/${id}`,
      z.strictObject({ status: z.literal("deleted") }),
      { method: "DELETE", body: { expectedVersion }, signal },
    ),
  cancel: (
    id: string,
    turnId: string,
    expectedVersion: number,
    signal: AbortSignal,
  ) =>
    apiRequest(
      `/assistant/conversations/${id}/turns/${turnId}`,
      z.strictObject({ status: z.literal("cancelled") }),
      { method: "DELETE", body: { expectedVersion }, signal },
    ),
  preferences: (entityId: string, signal: AbortSignal) =>
    apiRequest(
      `/assistant/preferences?${new URLSearchParams({ entityId })}`,
      z.strictObject({ items: z.array(preference).max(1) }),
      { signal },
    ),
  save: (
    id: string,
    body: {
      entityId: string;
      detail: "concise" | "detailed";
      note: string;
      expectedVersion: number;
    },
    signal: AbortSignal,
  ) =>
    apiRequest(
      `/assistant/preferences/${id}`,
      z.strictObject({ id: z.uuid(), version }),
      { method: "PUT", body, signal },
    ),
  forget: (p: Preference, signal: AbortSignal) =>
    apiRequest(
      `/assistant/preferences/${p.id}`,
      z.strictObject({ status: z.literal("forgotten") }),
      {
        method: "DELETE",
        body: { entityId: p.entityId, expectedVersion: p.version },
        signal,
      },
    ),
};
export function exactValue(f: z.infer<typeof fact>) {
  if (f.unit !== "minor") return f.value;
  const n = BigInt(f.value),
    negative = n < 0n,
    absolute = negative ? -n : n,
    scale = 10n ** BigInt(f.precision);
  return `${negative ? "−" : ""}${f.currency} ${new Intl.NumberFormat("en-US").format(absolute / scale)}${f.precision ? "." + (absolute % scale).toString().padStart(f.precision, "0") : ""}`;
}
