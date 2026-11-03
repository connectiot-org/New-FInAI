// Isolated synthetic HTTPS integration harness. Never use as a deployment server.
import { createServer, globalAgent } from "node:https";
import { request } from "node:http";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, extname, basename } from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { PrismaClient } from "../../backend/node_modules/@prisma/client/default.js";
import * as argon2 from "../../backend/node_modules/argon2/argon2.cjs";
import { createApplication as createDirectApplication } from "../../backend/dist/src/app.js";
import { passwordOptions } from "../../backend/dist/src/auth.js";
import proxy from "../api/proxy";
import { createEmbeddedHandler } from "../server/embedded";
import { controlledAssistantProvider } from "./assistant-provider-fixture";
import { invoicePdf } from "./payables-pdf";
const mode = process.env.FINAI_TEST_PAYABLES_MODE || "remote";
const require = createRequire(import.meta.url);
const createApplication =
  mode === "packaged"
    ? (require("../.finai-server/src/app.js")
        .createApplication as typeof createDirectApplication)
    : createDirectApplication;
const createTestApplication: typeof createDirectApplication = (options = {}) =>
  createApplication({
    ...options,
    assistantProvider: controlledAssistantProvider,
  });
if (mode === "packaged" && process.env.PRISMA_QUERY_ENGINE_LIBRARY)
  process.env.PRISMA_QUERY_ENGINE_LIBRARY = resolve(
    ".finai-server/node_modules/.prisma/client",
    basename(process.env.PRISMA_QUERY_ENGINE_LIBRARY),
  );
const original = process.env.DATABASE_URL!;
if (!["127.0.0.1", "localhost"].includes(new URL(original).hostname))
  throw new Error("Synthetic tests require local PostgreSQL");
const schema = "test_ap_browser_" + randomUUID().replaceAll("-", ""),
  url = new URL(original);
url.searchParams.set("schema", schema);
process.env.DATABASE_URL = url.toString();
const admin = new PrismaClient({ datasourceUrl: original }),
  db = new PrismaClient({ datasourceUrl: url.toString() });
await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
const migrated = spawnSync(
  process.execPath,
  ["node_modules/prisma/build/index.js", "migrate", "deploy"],
  { cwd: "../backend", env: process.env, encoding: "utf8" },
);
if (migrated.status !== 0) throw new Error("Synthetic AP migrations failed");
const organisationId = randomUUID(),
  entityId = randomUUID(),
  secondEntityId = randomUUID();
const actors = ["reviewer", "verifier", "budget-one", "budget-two"].map(
  (username) => ({ username: "ap-" + username, userId: randomUUID() }),
);
await db.organisation.create({
  data: { id: organisationId, name: "Synthetic invoice organisation" },
});
for (const [index, id] of [entityId, secondEntityId].entries())
  await db.entity.create({
    data: {
      id,
      organisationId,
      name: index ? "Synthetic AP company B" : "Synthetic AP company A",
    },
  });
for (const [index, a] of actors.entries()) {
  await db.user.create({ data: { id: a.userId } });
  await db.membership.create({
    data: { organisationId, userId: a.userId, isAdministrator: index === 0 },
  });
  await db.account.create({
    data: {
      userId: a.userId,
      username: a.username,
      passwordHash: await argon2.hash("synthetic-ap-password", passwordOptions),
    },
  });
  for (const id of [entityId, secondEntityId]) {
    await db.entityAccess.create({
      data: { organisationId, userId: a.userId, entityId: id },
    });
    await db.$executeRaw`INSERT INTO "ApGrant"(organisation_id,entity_id,user_id,view,review,verify,approve,manage) VALUES(${organisationId}::uuid,${id}::uuid,${a.userId}::uuid,true,${index === 0},${index === 1},${index >= 2},${index === 0})`;
  }
}
const policy = {
  currency: "GBP",
  rules: [
    {
      priority: 1,
      minimumGross: "50000",
      verifierId: actors[1].userId,
      approverIds: [actors[2].userId, actors[3].userId],
    },
  ],
  fallback: { verifierId: null, approverIds: [actors[2].userId] },
};
for (const id of [entityId, secondEntityId])
  await db.$executeRaw`INSERT INTO "ApPolicy"(organisation_id,entity_id,version,draft,published,published_version,published_by,published_at) VALUES(${organisationId}::uuid,${id}::uuid,1,${JSON.stringify(policy)}::jsonb,${JSON.stringify(policy)}::jsonb,1,${actors[0].userId}::uuid,now())`;
const foreignOrg = randomUUID(),
  foreignEntity = randomUUID(),
  foreignSupplier = randomUUID(),
  foreignInvoice = randomUUID();
