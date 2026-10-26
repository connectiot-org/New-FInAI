import { test, expect } from "@playwright/test";
import { createServer, request as httpRequest } from "node:http";
import type { AddressInfo } from "node:net";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { z } from "zod";
import type { PrismaClient as Client } from "../../backend/node_modules/@prisma/client";
import {
  createEmbeddedHandler,
  type ApplicationModule,
} from "../server/embedded";

test.describe.configure({ mode: "serial" });
const require = createRequire(import.meta.url);
const { PrismaClient } =
  require("../../backend/node_modules/@prisma/client") as {
    PrismaClient: new () => Client;
  };
const argon = require("../../backend/node_modules/argon2/argon2.cjs") as {
  hash(value: string, options: { type: number }): Promise<string>;
};
process.loadEnvFile("../backend/.env");
const original = process.env.DATABASE_URL!;
if (!["127.0.0.1", "localhost"].includes(new URL(original).hostname))
  throw new Error("Disposable local database required");
const schema = "vercel_" + randomUUID().replaceAll("-", "");
let admin: Client, db: Client;
let embedded: ReturnType<typeof createEmbeddedHandler>;
const server = createServer(async (req, res) => {
  // Emulate Vercel's optional pre-parsed body as well as the raw stream path.
  if (req.headers["x-test-preparsed"] === "yes") {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    (req as typeof req & { body: unknown }).body = JSON.parse(
      Buffer.concat(chunks).toString(),
    );
  }
  void embedded.handler(req, res);
});
const organisationId = randomUUID(),
  userId = randomUUID(),
  entityId = randomUUID();
const retained: Promise<unknown>[] = [];
let base: string,
  origin: string,
  cookie = "",
  csrf = "",
  listening = true;
