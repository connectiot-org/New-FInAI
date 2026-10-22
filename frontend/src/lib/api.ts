import { z } from "zod";
import { sessionExpired, sessionRevision } from "./session-lifecycle";
export const sessionEnabled = import.meta.env.VITE_AUTH_MODE === "session";
export class ApiError extends Error {
  constructor(
    message: string,
    public status = 0,
  ) {
    super(message);
  }
}
export async function apiRequest<T>(
  path: string,
  schema: z.ZodType<T>,
  options: {
    method?: string;
    body?: unknown;
    signal?: AbortSignal;
    expectedStatus?: number | readonly number[];
    timeoutMs?: number;
  } = {},
): Promise<T> {
  const revision = sessionRevision();
  const method = options.method || "GET",
    base =
      import.meta.env.VITE_API_BASE_URL ||
      (import.meta.env.PROD ? "/api/v1" : "http://127.0.0.1:3000/api/v1");
  const url = new URL(base.replace(/\/$/, "") + path, location.origin);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    (import.meta.env.PROD && url.origin !== location.origin)
  )
    throw new ApiError(
      "API address must use the configured same-origin proxy.",
    );
  const headers: Record<string, string> = {};
  if (method !== "GET") headers["Content-Type"] = "application/json";
  const signal = options.signal
    ? AbortSignal.any([
        options.signal,
        AbortSignal.timeout(options.timeoutMs ?? 10000),
      ])
    : AbortSignal.timeout(options.timeoutMs ?? 10000);
  try {
    if (sessionEnabled && method !== "GET") {
      const r = await fetch("/auth/session", {
        credentials: "same-origin",
        signal,
      });
      if (r.status === 401) sessionExpired(revision);
      if (!r.ok)
        throw new ApiError(
          "Session expired. Sign out and sign in again.",
          r.status,
        );
      const session = z
        .strictObject({ csrfToken: z.string().regex(/^[a-f0-9]{64}$/) })
        .parse(await r.json());
      headers["X-CSRF-Token"] = session.csrfToken;
    }
    const r = await fetch(url, {
      method,
      credentials: sessionEnabled ? "same-origin" : "omit",
      headers,
      signal,
      ...(options.body !== undefined
        ? { body: JSON.stringify(options.body) }
        : {}),
    });
    let data: unknown;
    try {
      data = await r.json();
    } catch {
      throw new ApiError(
        "Backend returned an invalid response. Reload before retrying.",
        r.status,
      );
    }
    if (!r.ok) {
      if (r.status === 401 && sessionEnabled) sessionExpired(revision);
      const error = z.object({ message: z.string() }).safeParse(data);
      throw new ApiError(
        error.success ? error.data.message : "Request failed.",
        r.status,
      );
    }
    const allowed =
      typeof options.expectedStatus === "number"
        ? [options.expectedStatus]
        : options.expectedStatus;
    if (allowed && !allowed.includes(r.status))
      throw new ApiError("Backend returned an unexpected response.", r.status);
    const parsed = schema.safeParse(data);
    if (!parsed.success)
      throw new ApiError(
        "Backend returned inconsistent records. Reload before retrying.",
      );
    return parsed.data;
  } catch (error) {
    if (options.signal?.aborted) throw error;
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      "Cannot reach the backend. Reload records before retrying.",
    );
  }
}
