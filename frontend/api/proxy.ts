import { request } from "node:https";
import { isIP } from "node:net";
import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
export const config = { maxDuration: 60 };
type ProxyRequest = IncomingMessage & { body?: unknown };
export default async function proxy(req: ProxyRequest, res: ServerResponse) {
  const requestId = randomUUID();
  res.setHeader("X-Request-Id", requestId);
  res.setHeader("X-Content-Type-Options", "nosniff");
  const fail = (status: number, message: string) => {
    if (res.destroyed || res.writableEnded) return;
    if (res.headersSent) {
      res.destroy();
      return;
    }
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
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
                : status === 422
                  ? "VALIDATION_FAILED"
                  : "UNAVAILABLE",
        message,
        requestId,
      }),
    );
  };
  const backend = process.env.FINAI_BACKEND_ORIGIN,
    publicOrigin = process.env.FINAI_PUBLIC_ORIGIN,
    token = process.env.FINAI_PROXY_TOKEN;
  if (
    !backend ||
    !publicOrigin ||
    !token ||
    token.length < 32 ||
    /[\r\n]/.test(token)
  )
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
  if (incoming.searchParams.getAll("route").length !== 1)
    return fail(400, "Invalid route parameters.");
  const route = incoming.searchParams.get("route") || "";
  if (
    !/^(api\/v1(?:\/[a-zA-Z0-9-]+)*|auth\/(login|logout|session))$/.test(route)
  )
    return fail(404, "API route not found.");
  if (req.headers.host !== publicURL.host) return fail(403, "Untrusted host.");
  incoming.searchParams.delete("route");
  target.pathname = "/" + route;
  target.search = incoming.searchParams.toString();
  let body: Buffer;
  try {
    if (req.body !== undefined)
      body = Buffer.from(
        typeof req.body === "string" ? req.body : JSON.stringify(req.body),
      );
    else {
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of req) {
        const b = Buffer.from(chunk);
        size += b.length;
        if (size > 16384) return fail(422, "Request too large.");
        chunks.push(b);
      }
      body = Buffer.concat(chunks);
    }
    if (body.length > 16384) return fail(422, "Request too large.");
  } catch {
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
  const aiRoute = /^api\/v1\/ai\/(models|chat)$/.test(route);
  if (aiRoute && process.env.OPENROUTER_API_KEY) {
    const key = process.env.OPENROUTER_API_KEY;
    if (!/^[\x21-\x7e]{32,512}$/.test(key))
      return fail(503, "AI provider key configuration is invalid.");
    // Never forward a browser header; this value exists only in the server environment.
    headers["X-Finai-Openrouter-Key"] = key;
  }
  const deadlineMs = aiRoute ? 45000 : 15000;
  headers["Content-Length"] = String(body.length);
  const upstream = request(
    target,
    {
      method: req.method,
      headers,
      servername: isIP(target.hostname) ? "" : target.hostname,
      timeout: deadlineMs,
    },
    (response) => {
      if (
        response.statusCode !== 204 &&
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
      res.setHeader("Cache-Control", "no-store");
      response.pipe(res);
      response.on("error", () => res.destroy());
    },
  );
  const deadline = setTimeout(
    () => upstream.destroy(new Error("deadline")),
    deadlineMs,
  );
  deadline.unref();
  res.on("close", () => {
    clearTimeout(deadline);
    upstream.destroy();
  });
  upstream.on("timeout", () => upstream.destroy(new Error("timeout")));
  upstream.on("error", () => fail(502, "Backend unavailable."));
  upstream.end(body);
}