const provider = {
  model: "controlled-embedded-fixture",
  configured: true,
  dailyLimit: 100000,
  async plan() {
    await new Promise((r) => setTimeout(r, 100));
    return {
      operations: [
        {
          kind: "checklist",
          period: "current",
          customerId: null,
          accountId: null,
          metric: "all",
          reason: "none",
        },
      ],
    };
  },
  async compose(input: unknown) {
    const x = input as {
      evidence: { facts: { id: string }[]; notes: Record<string, string> };
    };
    return {
      factIds: x.evidence.facts.slice(0, 3).map((f) => f.id),
      noteIds: Object.keys(x.evidence.notes).slice(0, 8),
    };
  },
};
function makeHandler() {
  const module = require("../.finai-server/src/app.js") as ApplicationModule;
  return createEmbeddedHandler({
    env: { ...process.env, NODE_ENV: "test", FINAI_PUBLIC_ORIGIN: origin },
    loadApplication: () => ({
      createApplication: async (options) => {
        const enriched = {
          ...options,
          quiet: true,
          assistantProvider: provider,
        };
        const app = await module.createApplication(enriched);
        listening = (
          app as typeof app & { getHttpServer(): { listening: boolean } }
        ).getHttpServer().listening;
        return app;
      },
    }),
    retainWork: (work) => {
      retained.push(work);
    },
  });
}
async function call(
  path: string,
  body?: unknown,
  options: {
    cookie?: string;
    csrf?: string;
    raw?: boolean;
    preparsed?: boolean;
  } = {},
) {
  const url = new URL(path, base);
  url.searchParams.set("route", url.pathname.slice(1));
  const r = await fetch(base + "/api/proxy?" + url.searchParams, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      origin,
      ...(options.preparsed ? { "x-test-preparsed": "yes" } : {}),
      cookie: options.cookie ?? cookie,
      "x-csrf-token": options.csrf ?? csrf,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined
      ? {}
      : { body: options.raw ? String(body) : JSON.stringify(body) }),
  });
  return {
    status: r.status,
    headers: r.headers,
    data: z.record(z.string(), z.unknown()).parse(await r.json()),
  };
}
test.beforeAll(async () => {
  admin = new PrismaClient();
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  const url = new URL(original);
  url.searchParams.set("schema", schema);
  process.env.DATABASE_URL = url.toString();
  const migrated = spawnSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    { cwd: "../backend", encoding: "utf8", env: process.env },
  );
  if (migrated.status !== 0) throw new Error("Synthetic migration failed");
  db = new PrismaClient();
  await db.organisation.create({
    data: { id: organisationId, name: "Synthetic Vercel organisation" },
  });
  await db.user.create({ data: { id: userId } });
  await db.membership.create({ data: { organisationId, userId } });
  await db.entity.create({
    data: { id: entityId, organisationId, name: "Synthetic Vercel entity" },
  });
  await db.entityAccess.create({
    data: { organisationId, userId, entityId, canWrite: true },
  });
  await db.account.create({
    data: {
      userId,
      username: "embedded-test",
      passwordHash: await argon.hash("synthetic-embedded-password", {
        type: 2,
      }),
    },
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  origin = base.replace("http:", "https:");
  embedded = makeHandler();
});
test.afterAll(async () => {
  if (embedded) await embedded.close();
  await new Promise<void>((r) => server.close(() => r()));
  if (db) await db.$disconnect();
  if (admin) {
    await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.$disconnect();
  }
  process.env.DATABASE_URL = original;
});
test("missing database gives an actionable safe error and does not boot local/demo identity", async () => {
  const active = embedded;
  embedded = createEmbeddedHandler({
    env: { FINAI_PUBLIC_ORIGIN: origin },
    loadApplication: () => {
      throw new Error("Must not boot");
    },
    retainWork: () => {},
  });
  try {
    const r = await call("/auth/session");
    expect(r.status).toBe(503);
    expect(r.data.code).toBe("DEPLOYMENT_NOT_CONFIGURED");
    expect(r.data.message).toContain("DATABASE_URL");
  } finally {
    embedded = active;
  }
});
test("packaged backend runs without a listener and anonymous/spoofed requests cannot access private data", async () => {
  expect(
    existsSync(
      ".finai-server/node_modules/.prisma/client/libquery_engine-rhel-openssl-3.0.x.so.node",
    ),
  ).toBe(true);
  expect((await call("/auth/session")).status).toBe(401);
  expect(listening).toBe(false);
  const result = await new Promise<number>((resolve, reject) => {
    const r = httpRequest(
      base + "/api/proxy?route=api/v1/assistant/capabilities",
      {
        headers: {
          host: "evil.example",
          "x-user-id": userId,
          "x-finai-proxy-token": "spoof",
        },
      },
      (res) => {
        res.resume();
        res.once("end", () => resolve(res.statusCode!));
      },
    );
    r.on("error", reject);
    r.end();
  });
  expect(result).toBe(403);
  expect((await call("/api/v1/assistant/capabilities")).status).toBe(401);
});
test("same-project session login, CSRF, saved business record and byte limits work", async () => {
  const signedIn = await call("/auth/login", {
    username: "embedded-test",
    organisationId,
    password: "synthetic-embedded-password",
  });
  expect(signedIn.status).toBe(200);
  const raw = signedIn.headers.getSetCookie()[0];
  expect(raw).toContain("HttpOnly");
  expect(raw).toContain("Secure");
  cookie = raw.split(";")[0];
  const session = await call("/auth/session");
  expect(session.status).toBe(200);
  csrf = z.string().parse(session.data.csrfToken);
  const task = {
    id: randomUUID(),
    entityId,
    month: "2026-10",
    title: "Synthetic embedded close item",
  };
  expect(
    (await call("/api/v1/checklist-tasks", task, { csrf: "wrong" })).status,
  ).toBe(403);
  expect((await call("/api/v1/checklist-tasks", task)).status).toBe(201);
  expect(
    (await call("/api/v1/checklist-tasks", "{broken", { raw: true })).status,
  ).toBe(400);
  expect(
    (await call("/api/v1/checklist-tasks", { value: "x".repeat(17000) }))
      .status,
  ).toBe(422);
});
test("pre-parsed Vercel JSON cannot bypass request caps or source authorization", async () => {
  expect(
    (
      await call(
        "/api/v1/checklist-tasks",
        { value: "x".repeat(17000) },
        { preparsed: true },
      )
    ).status,
  ).toBe(422);
  const record = {
    id: randomUUID(),
    entityId,
    month: "2026-10",
    title: "Second synthetic embedded item",
  };
  expect(
    (await call("/api/v1/checklist-tasks", record, { preparsed: true })).status,
  ).toBe(201);
});
test("registered background work completes after202 and yields grounded persisted facts", async () => {
  const id = randomUUID();
  expect(
    (
      await call("/api/v1/assistant/conversations", {
        id,
        entityId,
        month: "2026-10",
        currency: "USD",
      })
    ).status,
  ).toBe(200);
  const input = {
    id: randomUUID(),
    question: "What is incomplete?",
    expectedVersion: 1,
    model: provider.model,
  };
  const reserved = await call(
    `/api/v1/assistant/conversations/${id}/turns`,
    input,
  );
  expect(reserved.status).toBe(202);
  expect(retained).toHaveLength(1);
  expect(
    z.object({ status: z.string() }).parse(reserved.data.turn).status,
  ).toBe("pending");
  await retained[0];
  const read = await call(`/api/v1/assistant/conversations/${id}`);
  const turn = z
    .object({
      status: z.literal("completed"),
      model: z.literal(provider.model),
      answer: z.object({ facts: z.array(z.object({ value: z.string() })) }),
    })
    .parse(z.array(z.unknown()).parse(read.data.turns)[0]);
  expect(
    turn.answer.facts.some((f) => f.value === "Synthetic embedded close item"),
  ).toBe(true);
  expect(
    (await call(`/api/v1/assistant/conversations/${id}/turns`, input)).status,
  ).toBe(202);
  expect(retained).toHaveLength(1);
});
test("warm-instance replacement preserves the session; logout revokes it across instances", async () => {
  await embedded.close();
  embedded = makeHandler();
  expect((await call("/auth/session")).status).toBe(200);
  const foreign = await call(
    `/api/v1/assistant/conversations?entityId=${randomUUID()}`,
  );
  expect(foreign.status).toBe(404);
  expect(foreign.data.code).toBe("NOT_FOUND");
  expect((await call("/auth/logout", {})).status).toBe(200);
  expect((await call("/auth/session")).status).toBe(401);
});
