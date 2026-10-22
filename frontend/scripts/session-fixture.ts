// Synthetic HTTPS test harness only; never a deployment server.
import { createServer, globalAgent } from "node:https";
import proxy from "../api/proxy";
import { request } from "node:http";
import { randomUUID, randomBytes } from "node:crypto";
import {
  readFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { resolve, extname } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { PrismaClient } from "../../backend/node_modules/@prisma/client/default.js";
import * as argon2 from "../../backend/node_modules/argon2/argon2.cjs";
import { createApplication } from "../../backend/dist/src/app.js";
import { passwordOptions } from "../../backend/dist/src/auth.js";
const initial = process.env.DATABASE_URL!;
if (!["localhost", "127.0.0.1"].includes(new URL(initial).hostname))
  throw new Error("Local database required");
const schema = `session_${randomUUID().replaceAll("-", "")}`,
  admin = new PrismaClient({ datasourceUrl: initial });
const databaseURL = new URL(initial);
databaseURL.searchParams.set("schema", schema);
process.env.DATABASE_URL = databaseURL.toString();
const db = new PrismaClient({ datasourceUrl: databaseURL.toString() });
await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
const migrated = spawnSync(
  process.execPath,
  ["node_modules/prisma/build/index.js", "migrate", "deploy"],
  { cwd: "../backend", env: process.env, encoding: "utf8" },
);
if (migrated.status !== 0) throw new Error("Synthetic migration failed");
const organisationId = randomUUID(),
  userId = randomUUID(),
  entityId = randomUUID();
await db.organisation.create({
  data: { id: organisationId, name: "Synthetic session organisation" },
});
await db.user.create({ data: { id: userId } });
await db.membership.create({ data: { organisationId, userId } });
await db.entity.create({
  data: { id: entityId, organisationId, name: "Synthetic entity" },
});
await db.entityAccess.create({
  data: { organisationId, userId, entityId, canWrite: true },
});
await db.account.create({
  data: {
    userId,
    username: "browser-test",
    passwordHash: await argon2.hash(
      "synthetic-browser-password",
      passwordOptions,
    ),
  },
});
const proxyToken = randomBytes(32).toString("hex");
const certificateDir = mkdtempSync(resolve(tmpdir(), "finai-tls-"));
const cert = spawnSync(
  "openssl",
  [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    `${certificateDir}/key.pem`,
    "-out",
    `${certificateDir}/cert.pem`,
    "-days",
    "1",
    "-subj",
    "/CN=127.0.0.1",
    "-addext",
    "subjectAltName=IP:127.0.0.1",
  ],
  { stdio: "ignore" },
);
if (cert.status !== 0) throw new Error("Test certificate generation failed");
const origin = "https://127.0.0.1:18443";
const app = await createApplication({
  env: {
    ...process.env,
    NODE_ENV: "production",
    CHECKLIST_IDENTITY: "session",
    API_HOST: "127.0.0.1",
    API_PORT: "0",
    PUBLIC_ORIGIN: origin,
    API_TRUSTED_HOST: "127.0.0.1:18444",
    API_PROXY_TOKEN: proxyToken,
  },
  quiet: true,
});
const backend = await app.getUrl();
// Trust only this ephemeral test CA for the real proxy's outbound TLS verification.
globalAgent.options.ca = readFileSync(`${certificateDir}/cert.pem`);
process.env.FINAI_BACKEND_ORIGIN = "https://127.0.0.1:18444";
process.env.FINAI_PUBLIC_ORIGIN = origin;
process.env.FINAI_PROXY_TOKEN = proxyToken;
const backendTLS = createServer(
  {
    key: readFileSync(`${certificateDir}/key.pem`),
    cert: readFileSync(`${certificateDir}/cert.pem`),
  },
  (req, res) => {
    const upstream = request(
      backend + req.url,
      { method: req.method, headers: req.headers },
      (response) => {
        res.writeHead(response.statusCode || 502, response.headers);
        response.pipe(res);
      },
    );
    upstream.on("error", () => {
      res.statusCode = 502;
      res.end();
    });
    req.pipe(upstream);
  },
);
await new Promise<void>((resolve) =>
  backendTLS.listen(18444, "127.0.0.1", resolve),
);
const root = resolve("artifacts/session-dist");
mkdirSync(root, { recursive: true });
const server = createServer(
  {
    key: readFileSync(`${certificateDir}/key.pem`),
    cert: readFileSync(`${certificateDir}/cert.pem`),
  },
  (req, res) => {
    const path = new URL(req.url || "/", origin).pathname;
    const routes = JSON.parse(readFileSync("vercel.json", "utf8")).routes;
    for (const [name, value] of Object.entries(
      routes[0].headers as Record<string, string>,
    ))
      res.setHeader(name, value);
    if (/^\/(api|auth)(?:\/|$)/.test(path)) {
      const incoming = new URL(req.url || "/", origin);
      incoming.searchParams.set("route", path.slice(1));
      req.url = "/api/proxy?" + incoming.searchParams.toString();
      void proxy(req, res);
      return;
    }
    const requested = resolve(root, "." + decodeURIComponent(path));
    const file =
      requested.startsWith(root + "/") &&
      existsSync(requested) &&
      extname(requested)
        ? requested
        : resolve(root, "index.html");
    const types: Record<string, string> = {
      ".html": "text/html",
      ".js": "application/javascript",
      ".css": "text/css",
      ".woff2": "font/woff2",
      ".svg": "image/svg+xml",
    };
    res.setHeader(
      "Content-Type",
      types[extname(file)] || "application/octet-stream",
    );
    res.end(readFileSync(file));
  },
);
await new Promise<void>((resolve) =>
  server.listen(18443, "127.0.0.1", resolve),
);
process.send?.({ origin, organisationId, entityId });
let stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  server.close();
  backendTLS.close();
  await app.close();
  await db.$disconnect();
  await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
  await admin.$disconnect();
  rmSync(certificateDir, { recursive: true, force: true });
  process.exit(0);
};
process.on("SIGTERM", () => void stop());
process.on("disconnect", () => void stop());
