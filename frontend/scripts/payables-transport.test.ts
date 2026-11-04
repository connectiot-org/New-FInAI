// Transport-only controlled upstream; does not establish backend authorization.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createServer,
  IncomingMessage,
  request as httpRequest,
  type Server,
} from "node:http";
import { Socket } from "node:net";
import { createServer as tlsServer, globalAgent } from "node:https";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import proxy from "../api/proxy";
import { createEmbeddedHandler } from "../server/embedded";
import { readRequestBody, RequestBodyError } from "../server/request-body";
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

const input = () => new IncomingMessage(new Socket());
const bodyError = (status: number) => (error: unknown) =>
  error instanceof RequestBodyError && error.status === status;

test("private body reader preserves exact bytes and applies limits to parsed bodies", async () => {
  const req: IncomingMessage & { body?: unknown } = input();
  req.body = Buffer.from([0, 128, 255, 13, 10]);
  assert.deepEqual(await readRequestBody(req, 5, true), req.body);
  await assert.rejects(readRequestBody(req, 4, true), bodyError(422));
  req.body = { value: "£" };
  assert.equal(
    (await readRequestBody(req, 100)).toString(),
    JSON.stringify(req.body),
  );
  await assert.rejects(readRequestBody(req, 100, true), bodyError(400));
  const circular: { self?: unknown } = {};
  circular.self = circular;
  req.body = circular;
  await assert.rejects(readRequestBody(req, 100), bodyError(400));
  req.destroy();
});

test("private body reader accepts exact streaming limit and rejects excess bytes", async () => {
  const req = input();
  const body = readRequestBody(req, 5);
  req.push(Buffer.from("123"));
  req.push(Buffer.from("45"));
  req.push(null);
  assert.equal((await body).toString(), "12345");
  assert.equal(req.listenerCount("data"), 0);
  const excessive = input();
  const rejected = readRequestBody(excessive, 5);
  excessive.push(Buffer.from("123456"));
  await assert.rejects(rejected, bodyError(422));
  assert.equal(excessive.listenerCount("data"), 0);
  excessive.emit("error", new Error("late disconnect"));
  excessive.destroy();
});

test("private body reader releases interrupted, already-ended and closed requests", async () => {
  for (const event of ["aborted", "error", "close"]) {
    const req = input();
    const body = readRequestBody(req, 100);
    req.emit(event, new Error("interrupted"));
    await assert.rejects(body, bodyError(400));
    assert.equal(req.listenerCount("data"), 0);
    assert.equal(req.listenerCount("aborted"), 0);
    assert.equal(req.listenerCount("close"), 0);
    req.destroy();
  }
  const destroyed = input();
  destroyed.destroy();
  await assert.rejects(readRequestBody(destroyed, 100), bodyError(400));
  const ended = input();
  ended.complete = true;
  const drained = new Promise<void>((resolve) => ended.on("end", resolve));
  ended.push(null);
  ended.resume();
  await drained;
  assert.equal((await readRequestBody(ended, 100)).length, 0);
});

test("private body deadline does not reset for drip-fed chunks and cleans up", async () => {
  const req = input();
  const drip = setInterval(() => req.push(Buffer.from("a")), 10);
  try {
    await assert.rejects(readRequestBody(req, 1000, true, 60), (error) => {
      assert.ok(bodyError(408)(error));
      assert.equal((error as RequestBodyError).code, "REQUEST_TIMEOUT");
      return true;
    });
    assert.equal(req.listenerCount("data"), 0);
    assert.equal(req.listenerCount("end"), 0);
    assert.equal(req.listenerCount("aborted"), 0);
    assert.equal(req.listenerCount("close"), 0);
    req.emit("error", new Error("late disconnect"));
  } finally {
    clearInterval(drip);
    req.destroy();
  }
});

