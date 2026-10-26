import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { z } from "zod";

const modelId = z.string().regex(/^[a-zA-Z0-9._:/-]{1,200}$/);
const message = z.strictObject({
  role: z.enum(["user", "assistant"]),
  content: z
    .string()
    .min(1)
    .max(4000)
    .refine((s) => !!s.trim()),
});
const input = z
  .strictObject({
    model: modelId,
    messages: z.array(message).min(1).max(11),
  })
  .refine(
    (v) =>
      v.messages.length % 2 === 1 &&
      v.messages.every((m, i) => m.role === (i % 2 ? "assistant" : "user")) &&
      v.messages.reduce((sum, m) => sum + m.content.length, 0) <= 12000,
  );
type Model = { id: string; name: string };
class ChatError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public retryAfter?: number,
  ) {
    super(message);
  }
}
async function boundedJson(response: Response, max: number) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Missing response");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  for (;;) {
    const next = await reader.read();
    if (next.done) break;
    bytes += next.value.length;
    if (bytes > max) {
      await reader.cancel();
      throw new Error("Response too large");
    }
    chunks.push(next.value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}
const zeroPrice = (v: unknown) =>
  typeof v === "string" && !!v.trim() && Number(v) === 0;

// Entirely separate from the financial API: no database, sessions, tools or stored history.
export function createPublicChatHandler(
  options: {
    env?: NodeJS.ProcessEnv;
    transport?: typeof fetch;
    now?: () => number;
  } = {},
) {
  const env = options.env || process.env;
  const transport = options.transport || fetch;
  const now = options.now || Date.now;
  const key = () =>
    env.OPENROUTER_API_KEY?.trim() || env.Openrouter?.trim() || "";
  let cached:
    { items: Model[]; retrievedAt: string; until: number } | undefined;
  let loading:
    Promise<{ items: Model[]; retrievedAt: string; until: number }> | undefined;
  const buckets = new Map<string, { count: number; until: number }>();
  let active = 0;
  function charge(id: string, limit: number) {
    const time = now();
    for (const [id, value] of buckets)
      if (value.until <= time) buckets.delete(id);
    const previous = buckets.get(id);
    if ((previous?.count || 0) >= limit || (!previous && buckets.size >= 2000))
      throw new ChatError(
        429,
        "RATE_LIMITED",
        "Test chat is busy. Wait a minute before trying again.",
        60,
      );
    buckets.set(id, {
      count: (previous?.count || 0) + 1,
      until: previous?.until || time + 60000,
    });
  }
  async function catalog() {
    if (cached && cached.until > now()) return cached;
    if (loading) return loading;
    loading = (async () => {
      try {
        const response = await transport(
          "https://openrouter.ai/api/v1/models",
          {
            signal: AbortSignal.timeout(8000),
            redirect: "error",
          },
        );
        if (!response.ok) {
          await response.body?.cancel();
          throw new Error();
        }
        const raw = z
          .object({ data: z.array(z.unknown()).max(5000) })
          .parse(await boundedJson(response, 8 * 1024 * 1024));
        const rows = new Map<string, Model>();
        for (const candidate of raw.data) {
          const parsed = z
            .object({
              id: modelId,
              name: z.string().trim().min(1).max(200),
              pricing: z.object({
                prompt: z.unknown(),
                completion: z.unknown(),
                request: z.unknown().optional(),
              }),
              architecture: z.object({
                input_modalities: z.array(z.string()),
                output_modalities: z.array(z.string()),
              }),
            })
            .safeParse(candidate);
          if (!parsed.success) continue;
          const row = parsed.data;
          if (
            !zeroPrice(row.pricing.prompt) ||
            !zeroPrice(row.pricing.completion) ||
            (row.pricing.request !== undefined &&
              !zeroPrice(row.pricing.request)) ||
            !row.architecture.input_modalities.includes("text") ||
            !row.architecture.output_modalities.includes("text")
          )
            continue;
          rows.set(row.id, { id: row.id, name: row.name });
        }
        if (rows.size > 1000) throw new Error();
        cached = {
          items: [...rows.values()].sort(
            (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
          ),
          retrievedAt: new Date(now()).toISOString(),
          until: now() + 300000,
        };
        return cached;
      } catch {
        throw new ChatError(
          503,
          "MODEL_CATALOG_UNAVAILABLE",
          "OpenRouter's model list is unavailable. Reload models to try again.",
        );
      }
    })();
    try {
      return await loading;
    } finally {
      loading = undefined;
    }
  }
  return async function publicChat(
    req: IncomingMessage & { body?: unknown },
    res: ServerResponse,
    route: string,
  ) {
    const send = (status: number, value: unknown, retryAfter?: number) => {
      if (res.destroyed || res.headersSent) return;
      res.writeHead(status, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        ...(retryAfter ? { "Retry-After": String(retryAfter) } : {}),
      });
      res.end(JSON.stringify(value));
    };
    let ownsSlot = false;
    const controller = new AbortController();
    const onClose = () => {
      if (!res.writableEnded) controller.abort();
    };
    res.once("close", onClose);
    try {
      if (!["models", "messages"].includes(route))
        throw new ChatError(404, "NOT_FOUND", "Chat route not found.");
      if (req.method !== (route === "models" ? "GET" : "POST"))
        throw new ChatError(405, "METHOD_NOT_ALLOWED", "Method not allowed.");
      if (route === "models") {
        const list = await catalog();
        send(200, {
          items: list.items,
          retrievedAt: list.retrievedAt,
          configured: !!key(),
          freeOnly: true,
        });
        return;
      }
      const origin =
        typeof req.headers.origin === "string" ? req.headers.origin : "";
      let trusted = false;
      try {
        const url = new URL(origin);
        trusted =
          url.origin === origin &&
          url.host === req.headers.host &&
          (url.protocol === "https:" ||
            (env.NODE_ENV === "test" &&
              url.protocol === "http:" &&
              url.hostname === "127.0.0.1"));
      } catch {
        /* Invalid/missing origin is rejected. */
      }
      if (!trusted)
        throw new ChatError(
          403,
          "FORBIDDEN",
          "Send chat messages from this site's own page.",
        );
      if (
        !/^application\/json(?:\s*;|$)/i.test(
          String(req.headers["content-type"] || ""),
        ) ||
        req.headers["content-encoding"]
      )
        throw new ChatError(
          400,
          "BAD_REQUEST",
          "Uncompressed JSON is required.",
        );
      if (!key())
        throw new ChatError(
          503,
          "PROVIDER_NOT_CONFIGURED",
          "Configure OPENROUTER_API_KEY as a server Secret in Vercel and redeploy. No database or sign-in is needed for this test chat.",
        );
      const ip = String(
        req.headers["x-vercel-forwarded-for"] ||
          req.socket.remoteAddress ||
          "unknown",
      )
        .split(",")[0]
        .slice(0, 100);
      charge("ip:" + ip, 5);
      charge("total", 20);
      if (active >= 2)
        throw new ChatError(
          429,
          "RATE_LIMITED",
          "Test chat is busy. Try again shortly.",
        );
      active++;
      ownsSlot = true;
      let raw: unknown;
      try {
        if (Number(req.headers["content-length"]) > 65536)
          throw new ChatError(
            422,
            "VALIDATION_FAILED",
            "Chat request is too large.",
          );
        let bytes: Buffer;
        if (req.body !== undefined)
          bytes = Buffer.isBuffer(req.body)
            ? req.body
            : Buffer.from(
                typeof req.body === "string"
                  ? req.body
                  : JSON.stringify(req.body),
              );
        else {
          const chunks: Buffer[] = [];
          let size = 0;
          await new Promise<void>((resolve, reject) => {
            const cleanup = () => {
              req.off("data", data);
              req.off("end", end);
              req.off("error", error);
              req.off("aborted", aborted);
            };
            const data = (chunk: Buffer) => {
              const b = Buffer.from(chunk);
              size += b.length;
              if (size > 65536) {
                cleanup();
                req.resume();
                reject(
                  new ChatError(
                    422,
                    "VALIDATION_FAILED",
                    "Chat request is too large.",
                  ),
                );
              } else chunks.push(b);
            };
            const end = () => {
              cleanup();
              resolve();
            };
            const error = () => {
              cleanup();
              reject(new Error("Request interrupted"));
            };
            const aborted = error;
            req.on("data", data);
            req.once("end", end);
            req.once("error", error);
            req.once("aborted", aborted);
          });
          bytes = Buffer.concat(chunks);
        }
        if (bytes.length > 65536)
          throw new ChatError(
            422,
            "VALIDATION_FAILED",
            "Chat request is too large.",
          );
        raw = JSON.parse(bytes.toString("utf8"));
      } catch (e) {
        if (e instanceof ChatError) throw e;
        throw new ChatError(
          400,
          "BAD_REQUEST",
          "Chat request contains invalid JSON.",
        );
      }
      const parsed = input.safeParse(raw);
      if (!parsed.success)
        throw new ChatError(
          422,
          "VALIDATION_FAILED",
          "Choose a model and send bounded, alternating text messages ending with your question.",
        );
      if (!(await catalog()).items.some((m) => m.id === parsed.data.model))
        throw new ChatError(
          422,
          "MODEL_NOT_FREE",
          "This model is not in the current free text-chat catalog. Reload models and select one again.",
        );
      const response = await transport(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.any([
            AbortSignal.timeout(40000),
            controller.signal,
          ]),
          headers: {
            Authorization: "Bearer " + key(),
            "Content-Type": "application/json",
            "X-Title": "FinAI test chat",
          },
          body: JSON.stringify({
            model: parsed.data.model,
            messages: parsed.data.messages,
            max_tokens: 4096,
            stream: false,
            provider: { max_price: { prompt: 0, completion: 0 } },
          }),
        },
      );
      if (!response.ok) {
        await response.body?.cancel();
        if ([401, 403].includes(response.status))
          throw new ChatError(
            503,
            "PROVIDER_AUTHENTICATION",
            "OpenRouter rejected the server API key. Check the Secret and redeploy.",
          );
        if (response.status === 402)
          throw new ChatError(
            429,
            "PROVIDER_QUOTA",
            "OpenRouter reports no remaining allowance for this key. Check its limits in OpenRouter.",
          );
        if (response.status === 429)
          throw new ChatError(
            429,
            "RATE_LIMITED",
            "OpenRouter's free-model rate limit was reached. Wait or choose another free model.",
          );
        if ([400, 404, 422].includes(response.status))
          throw new ChatError(
            503,
            "MODEL_UNAVAILABLE",
            "This free model could not process the request. Choose another model and try again.",
          );
        throw new ChatError(
          503,
          "PROVIDER_UNAVAILABLE",
          "OpenRouter is temporarily unavailable. Try again later.",
        );
      }
      try {
        const answer = z
          .object({
            model: z.string().min(1).max(200),
            choices: z
              .array(
                z.object({
                  message: z.object({
                    content: z.string().trim().min(1).max(100000),
                  }),
                }),
              )
              .min(1),
            usage: z
              .object({ cost: z.union([z.number(), z.string()]).optional() })
              .optional(),
            error: z.unknown().optional(),
          })
          .parse(await boundedJson(response, 512 * 1024));
        if (answer.error !== undefined) throw new Error();
        if (
          answer.usage?.cost !== undefined &&
          !zeroPrice(String(answer.usage.cost))
        )
          throw new Error();
        send(200, {
          selectedModel: parsed.data.model,
          model: answer.model,
          content: answer.choices[0].message.content,
        });
      } catch (e) {
        if (
          e instanceof Error &&
          ["AbortError", "TimeoutError"].includes(e.name)
        )
          throw e;
        throw new ChatError(
          502,
          "PROVIDER_RESPONSE_INVALID",
          "The model did not return a valid free text answer. Try another free model.",
        );
      }
    } catch (error) {
      const e =
        error instanceof ChatError
          ? error
          : error instanceof Error &&
              ["AbortError", "TimeoutError"].includes(error.name)
            ? new ChatError(
                504,
                "PROVIDER_TIMEOUT",
                "The model took too long to respond. Try again or choose another free model.",
              )
            : new ChatError(
                503,
                "PROVIDER_UNAVAILABLE",
                "The model connection failed. Try again later.",
              );
      send(
        e.status,
        {
          code: e.code,
          message: e.message,
          requestId: randomUUID(),
        },
        e.retryAfter,
      );
    } finally {
      if (ownsSlot) active--;
      res.off("close", onClose);
    }
  };
}
