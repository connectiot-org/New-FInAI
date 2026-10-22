import { Inject, Injectable } from "@nestjs/common";
import { z } from "zod";
import { Database } from "./database";
import { ChecklistRepository } from "./checklist.repository";
import { Auth } from "./auth";
import type { Identity } from "./config";
import { ApiError } from "./errors";
import {
  freeTextModel,
  zeroPrice,
  type AiPrompt,
} from "./openrouter.validation";
const unavailable = (
  message = "AI provider unavailable or timed out. Wait before retrying; the request may still be processing.",
) => new ApiError(503, "UNAVAILABLE", message);
const invalidProvider = () =>
  new ApiError(
    502,
    "UNAVAILABLE",
    "AI provider returned an invalid response. Try another free model later.",
  );
@Injectable()
export class OpenRouterService {
  // Replaced only by host-side test fixtures, never by request/config URLs.
  fetcher: typeof fetch = (...args) => fetch(...args);
  configuredKey: string | undefined;
  private limits: Auth;
  constructor(
    @Inject(ChecklistRepository) private permissions: ChecklistRepository,
    @Inject(Database) db: Database,
  ) {
    this.limits = new Auth(db);
  }
  private key(relay?: string) {
    const key = this.configuredKey || relay;
    if (!key || !/^[\x21-\x7e]{32,512}$/.test(key))
      throw unavailable(
        "AI is not configured. Ask your administrator to configure OpenRouter.",
      );
    return key;
  }
  private async json(
    path: "models" | "chat/completions",
    options: RequestInit,
    signal: AbortSignal,
    milliseconds: number,
    limit: number,
  ): Promise<unknown> {
    try {
      const response = await this.fetcher(
        `https://openrouter.ai/api/v1/${path}`,
        {
          ...options,
          redirect: "error",
          signal: AbortSignal.any([signal, AbortSignal.timeout(milliseconds)]),
        },
      );
      if (response.status !== 200) {
        await response.body?.cancel();
        if (response.status === 429)
          throw new ApiError(
            429,
            "RATE_LIMITED",
            "Free model quota reached. Wait or select another free model.",
          );
        if ([401, 402, 403].includes(response.status))
          throw unavailable(
            "OpenRouter rejected this request. Ask your administrator to check the key and free-model access.",
          );
        throw unavailable();
      }
      if (
        !/^application\/json(?:\s*;|$)/i.test(
          response.headers.get("content-type") || "",
        ) ||
        !response.body
      ) {
        await response.body?.cancel();
        throw invalidProvider();
      }
      const reader = response.body.getReader();
      const chunks: Buffer[] = [];
      let size = 0;
      try {
        while (true) {
          const item = await reader.read();
          if (item.done) break;
          size += item.value.byteLength;
          if (size > limit) {
            await reader.cancel();
            throw invalidProvider();
          }
          chunks.push(Buffer.from(item.value));
        }
      } finally {
        reader.releaseLock();
      }
      try {
        return JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        throw invalidProvider();
      }
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw unavailable();
    }
  }
  private async catalog(signal: AbortSignal) {
    const raw = await this.json(
      "models",
      { method: "GET" },
      signal,
      5000,
      8 * 1024 * 1024,
    );
    const parsed = z
      .object({ data: z.array(z.unknown()).max(10000) })
      .safeParse(raw);
    if (!parsed.success) throw invalidProvider();
    const models = parsed.data.data
      .map(freeTextModel)
      .filter((v): v is { id: string; name: string } => !!v);
    if (
      models.length > 2000 ||
      new Set(models.map((m) => m.id)).size !== models.length
    )
      throw invalidProvider();
    return models.sort(
      (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
    );
  }
  async models(
    identity: Identity,
    entityId: string,
    relay: string | undefined,
    signal: AbortSignal,
  ) {
    await this.permissions.requireEntityRead(identity, entityId);
    const key = this.key(relay);
    await this.limits.limit(
      `ai-catalog:${identity.organisationId}:${identity.userId}`,
      30,
      60,
    );
    const items = await this.catalog(signal);
    if (!items.length)
      throw unavailable("No free text models are available. Try again later.");
    // Do not let an unexpected upstream field echo a credential into the browser.
    if (items.some((m) => m.id.includes(key) || m.name.includes(key)))
      throw invalidProvider();
    return { items };
  }
  async chat(
    identity: Identity,
    input: AiPrompt,
    relay: string | undefined,
    signal: AbortSignal,
  ) {
    await this.permissions.requireEntityRead(identity, input.entityId);
    const key = this.key(relay);
    await this.limits.limit(
      `ai-user:${identity.organisationId}:${identity.userId}`,
      10,
      60,
    );
    await this.limits.limit(`ai-org:${identity.organisationId}`, 30, 60);
    await this.limits.limit("ai-global", 60, 60);
    const models = await this.catalog(signal);
    if (!models.some((m) => m.id === input.modelId))
      throw new ApiError(
        422,
        "VALIDATION_FAILED",
        "This free model is unavailable. Reload models and choose another.",
      );
    const raw = await this.json(
      "chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: input.modelId,
          messages: [{ role: "user", content: input.prompt }],
          max_tokens: 512,
          stream: false,
          n: 1,
          provider: {
            allow_fallbacks: false,
            require_parameters: true,
            max_price: { prompt: 0, completion: 0, request: 0, image: 0 },
          },
        }),
      },
      signal,
      25000,
      128 * 1024,
    );
    const reply = z
      .object({
        choices: z
          .array(
            z.object({
              message: z.object({
                content: z.string().trim().min(1).max(16000),
              }),
            }),
          )
          .length(1),
        usage: z
          .object({ cost: z.union([z.number(), z.string()]).optional() })
          .passthrough()
          .optional(),
      })
      .safeParse(raw);
    if (!reply.success) throw invalidProvider();
    const cost = reply.data.usage?.cost;
    const text = reply.data.choices[0].message.content;
    if (
      (cost !== undefined && cost !== 0 && !zeroPrice(cost)) ||
      text.includes(key) ||
      !text.isWellFormed()
    )
      throw invalidProvider();
    return { entityId: input.entityId, modelId: input.modelId, reply: text };
  }
}
