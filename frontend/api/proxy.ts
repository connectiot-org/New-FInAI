import { createRequire } from "node:module";
import { waitUntil } from "@vercel/functions";
import { createPublicChatHandler } from "../server/public-chat.js";
import {
  createEmbeddedHandler,
  type ApplicationModule,
} from "../server/embedded.js";
import { request } from "node:https";
import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { readRequestBody, RequestBodyError } from "../server/request-body.js";
export const config = { maxDuration: 60 };
const require = createRequire(import.meta.url);
const publicChat = createPublicChatHandler();
const embedded = createEmbeddedHandler({
  loadApplication: () =>
    require("../.finai-server/src/app.js") as ApplicationModule,
  retainWork: waitUntil,
});
type ProxyRequest = IncomingMessage & { body?: unknown };
export default async function proxy(req: ProxyRequest, res: ServerResponse) {
  const chatRoute = new URL(
    req.url || "/",
    "http://localhost",
  ).searchParams.get("route");
  if (chatRoute?.startsWith("api/chat/"))
    return publicChat(req, res, chatRoute.slice("api/chat/".length));
  const fail = (status: number, message: string) => {
    if (res.destroyed || res.writableEnded) return;
    if (res.headersSent) {
      res.destroy();
      return;
    }
    const requestId = randomUUID();
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Request-Id": requestId,
      ...(status === 408 || status === 422 ? { Connection: "close" } : {}),
    });
    res.end(
      JSON.stringify({
        code:
          status === 404
            ? "NOT_FOUND"
            : status === 403
              ? "FORBIDDEN"
              : status === 400
                ? "BAD_REQUEST"
                : status === 408
                  ? "REQUEST_TIMEOUT"
                  : status === 422
                    ? "VALIDATION_FAILED"
                    : "UNAVAILABLE",
        message,
        requestId,
      }),
    );
  };
  const backend =
      process.env.FINAI_API_MODE === "embedded"
        ? undefined
        : process.env.FINAI_BACKEND_ORIGIN,
    publicOrigin = process.env.FINAI_PUBLIC_ORIGIN,
    token = process.env.FINAI_PROXY_TOKEN;
  if (!backend && process.env.FINAI_API_MODE !== "remote")
    return embedded.handler(req, res);
  if (!backend || !publicOrigin || !token)
    return fail(503, "API proxy is not configured.");
  let target: URL, publicURL: URL;
  try {
    target = new URL(backend);
    publicURL = new URL(publicOrigin);
    if (
      target.protocol !== "https:" ||
      target.origin !== backend ||
      publicURL.protocol !== "https:" ||
      publicURL.origin !== publicOrigin ||
      target.username ||
      target.password
    )
      throw new Error();
  } catch {
    return fail(503, "API proxy configuration is invalid.");
  }
  const incoming = new URL(req.url || "/", publicOrigin);
  const route = incoming.searchParams.get("route") || "";
  if (
    !/^(api\/v1(?:\/[a-zA-Z0-9-]+)*|auth\/(login|logout|session))$/.test(route)
  )
    return fail(404, "API route not found.");
  if (req.headers.host !== publicURL.host) return fail(403, "Untrusted host.");
  incoming.searchParams.delete("route");
  target.pathname = "/" + route;
  target.search = incoming.searchParams.toString();
  const invoiceUpload =
    /^api\/v1\/payables\/invoices\/[a-f0-9-]{36}\/documents$/.test(route) &&
    req.method === "POST";
  const upload =
    invoiceUpload ||
    (route === "api/v1/receivables/imports/preview" && req.method === "POST");
  const maxBytes = upload ? 1024 * 1024 : 16384;
  if (
    upload &&
    (req.headers["content-type"] !==
      (invoiceUpload ? "application/pdf" : "application/octet-stream") ||
      req.headers["content-encoding"])
  )
    return fail(403, "Uncompressed raw upload required.");
  let body: Buffer;
  try {
    body = await readRequestBody(req, maxBytes, upload);
  } catch (error) {
    if (error instanceof RequestBodyError)
      return fail(error.status, error.message);
    return fail(400, "Invalid request.");
  }
  const headers: Record<string, string> = {
    Host: target.host,
    "X-Finai-Public-Host": publicURL.host,
    "X-Forwarded-Proto": "https",
    "X-Finai-Proxy-Token": token,
    "X-Finai-Client-IP": String(
      req.headers["x-vercel-forwarded-for"] || "unknown",
    )
      .split(",")[0]
      .slice(0, 100),
  };
  for (const name of [
    "content-type",
    "cookie",
    "origin",
    "x-csrf-token",
    "if-match",
  ]) {
    const value = req.headers[name];
    if (typeof value === "string") headers[name] = value;
  }
  headers["Content-Length"] = String(body.length);
  let upstreamResponse: IncomingMessage | undefined;
  const upstream = request(
    target,
    {
      method: req.method,
      headers,
      servername: target.hostname,
      timeout: 25000,
    },
    (response) => {
      upstreamResponse = response;
      if (
        response.statusCode !== 204 &&
        !(
          req.method === "GET" &&
          response.statusCode === 200 &&
          ((/^api\/v1\/payables\/invoices\/[a-f0-9-]{36}\/documents\/[a-f0-9-]{36}$/.test(
            route,
          ) &&
            response.headers["content-type"] === "application/pdf") ||
            (/^api\/v1\/payables\/exports\/[a-f0-9-]{36}\/file$/.test(route) &&
              /^text\/csv(?:; charset=utf-8)?$/i.test(
                String(response.headers["content-type"]),
              )))
        ) &&
        !/^application\/json(?:\s*;|$)/i.test(
          String(response.headers["content-type"] || ""),
        )
      ) {
        response.resume();
        fail(502, "Backend returned an invalid response.");
        return;
      }
      res.statusCode = response.statusCode || 502;
      for (const name of [
        "content-type",
        "set-cookie",
        "x-request-id",
        "cache-control",
        "x-content-type-options",
      ]) {
        const value = response.headers[name];
        if (value) res.setHeader(name, value);
      }
      const disposition = response.headers["content-disposition"];
      if (
        typeof disposition === "string" &&
        /^attachment; filename="(?:invoice|export)-[a-f0-9-]{36}\.(?:pdf|csv)"$/.test(
          disposition,
        )
      )
        res.setHeader("Content-Disposition", disposition);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Security-Policy", "sandbox; default-src 'none'");
      res.setHeader("Cache-Control", "no-store");
      response.pipe(res);
      response.on("error", () => res.destroy());
    },
  );
  upstream.on("timeout", () => upstream.destroy(new Error("timeout")));
  upstream.on("error", () => fail(502, "Backend unavailable."));
  // Activity must not extend the function indefinitely, including a response
  // that starts successfully but never finishes. Leave room within maxDuration.
  const deadline = setTimeout(() => {
    upstream.destroy(new Error("Backend response deadline exceeded"));
    // A completed backend request can already be detached from its socket
    // while a slow downstream is still draining buffered response bytes.
    if (!res.writableFinished) {
      if (res.headersSent || res.writableEnded) res.destroy();
      else fail(502, "Backend response timed out.");
    }
  }, 30000);
  deadline.unref();
  const cleanup = () => {
    clearTimeout(deadline);
    res.off("finish", cleanup);
    res.off("close", cleanup);
    // A completed backend response may keep its pooled connection. Otherwise
    // cancel remaining work when the browser leaves or a local failure finishes.
    if (!upstreamResponse?.complete) {
      upstreamResponse?.destroy();
      upstream.destroy();
    }
  };
  res.once("finish", cleanup);
  res.once("close", cleanup);
  if (res.destroyed) cleanup();
  else upstream.end(body);
}