await db.organisation.create({
  data: { id: foreignOrg, name: "Other synthetic company" },
});
await db.entity.create({
  data: {
    id: foreignEntity,
    organisationId: foreignOrg,
    name: "Private synthetic entity",
  },
});
await db.$executeRaw`INSERT INTO "ApSupplier"(id,organisation_id,entity_id,name,tax_id,create_digest) VALUES(${foreignSupplier}::uuid,${foreignOrg}::uuid,${foreignEntity}::uuid,'Private supplier','',${"f".repeat(64)})`;
await db.$executeRaw`INSERT INTO "ApInvoice"(id,organisation_id,entity_id,supplier_id,reference_key,data,create_digest) VALUES(${foreignInvoice}::uuid,${foreignOrg}::uuid,${foreignEntity}::uuid,${foreignSupplier}::uuid,'private','{}'::jsonb,${"e".repeat(64)})`;
const certDir = mkdtempSync(resolve(tmpdir(), "finai-ap-tls-"));
const cert = spawnSync(
  "openssl",
  [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    certDir + "/key.pem",
    "-out",
    certDir + "/cert.pem",
    "-days",
    "1",
    "-subj",
    "/CN=127.0.0.1",
    "-addext",
    "subjectAltName=IP:127.0.0.1",
  ],
  { stdio: "ignore" },
);
if (cert.status !== 0) throw new Error("Synthetic TLS setup failed");
const origin = "https://127.0.0.1:18445",
  proof = randomBytes(32).toString("hex");
const env = {
  ...process.env,
  NODE_ENV: "test",
  CHECKLIST_IDENTITY: "session",
  PUBLIC_ORIGIN: origin,
  API_TRUSTED_HOST: mode === "remote" ? "127.0.0.1:18446" : "127.0.0.1:18445",
  API_PROXY_TOKEN: proof,
  API_HOST: "127.0.0.1",
  API_PORT: "0",
  AP_SYNTHETIC_PDF_SHA256: createHash("sha256")
    .update(invoicePdf())
    .digest("hex"),
};
let app =
    mode === "remote"
      ? await createTestApplication({ env, quiet: true })
      : undefined,
  backend = app ? await app.getUrl() : "";
let embedded = createEmbeddedHandler({
  env: { ...env, FINAI_PUBLIC_ORIGIN: origin },
  loadApplication: () => ({ createApplication: createTestApplication }),
  retainWork: () => {},
});
const tls = {
  key: readFileSync(certDir + "/key.pem"),
  cert: readFileSync(certDir + "/cert.pem"),
};
globalAgent.options.ca = tls.cert;
process.env.FINAI_API_MODE = "remote";
process.env.FINAI_BACKEND_ORIGIN = "https://127.0.0.1:18446";
process.env.FINAI_PUBLIC_ORIGIN = origin;
process.env.FINAI_PROXY_TOKEN = proof;
const upstream = createServer(tls, (req, res) => {
  const r = request(
    backend + req.url,
    { method: req.method, headers: req.headers },
    (response) => {
      res.writeHead(response.statusCode || 502, response.headers);
      response.pipe(res);
    },
  );
  r.on("error", () => {
    res.statusCode = 502;
    res.end();
  });
  req.pipe(r);
});
if (mode === "remote")
  await new Promise<void>((resolve) =>
    upstream.listen(18446, "127.0.0.1", resolve),
  );
const root = resolve("artifacts/payables-dist");
const server = createServer(tls, (req, res) => {
  const incoming = new URL(req.url || "/", origin);
  if (
    incoming.pathname.startsWith("/api/") ||
    incoming.pathname.startsWith("/auth/")
  ) {
    incoming.searchParams.set("route", incoming.pathname.slice(1));
    req.url = "/api/proxy?" + incoming.searchParams.toString();
    void (mode === "remote" ? proxy(req, res) : embedded.handler(req, res));
    return;
  }
  const path = resolve(root, "." + decodeURIComponent(incoming.pathname));
  const file =
    path.startsWith(root + "/") && existsSync(path) && extname(path)
      ? path
      : resolve(root, "index.html");
  res.setHeader(
    "Content-Type",
    (
      {
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".css": "text/css",
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".woff2": "font/woff2",
      } as Record<string, string>
    )[extname(file)] || "text/html",
  );
  res.end(readFileSync(file));
});
await new Promise<void>((resolve) =>
  server.listen(18445, "127.0.0.1", resolve),
);
process.send?.({
  ready: true,
  organisationId,
  entityId,
  secondEntityId,
  actors,
  foreignInvoice,
  origin,
});
process.on("message", async (message: { command: string; userId?: string }) => {
  try {
    if (message.command === "restart") {
      if (app) {
        await app.close();
        app = await createTestApplication({ env, quiet: true });
        backend = await app.getUrl();
      } else {
        await embedded.close();
        embedded = createEmbeddedHandler({
          env: { ...env, FINAI_PUBLIC_ORIGIN: origin },
          loadApplication: () => ({ createApplication: createTestApplication }),
          retainWork: () => {},
        });
      }
    } else if (message.command === "revoke" && message.userId)
      await db.$executeRaw`UPDATE "ApGrant" SET approve=false WHERE organisation_id=${organisationId}::uuid AND user_id=${message.userId}::uuid`;
    process.send?.({ command: message.command, ok: true });
  } catch {
    process.send?.({ command: message.command, ok: false });
  }
});
let stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  server.close();
  if (mode === "remote") upstream.close();
  if (app) await app.close();
  await embedded.close();
  await db.$disconnect();
  await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
  await admin.$disconnect();
  rmSync(certDir, { recursive: true, force: true });
  process.exit(0);
};
process.on("SIGTERM", () => void stop());
process.on("disconnect", () => void stop());
