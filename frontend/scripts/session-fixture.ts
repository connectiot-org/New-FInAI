import { controlledAssistantProvider } from "./assistant-provider-fixture";
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
await db.membership.create({
  data: {
    organisationId,
    userId,
    isAdministrator: process.env.FINAI_TEST_WORKSPACE === "1",
  },
});
await db.entity.create({
  data: { id: entityId, organisationId, name: "Synthetic entity" },
});
await db.entityAccess.create({
  data: { organisationId, userId, entityId, canWrite: true, canImport: true },
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
const applicationOptions = {
  env: {
    ...process.env,
    NODE_ENV: process.env.FINAI_TEST_ASSISTANT ? "test" : "production",
    CHECKLIST_IDENTITY: "session",
    API_HOST: "127.0.0.1",
    API_PORT: "0",
    PUBLIC_ORIGIN: origin,
    API_TRUSTED_HOST: "127.0.0.1:18444",
    API_PROXY_TOKEN: proxyToken,
  },
  quiet: true,
  ...(process.env.FINAI_TEST_ASSISTANT
    ? { assistantProvider: controlledAssistantProvider }
    : {}),
};
let app = await createApplication(applicationOptions);
let backend = await app.getUrl();
// Trust only this ephemeral test CA for the real proxy's outbound TLS verification.
globalAgent.options.ca = readFileSync(`${certificateDir}/cert.pem`);
process.env.FINAI_API_MODE = "remote";
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
const root = resolve(
  process.env.FINAI_TEST_ASSISTANT
    ? "artifacts/assistant-dist"
    : process.env.FINAI_TEST_WORKSPACE
      ? "artifacts/workspace-dist"
      : process.env.FINAI_TEST_RECEIVABLES
        ? "artifacts/receivables-dist"
        : "artifacts/session-dist",
);
mkdirSync(root, { recursive: true });
const server = createServer(
  {
    key: readFileSync(`${certificateDir}/key.pem`),
    cert: readFileSync(`${certificateDir}/cert.pem`),
  },
  (req, res) => {
    const path = new URL(req.url || "/", origin).pathname;
    if (path.startsWith("/api/") || path.startsWith("/auth/")) {
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
const receivables = !!(
  process.env.FINAI_TEST_RECEIVABLES || process.env.FINAI_TEST_WORKSPACE
);
const secondEntityId = randomUUID();
if (receivables) {
  await db.entity.create({
    data: {
      id: secondEntityId,
      organisationId,
      name: "Second imported entity",
    },
  });
  await db.entityAccess.create({
    data: {
      organisationId,
      userId,
      entityId: secondEntityId,
      canWrite: true,
      canImport: true,
    },
  });
}
const importedSource = (paidCents: number, sourceName: string) => ({
  schemaVersion: 1,
  currency: "USD",
  sourceName,
  sourceCapturedAt:
    sourceName === "Synthetic source B"
      ? "2026-10-24T00:00:00Z"
      : "2026-10-23T00:00:00Z",
  completeRegister: true,
  invoices: [
    {
      invoiceId: "synthetic-source-invoice",
      customerId: "external-customer",
      customerName: "Synthetic imported customer",
      issuedOn: "2026-09-01",
      status: "Partial",
      amountCents: 100000,
      paidCents,
    },
  ],
});
const importSource = async (expected: number, paid: number, name: string) => {
  const { ReceivablesRepository } =
    await import("../../backend/dist/src/receivables/repository.js");
  const { ChecklistRepository } =
    await import("../../backend/dist/src/checklist.repository.js");
  const repo = new ReceivablesRepository(
    app.get((await import("../../backend/dist/src/database.js")).Database),
    app.get(ChecklistRepository),
  );
  return repo.import(
    { organisationId, userId },
    entityId,
    expected,
    importedSource(paid, name),
    true,
  );
};
if (receivables) await importSource(0, 25000, "Synthetic source A");
if (process.env.FINAI_TEST_ASSISTANT) {
  const { LedgerService, mappingDigest, validateLedger } =
    await import("../../backend/dist/src/ledger/source.js");
  const source = JSON.parse(
    readFileSync(
      "../contracts/examples/assistant-ledger.synthetic.json",
      "utf8",
    ),
  );
  await app
    .get(LedgerService)
    .import({ organisationId, userId }, entityId, 0, source, true);
  app
    .get(LedgerService)
    .approved.add(
      `${source.mappingId}@${mappingDigest(validateLedger(source))}`,
    );
}
process.send?.({ origin, organisationId, entityId, secondEntityId });
process.on("message", async (command) => {
  if (!receivables) return;
  try {
    if (command === "restart") {
      await app.close();
      app = await createApplication(applicationOptions);
      backend = await app.getUrl();
      if (process.env.FINAI_TEST_ASSISTANT) {
        const { LedgerService, mappingDigest, validateLedger } =
          await import("../../backend/dist/src/ledger/source.js");
        const source = JSON.parse(
          readFileSync(
            "../contracts/examples/assistant-ledger.synthetic.json",
            "utf8",
          ),
        );
        app
          .get(LedgerService)
          .approved.add(
            `${source.mappingId}@${mappingDigest(validateLedger(source))}`,
          );
      }
    } else if (command === "importB")
      await importSource(1, 50000, "Synthetic source B");
    else if (command === "deny")
      await db.entityAccess.delete({
        where: {
          organisationId_userId_entityId: { organisationId, userId, entityId },
        },
      });
    else if (command === "allow")
      await db.entityAccess.create({
        data: {
          organisationId,
          userId,
          entityId,
          canWrite: true,
          canImport: true,
        },
      });
    else if (command === "proxyOff") delete process.env.FINAI_BACKEND_ORIGIN;
    else if (command === "proxyOn")
      process.env.FINAI_BACKEND_ORIGIN = "https://127.0.0.1:18444";
    else if (command === "expire")
      await db.session.deleteMany({ where: { userId } });
    process.send?.({ command, ok: true });
  } catch {
    process.send?.({ command, ok: false });
  }
});
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
