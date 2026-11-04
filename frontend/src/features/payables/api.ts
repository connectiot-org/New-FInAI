import { createContext, useContext } from "react";
import { z } from "zod";
import type { apiRequest } from "../../lib/api";
import { readSession, expireSession, sessionEpoch } from "../../lib/session";
export * from "./schemas";
export async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  options: Parameters<typeof apiRequest>[2] = {},
) {
  const epoch = sessionEpoch(),
    method = options.method || "GET";
  // Two bounded scanner commands can take 20 seconds before the DB result.
  // Ordinary requests retain their shorter deadline.
  const timeout =
    method === "POST" &&
    /^\/invoices\/[a-f0-9-]{36}\/documents\/[a-f0-9-]{36}\/scan$/.test(path)
      ? 35000
      : 10000;
  const signal = options.signal
    ? AbortSignal.any([options.signal, AbortSignal.timeout(timeout)])
    : AbortSignal.timeout(timeout);
  const headers: Record<string, string> = {};
  try {
    if (method !== "GET") {
      const session = await readSession(signal);
      headers["Content-Type"] = "application/json";
      headers["X-CSRF-Token"] = session.csrfToken;
    }
    if (epoch !== sessionEpoch())
      throw new Error("Identity changed. Reload records.");
    const response = await fetch("/api/v1/payables" + path, {
      method,
      headers,
      credentials: "same-origin",
      signal,
      ...(options.body === undefined
        ? {}
        : { body: JSON.stringify(options.body) }),
    });
    if (response.status === 401) expireSession(epoch);
    const data: unknown = await response.json();
    if (epoch !== sessionEpoch())
      throw new Error("Identity changed. Reload records.");
    if (!response.ok) {
      const error = z
        .object({
          code: z.string(),
          message: z.string(),
          requestId: z.string(),
        })
        .safeParse(data);
      throw Object.assign(
        new Error(
          error.success ? error.data.message : "Invoice request failed.",
        ),
        {
          status: response.status,
          // Only authoritative pre-commit validation/duplicate responses allow
          // edited create retries. Unknown outcomes retain the original payload.
          rejected:
            error.success &&
            ([400, 422].includes(response.status) ||
              (response.status === 409 &&
                error.data.code === "DUPLICATE_REFERENCE")),
        },
      );
    }
    const parsed = schema.safeParse(data);
    if (!parsed.success)
      throw new Error(
        "Backend returned inconsistent invoice records. Reload before retrying.",
      );
    return parsed.data;
  } catch (error) {
    if ((error as { status?: number }).status === 401) expireSession(epoch);
    throw error;
  }
}

export async function binary(path: string, file?: File, preview = false) {
  const epoch = sessionEpoch(),
    controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), file ? 45000 : 15000);
  try {
    const headers: Record<string, string> = {};
    if (file) {
      const session = await readSession(controller.signal);
      headers["X-CSRF-Token"] = session.csrfToken;
      headers["Content-Type"] = "application/pdf";
    }
    if (epoch !== sessionEpoch())
      throw new Error("Identity changed. Reload records.");
    const r = await fetch("/api/v1/payables" + path, {
      method: file ? "POST" : "GET",
      credentials: "same-origin",
      headers,
      body: file,
      signal: controller.signal,
    });
    if (r.status === 401) expireSession(epoch);
    if (epoch !== sessionEpoch())
      throw new Error("Identity changed. Reload records.");
    if (!r.ok) {
      const e = z.object({ message: z.string() }).safeParse(await r.json());
      throw new Error(e.success ? e.data.message : "Document request failed.");
    }
    if (file) {
      const result = z
        .strictObject({
          id: z.uuid(),
          scanState: z.enum(["synthetic", "quarantined", "clean", "infected"]),
        })
        .safeParse(await r.json());
      if (!result.success)
        throw new Error(
          "Backend returned an invalid upload result. Reload the invoice before retrying.",
        );
      if (epoch !== sessionEpoch())
        throw new Error("Identity changed. Reload records.");
      return;
    }
    const type = r.headers.get("content-type") || "";
    if (!/^(application\/pdf|text\/csv(?:; charset=utf-8)?)$/i.test(type))
      throw new Error("Unexpected download format.");
    const blob = await r.blob();
    if (epoch !== sessionEpoch()) throw new Error("Identity changed.");
    if (preview) return blob;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = type.startsWith("text/csv")
      ? "invoice-export.csv"
      : "supplier-invoice.pdf";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } finally {
    clearTimeout(timer);
  }
}
export const amount = (s: string) => {
  const n = BigInt(s);
  return `£${(n / 100n).toLocaleString("en-GB")}.${(n % 100n).toString().padStart(2, "0")}`;
};

export type PayablesClient = {
  request: typeof request;
  binary: typeof binary;
  basePath: string;
  development: boolean;
};
export const PayablesClientContext = createContext<PayablesClient>({
  request,
  binary,
  basePath: "/workspace/payables",
  development: false,
});
export function usePayablesClient() {
  return useContext(PayablesClientContext);
}