for (const [mode, rawUpload] of [
  ["embedded", false],
  ["remote", false],
  ["embedded", true],
  ["remote", true],
] as const) {
  test(`${mode} adapter returns a bounded timeout for an unfinished private ${rawUpload ? "PDF upload" : "JSON request"}`, async () => {
    const oldEnv = { ...process.env };
    let boots = 0;
    const embedded = createEmbeddedHandler({
      env: {
        DATABASE_URL: "synthetic-test-binding",
        FINAI_PUBLIC_ORIGIN: "https://ap.example",
        NODE_ENV: "test",
      },
      retainWork: () => {},
      loadApplication: () => {
        boots++;
        throw new Error("Incomplete input must not boot the application");
      },
    });
    process.env.FINAI_API_MODE = "remote";
    process.env.FINAI_BACKEND_ORIGIN = "https://127.0.0.1:9";
    process.env.FINAI_PUBLIC_ORIGIN = "https://ap.example";
    process.env.FINAI_PROXY_TOKEN = "p".repeat(64);
    const server = createServer(
      (req, res) =>
        void (mode === "embedded"
          ? embedded.handler(req, res)
          : proxy(req, res)),
    );
    server.requestTimeout = 0;
    let client: ReturnType<typeof httpRequest> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const port = await listen(server);
      const response = new Promise<{ status: number; code?: string }>(
        (resolve) => {
          client = httpRequest(
            {
              host: "127.0.0.1",
              port,
              path: rawUpload
                ? `/?route=api/v1/payables/invoices/${id}/documents`
                : "/?route=api/v1/checklist-tasks",
              method: "POST",
              headers: {
                Host: "ap.example",
                "Content-Type": rawUpload
                  ? "application/pdf"
                  : "application/json",
              },
            },
            (res) => {
              assert.equal(res.headers["cache-control"], "no-store");
              assert.equal(res.headers.connection, "close");
              let data = "";
              res.on("data", (b) => (data += b));
              res.on("end", () => {
                const envelope = JSON.parse(data);
                assert.equal(res.headers["x-request-id"], envelope.requestId);
                assert.match(envelope.requestId, /^[a-f0-9-]{36}$/);
                resolve({
                  status: res.statusCode!,
                  code: envelope.code,
                });
              });
            },
          );
          client.on("error", () => {});
          client.flushHeaders();
          client.write(rawUpload ? "%PDF-1.4\n" : "{");
        },
      );
      const fallback = new Promise<{ status: number; code?: string }>(
        (resolve) => {
          timer = setTimeout(
            () => resolve({ status: 0 }),
            rawUpload ? 16500 : 6500,
          );
        },
      );
      const result = await Promise.race([response, fallback]);
      assert.equal(result.status, 408);
      assert.equal(result.code, "REQUEST_TIMEOUT");
      assert.equal(boots, 0);
    } finally {
      clearTimeout(timer);
      client?.destroy();
      server.closeAllConnections();
      await close(server);
      for (const name of [
        "FINAI_API_MODE",
        "FINAI_BACKEND_ORIGIN",
        "FINAI_PUBLIC_ORIGIN",
        "FINAI_PROXY_TOKEN",
      ]) {
        if (oldEnv[name] === undefined) delete process.env[name];
        else process.env[name] = oldEnv[name];
      }
    }
  });
}
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

// Append to scripts/payables-transport.test.ts. Uses its existing imports/helpers.
async function withinDeadline<T>(
  work: Promise<T>,
  milliseconds: number,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(message)), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function withDripBackend(
  run: (port: number, upstreamClosed: Promise<void>) => Promise<void>,
) {
  const dir = mkdtempSync(join(tmpdir(), "ap-proxy-lifetime-"));
  const cert = join(dir, "cert.pem"),
    key = join(dir, "key.pem");
  const oldCA = globalAgent.options.ca;
  const names = [
    "FINAI_API_MODE",
    "FINAI_BACKEND_ORIGIN",
    "FINAI_PUBLIC_ORIGIN",
    "FINAI_PROXY_TOKEN",
  ];
  const oldEnv = Object.fromEntries(
    names.map((name) => [name, process.env[name]]),
  );
  const sockets = new Set<Socket>();
  const intervals = new Set<ReturnType<typeof setInterval>>();
  const track = (socket: Socket) => {
    sockets.add(socket);
    socket.on("error", () => {});
    socket.once("close", () => sockets.delete(socket));
  };
  let upstream: ReturnType<typeof tlsServer> | undefined;
  let server: Server | undefined;
  try {
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
    let resolveClosed!: () => void;
    const upstreamClosed = new Promise<void>((resolve) => {
      resolveClosed = resolve;
    });
    upstream = tlsServer(
      { cert: readFileSync(cert), key: readFileSync(key) },
      (_req, res) => {
        res.on("error", () => {});
        res.writeHead(200, { "Content-Type": "application/json" });
        res.write("{");
        // Activity arrives much more often than the proxy's 25-second idle limit.
        const interval = setInterval(() => res.write(" "), 50);
        intervals.add(interval);
        res.once("close", () => {
          clearInterval(interval);
          intervals.delete(interval);
          resolveClosed();
        });
      },
    );
    upstream.on("connection", track);
    const upstreamPort = await listen(upstream);
    globalAgent.options.ca = readFileSync(cert);
    Object.assign(process.env, {
      FINAI_API_MODE: "remote",
      FINAI_BACKEND_ORIGIN: `https://127.0.0.1:${upstreamPort}`,
      FINAI_PUBLIC_ORIGIN: "https://ap.example",
      FINAI_PROXY_TOKEN: "p".repeat(64),
    });
    server = createServer((req, res) => void proxy(req, res));
    server.on("connection", track);
    const port = await listen(server);
    await run(port, upstreamClosed);
  } finally {
    for (const interval of intervals) clearInterval(interval);
    for (const socket of sockets) socket.destroy();
    if (server) server.closeAllConnections();
    if (upstream) upstream.closeAllConnections();
    await Promise.all([
      ...(server ? [close(server)] : []),
      ...(upstream ? [close(upstream)] : []),
    ]);
    globalAgent.options.ca = oldCA;
    for (const name of names) {
      if (oldEnv[name] === undefined) delete process.env[name];
      else process.env[name] = oldEnv[name];
    }
    rmSync(dir, { recursive: true, force: true });
  }
}

