import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import proxy from "../api/proxy.ts";
test("proxy failures stay JSON with matching request IDs, bounded bodies and host/config validation", async () => {
  const keys = [
    "FINAI_BACKEND_ORIGIN",
    "FINAI_PUBLIC_ORIGIN",
    "FINAI_PROXY_TOKEN",
  ];
  const previous = keys.map((key) => process.env[key]);
  const server = createServer((req, res) => void proxy(req, res));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("No test address");
  const origin = `http://127.0.0.1:${address.port}`;
  async function check(
    path: string,
    status: number,
    options: RequestInit = {},
  ) {
    const r = await fetch(origin + path, options);
    const body = (await r.json()) as { requestId: string };
    assert.equal(r.status, status);
    assert.equal(r.headers.get("content-type"), "application/json");
    assert.equal(r.headers.get("x-content-type-options"), "nosniff");
    assert.equal(body.requestId, r.headers.get("x-request-id"));
  }
  try {
    keys.forEach((key) => delete process.env[key]);
    await check("/?route=api/v1/entities", 503);
    process.env.FINAI_BACKEND_ORIGIN = "http://invalid.example";
    process.env.FINAI_PUBLIC_ORIGIN = "https://127.0.0.1:" + address.port;
    process.env.FINAI_PROXY_TOKEN = "synthetic-proxy-token-for-test-only";
    await check("/?route=api/v1/entities", 503);
    process.env.FINAI_BACKEND_ORIGIN = "https://127.0.0.1:1";
    await check("/?route=invalid", 404);
    await check("/?route=api/v1/entities&route=auth/login", 400);
    process.env.FINAI_PUBLIC_ORIGIN = "https://untrusted.example";
    await check("/?route=api/v1/entities", 403);
    process.env.FINAI_PUBLIC_ORIGIN = "https://127.0.0.1:" + address.port;
    await check("/?route=api/v1/entities", 422, {
      method: "POST",
      body: "x".repeat(16385),
    });
    await check("/?route=api/v1/entities", 502);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((e) => (e ? reject(e) : resolve())),
    );
    keys.forEach((key, i) => {
      if (previous[i] === undefined) delete process.env[key];
      else process.env[key] = previous[i];
    });
  }
});
