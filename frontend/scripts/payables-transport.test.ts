// Transport-only controlled upstream; does not establish backend authorization.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, request as httpRequest, type Server } from "node:http";
import { createServer as tlsServer, globalAgent } from "node:https";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import proxy from "../api/proxy";
import { createEmbeddedHandler } from "../server/embedded";
const id = "33333333-3333-4333-8333-333333333333";
const document = "44444444-4444-4444-8444-444444444444";
const pdf = Buffer.from("%PDF-1.4\n" + "0".repeat(20000) + "\n%%EOF");
const listen = (s: Server) =>
  new Promise<number>((resolve) =>
    s.listen(0, "127.0.0.1", () =>
      resolve((s.address() as { port: number }).port),
    ),
  );
const close = (s: Server) =>
  new Promise<void>((resolve) => s.close(() => resolve()));
function call(port: number, path: string, method = "GET", body?: Buffer) {
  return new Promise<{
    status: number;
    bytes: Buffer;
    headers: Record<string, unknown>;
  }>((resolve, reject) => {
    const r = httpRequest(
      {
        host: "127.0.0.1",
        port,
        path: "/?route=" + path,
        method,
        headers: {
          Host: "ap.example",
          Origin: "https://ap.example",
          Cookie: "synthetic-session",
          "X-CSRF-Token": "synthetic-csrf",
          "Content-Type": body ? "application/pdf" : "application/json",
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (b) => chunks.push(b));
        res.on("end", () =>
          resolve({
            status: res.statusCode!,
            bytes: Buffer.concat(chunks),
            headers: res.headers,
          }),
        );
      },
    );
    r.on("error", reject);
    r.end(body);
  });
}
test("controlled remote proxy: bounded PDF upload, exact binary allowlist, headers, CSV and ordinary cap", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ap-tls-"));
  const cert = join(dir, "cert.pem"),
    key = join(dir, "key.pem");
  assert.equal(
    spawnSync(
      "openssl",
      [
        "req",
        "-x509",
        "-newkey",
        "rsa:2048",
        "-nodes",
        "-keyout",
        key,
        "-out",
        cert,
        "-days",
        "1",
        "-subj",
        "/CN=127.0.0.1",
        "-addext",
        "subjectAltName=IP:127.0.0.1",
      ],
      { stdio: "ignore" },
    ).status,
    0,
  );
  const oldCA = globalAgent.options.ca,
    oldEnv = { ...process.env };
  let uploaded = Buffer.alloc(0);
  const upstream = tlsServer(
    { cert: readFileSync(cert), key: readFileSync(key) },
    async (req, res) => {
      assert.equal(req.headers["x-finai-proxy-token"], "p".repeat(64));
      assert.equal(req.headers["x-csrf-token"], "synthetic-csrf");
      if (req.method === "POST") {
        const chunks: Buffer[] = [];
        for await (const b of req) chunks.push(Buffer.from(b));
        uploaded = Buffer.concat(chunks);
        res.setHeader("Content-Type", "application/json");
        res.end("{}");
        return;
      }
      if (req.url?.endsWith("/file")) {
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="export-${id}.csv"`,
        );
        res.end("account,debit,credit\r\n6000,100,0\r\n2100,0,100\r\n");
      } else {
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="invoice-${document}.pdf"`,
        );
        res.end(pdf);
      }
    },
  );
  const server = createServer((req, res) => void proxy(req, res));
  try {
    const port = await listen(upstream);
    globalAgent.options.ca = readFileSync(cert);
    process.env.FINAI_API_MODE = "remote";
    process.env.FINAI_BACKEND_ORIGIN = `https://127.0.0.1:${port}`;
    process.env.FINAI_PUBLIC_ORIGIN = "https://ap.example";
    process.env.FINAI_PROXY_TOKEN = "p".repeat(64);
    const local = await listen(server);
    assert.equal(
      (
        await call(
          local,
          `api/v1/payables/invoices/${id}/documents`,
          "POST",
          pdf,
        )
      ).status,
      200,
    );
    assert.deepEqual(uploaded, pdf);
    const result = await call(
      local,
      `api/v1/payables/invoices/${id}/documents/${document}`,
    );
    assert.equal(result.status, 200);
    assert.deepEqual(result.bytes, pdf);
    assert.equal(result.headers["cache-control"], "no-store");
    assert.equal(result.headers["x-content-type-options"], "nosniff");
    assert.ok(result.headers["content-disposition"]);
    assert.equal(
      (await call(local, `api/v1/payables/exports/${id}/file`)).bytes
        .toString()
        .includes("6000,100,0"),
      true,
    );
    assert.equal((await call(local, "api/v1/entities")).status, 502);
    assert.equal(
      (await call(local, "api/v1/payables/invoices", "POST", pdf)).status,
      422,
    );
    assert.equal(
      (
        await call(
          local,
          `api/v1/payables/invoices/${id}/documents`,
          "POST",
          Buffer.alloc(1048577),
        )
      ).status,
      422,
    );
  } finally {
    await close(server);
    await close(upstream);
    globalAgent.options.ca = oldCA;
    for (const k of [
      "FINAI_API_MODE",
      "FINAI_BACKEND_ORIGIN",
      "FINAI_PUBLIC_ORIGIN",
      "FINAI_PROXY_TOKEN",
    ]) {
      if (oldEnv[k] === undefined) delete process.env[k];
      else process.env[k] = oldEnv[k];
    }
    rmSync(dir, { recursive: true, force: true });
  }
});
test("controlled embedded adapter: exact raw upload route and ordinary request limit", async () => {
  let received = Buffer.alloc(0);
  const embedded = createEmbeddedHandler({
    env: {
      DATABASE_URL: "synthetic-test-binding",
      FINAI_PUBLIC_ORIGIN: "https://ap.example",
      NODE_ENV: "test",
    },
    retainWork: () => {},
    loadApplication: () => ({
      createApplication: async () => ({
        getHttpAdapter: () => ({
          getInstance: () => async (req, res) => {
            const chunks: Buffer[] = [];
            for await (const b of req) chunks.push(Buffer.from(b));
            received = Buffer.concat(chunks);
            res.setHeader("Content-Type", "application/pdf");
            res.end(received);
          },
        }),
        close: async () => {},
      }),
    }),
  });
  const server = createServer((req, res) => void embedded.handler(req, res));
  try {
    const port = await listen(server);
    const result = await call(
      port,
      `api/v1/payables/invoices/${id}/documents`,
      "POST",
      pdf,
    );
    assert.equal(result.status, 200);
    assert.deepEqual(result.bytes, pdf);
    assert.deepEqual(received, pdf);
    assert.equal(
      (await call(port, "api/v1/entities", "POST", pdf)).status,
      422,
    );
  } finally {
    await close(server);
    await embedded.close();
  }
});