test(
  "remote proxy promptly closes its upstream when the client disconnects",
  { timeout: 10000 },
  async () => {
    await withDripBackend(async (port, upstreamClosed) => {
      let client: ReturnType<typeof httpRequest> | undefined;
      try {
        const firstChunk = new Promise<void>((resolve, reject) => {
          client = httpRequest(
            {
              host: "127.0.0.1",
              port,
              path: "/?route=api/v1/entities",
              headers: { Host: "ap.example" },
            },
            (res) => {
              res.on("error", () => {});
              res.once("data", () => {
                res.destroy();
                client?.destroy();
                resolve();
              });
            },
          );
          client.on("error", reject);
          client.end();
        });
        await withinDeadline(
          firstChunk,
          3000,
          "Controlled upstream did not send its first chunk",
        );
        await withinDeadline(
          upstreamClosed,
          1500,
          "Upstream survived the downstream disconnect",
        );
      } finally {
        client?.destroy();
      }
    });
  },
);

test(
  "remote proxy enforces its absolute 30-second deadline despite active response bytes",
  { timeout: 40000 },
  async () => {
    await withDripBackend(async (port, upstreamClosed) => {
      let client: ReturnType<typeof httpRequest> | undefined;
      const startedAt = Date.now();
      try {
        const closed = new Promise<{
          complete: boolean;
          bytes: number;
          elapsed: number;
        }>((resolve, reject) => {
          client = httpRequest(
            {
              host: "127.0.0.1",
              port,
              path: "/?route=api/v1/entities",
              headers: { Host: "ap.example" },
            },
            (res) => {
              let bytes = 0;
              res.on("data", (chunk: Buffer) => {
                bytes += chunk.length;
              });
              // Aborting a partial JSON stream is the only safe response after headers.
              res.on("error", () => {});
              res.once("close", () =>
                resolve({
                  complete: res.complete,
                  bytes,
                  elapsed: Date.now() - startedAt,
                }),
              );
            },
          );
          client.on("error", reject);
          client.end();
        });
        const outcome = await withinDeadline(
          closed,
          32500,
          "Drip-fed response outlived the absolute deadline",
        );
        assert.ok(
          outcome.bytes > 1,
          "The upstream must have streamed active bytes",
        );
        assert.equal(
          outcome.complete,
          false,
          "A truncated JSON body must not finish as a complete response",
        );
        assert.ok(
          outcome.elapsed >= 29000,
          `Response ended before the absolute deadline: ${outcome.elapsed}ms`,
        );
        assert.ok(
          outcome.elapsed <= 32500,
          `Response exceeded the absolute deadline: ${outcome.elapsed}ms`,
        );
        await withinDeadline(
          upstreamClosed,
          1500,
          "Deadline left the upstream connection open",
        );
      } finally {
        client?.destroy();
      }
    });
  },
);
