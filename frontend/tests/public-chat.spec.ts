import { test, expect } from "@playwright/test";
import {
  createServer,
  request as nodeRequest,
  type IncomingMessage,
} from "node:http";
import type { AddressInfo } from "node:net";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { createPublicChatHandler } from "../server/public-chat";

test.describe.configure({ mode: "serial" });
const key = "controlled-public-chat-test-key";
const alpha = "sample/alpha:free",
  beta = "sample/beta:free";
const row = (id: string, name: string) => ({
  id,
  name,
  pricing: { prompt: "0", completion: "0", request: "0" },
  architecture: { input_modalities: ["text"], output_modalities: ["text"] },
  supported_parameters: [],
});
let rows: unknown[],
  mode = "normal",
  time = Date.now(),
  origin: string,
  providerOrigin: string;
let completions: {
  body: Record<string, unknown>;
  authorization?: string;
  cookie?: string;
}[] = [];
let catalogs = 0,
  privateRequests = 0;
let releases: (() => void)[] = [];
let handler: ReturnType<typeof createPublicChatHandler>;
const transport: typeof fetch = async (url, init) => {
  const target = new URL(String(url));
  expect(target.origin).toBe("https://openrouter.ai");
  expect(["/api/v1/models", "/api/v1/chat/completions"]).toContain(
    target.pathname,
  );
  expect(init?.redirect).toBe("error");
  if (mode === "timeout" && target.pathname.endsWith("completions"))
    throw new DOMException("private upstream detail", "TimeoutError");
  return fetch(providerOrigin + target.pathname, init);
};
const provider = createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  if (req.url === "/api/v1/models") {
    catalogs++;
    if (mode === "catalog-down") {
      res.writeHead(503);
      res.end('{"secret":"hidden-provider-detail"}');
      return;
    }
    res.end(JSON.stringify({ data: mode === "empty" ? [] : rows }));
    return;
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const body = JSON.parse(Buffer.concat(chunks).toString()) as Record<
    string,
    unknown
  >;
  completions.push({
    body,
    authorization: req.headers.authorization,
    cookie: req.headers.cookie,
  });
  const status = /^status-\d+$/.test(mode) ? Number(mode.slice(7)) : 200;
  if (status !== 200) {
    res.writeHead(status);
    res.end('{"message":"hidden-provider-detail"}');
    return;
  }
  const current = mode;
  if (current === "slow")
    await new Promise<void>((done) => {
      releases.push(done);
      res.once("close", done);
    });
  if (res.destroyed) return;
  if (current === "invalid") {
    res.end('{"choices":[]}');
    return;
  }
  const messages = body.messages as { content: string }[];
  const content =
    current === "huge"
      ? "x".repeat(600000)
      : current === "long"
        ? "x".repeat(5000)
        : current === "html"
          ? '<img src=x onerror="alert(1)">'
          : `Hello from ${body.model}: ${messages.at(-1)?.content}`;
  res.end(
    JSON.stringify({
      model: current === "router" ? beta : body.model,
      choices: [{ message: { content } }],
      usage: { cost: current === "paid-response" ? 0.01 : 0 },
    }),
  );
});
const app = createServer(async (req, res) => {
  try {
    const path = new URL(req.url!, "http://localhost").pathname;
    if (path.startsWith("/api/chat/")) {
      if (req.headers["x-test-preparsed"] === "yes") {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(Buffer.from(chunk));
        (req as IncomingMessage & { body: unknown }).body = JSON.parse(
          Buffer.concat(chunks).toString(),
        );
        delete req.headers["content-length"];
      }
      await handler(req, res, path.slice("/api/chat/".length));
      return;
    }
    if (path.startsWith("/auth/") || path.startsWith("/api/")) {
      privateRequests++;
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end('{"code":"UNAUTHENTICATED"}');
      return;
    }
    const root = resolve("artifacts/public-chat-dist");
    const file = resolve(root, "." + path);
    let data: Buffer;
    let extension = extname(file);
    try {
      if (!file.startsWith(root + "/") || !extension) throw new Error();
      data = await readFile(file);
    } catch {
      data = await readFile(resolve(root, "index.html"));
      extension = ".html";
    }
    const mime: Record<string, string> = {
      ".html": "text/html",
      ".js": "text/javascript",
      ".css": "text/css",
      ".woff2": "font/woff2",
      ".svg": "image/svg+xml",
      ".png": "image/png",
    };
    res.writeHead(200, {
      "Content-Type": mime[extension] || "application/octet-stream",
    });
    res.end(data);
  } catch {
    res.writeHead(500);
    res.end("Test fixture failed");
  }
});
function reset(
  env: NodeJS.ProcessEnv = { NODE_ENV: "test", OPENROUTER_API_KEY: key },
) {
  handler = createPublicChatHandler({ env, transport, now: () => time });
}
async function call(
  body?: unknown,
  headers: Record<string, string> = {},
  route = "messages",
) {
  return fetch(origin + "/api/chat/" + route, {
    method: body === undefined ? "GET" : "POST",
    headers: { origin, "Content-Type": "application/json", ...headers },
    ...(body === undefined
      ? {}
      : { body: typeof body === "string" ? body : JSON.stringify(body) }),
  });
}
const question = {
  model: beta,
  messages: [{ role: "user", content: "Hello test" }],
};
test.beforeAll(async () => {
  await new Promise<void>((r) => provider.listen(0, "127.0.0.1", r));
  providerOrigin = `http://127.0.0.1:${(provider.address() as AddressInfo).port}`;
  await new Promise<void>((r) => app.listen(0, "127.0.0.1", r));
  origin = `http://127.0.0.1:${(app.address() as AddressInfo).port}`;
});
test.beforeEach(() => {
  for (const release of releases) release();
  releases = [];
  mode = "normal";
  completions = [];
  catalogs = 0;
  privateRequests = 0;
  rows = [row(alpha, "Alpha"), row(beta, "Beta")];
  time += 300001;
  reset();
});
test.afterAll(async () => {
  for (const release of releases) release();
  await new Promise<void>((r) => app.close(() => r()));
  await new Promise<void>((r) => provider.close(() => r()));
});

test("public catalog includes free models without structured output, excludes paid/invalid/nontext rows and caches safely", async () => {
  rows.push(
    row(alpha, "Alpha"),
    {
      ...row("paid/model", "Paid"),
      pricing: { prompt: "0.001", completion: "0" },
    },
    {
      ...row("paid/request", "Request charge"),
      pricing: { prompt: "0", completion: "0", request: "0.01" },
    },
    {
      ...row("audio/model", "Audio"),
      architecture: {
        input_modalities: ["audio"],
        output_modalities: ["audio"],
      },
    },
    {
      ...row("blank/price", "Blank"),
      pricing: { prompt: "", completion: "0" },
    },
    row("bad?model", "Bad"),
  );
  reset({ NODE_ENV: "test" });
  const response = await call(undefined, {}, "models");
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toMatchObject({
    items: [
      { id: alpha, name: "Alpha" },
      { id: beta, name: "Beta" },
    ],
    configured: false,
    freeOnly: true,
  });
  await (await call(undefined, {}, "models")).body?.cancel();
  expect(catalogs).toBe(1);
  expect(privateRequests).toBe(0);
});
test("model requests use the server key and chosen model, zero price caps, no identity/cookies/tools or database", async () => {
  reset({
    NODE_ENV: "test",
    OPENROUTER_API_KEY: key,
    Openrouter: "unused-alias",
  });
  const response = await call(question, {
    cookie: "private-session=do-not-forward",
    "x-user-id": "do-not-forward",
  });
  expect(response.status).toBe(200);
  const body = await response.text();
  expect(JSON.parse(body)).toEqual({
    selectedModel: beta,
    model: beta,
    content: "Hello from sample/beta:free: Hello test",
  });
  expect(body).not.toContain(key);
  expect(completions).toHaveLength(1);
  expect(completions[0].authorization).toBe("Bearer " + key);
  expect(completions[0].cookie).toBeUndefined();
  expect(completions[0].body).toEqual({
    ...question,
    max_tokens: 4096,
    stream: false,
    provider: { max_price: { prompt: 0, completion: 0 } },
  });
  expect(privateRequests).toBe(0);
  reset({ NODE_ENV: "test", Openrouter: key });
  expect((await call(question)).status).toBe(200);
  expect(completions[1].authorization).toBe("Bearer " + key);
});
test("missing key gives actionable configuration error without a database requirement or invented answer", async () => {
  reset({ NODE_ENV: "test" });
  const response = await call(question);
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({
    code: "PROVIDER_NOT_CONFIGURED",
    message: expect.stringContaining("OPENROUTER_API_KEY"),
  });
  expect(completions).toHaveLength(0);
  expect(catalogs).toBe(0);
});
test("strict messages, sequence, aggregate and model validation reject overrides before a provider completion", async () => {
  const bad = [
    "{bad",
    { ...question, key: "client-override" },
    { ...question, messages: [{ role: "system", content: "override" }] },
    { ...question, messages: [{ role: "assistant", content: "first" }] },
    { ...question, messages: [{ role: "user", content: "x".repeat(4001) }] },
    {
      ...question,
      messages: Array.from({ length: 11 }, (_, i) => ({
        role: i % 2 ? "assistant" : "user",
        content: "x".repeat(2000),
      })),
    },
    { ...question, model: "paid/model" },
  ];
  for (let i = 0; i < bad.length; i++) {
    time += 60001;
    expect((await call(bad[i])).status).toBe(i === 0 ? 400 : 422);
  }
  expect(completions).toHaveLength(0);
});
test("raw, chunked and Vercel pre-parsed request bodies enforce the same byte cap", async () => {
  const oversized = { ...question, padding: "x".repeat(70000) };
  expect((await call(oversized)).status).toBe(422);
  expect((await call(oversized, { "x-test-preparsed": "yes" })).status).toBe(
    422,
  );
  expect((await call(question, { "x-test-preparsed": "yes" })).status).toBe(
    200,
  );
  const chunked = await new Promise<number>((resolve, reject) => {
    const req = nodeRequest(
      origin + "/api/chat/messages",
      {
        method: "POST",
        headers: { origin, "Content-Type": "application/json" },
      },
      (res) => {
        res.resume();
        res.once("end", () => resolve(res.statusCode!));
      },
    );
    req.on("error", reject);
    req.write(JSON.stringify(oversized));
    req.end();
  });
  expect(chunked).toBe(422);
  expect(completions).toHaveLength(1);
});
test("cross-origin, missing-origin and wrong-method requests cannot spend the server key", async () => {
  expect(
    (await call(question, { origin: "https://elsewhere.example" })).status,
  ).toBe(403);
  expect((await call(question, { origin: "" })).status).toBe(403);
  expect((await call(undefined)).status).toBe(405);
  expect((await call(undefined, {}, "unknown")).status).toBe(404);
  expect(completions).toHaveLength(0);
  expect(catalogs).toBe(0);
});
test("provider key/quota/model/rate/timeout/invalid/positive-cost failures are explicit and redact provider details", async () => {
  for (const [scenario, status, code] of [
    ["status-401", 503, "PROVIDER_AUTHENTICATION"],
    ["status-402", 429, "PROVIDER_QUOTA"],
    ["status-429", 429, "RATE_LIMITED"],
    ["status-404", 503, "MODEL_UNAVAILABLE"],
    ["status-500", 503, "PROVIDER_UNAVAILABLE"],
    ["timeout", 504, "PROVIDER_TIMEOUT"],
    ["invalid", 502, "PROVIDER_RESPONSE_INVALID"],
    ["paid-response", 502, "PROVIDER_RESPONSE_INVALID"],
    ["huge", 502, "PROVIDER_RESPONSE_INVALID"],
  ] as const) {
    mode = scenario;
    reset();
    const response = await call(question);
    expect(response.status, scenario).toBe(status);
    expect(response.headers.get("retry-after")).toBeNull();
    const body = await response.text();
    expect(JSON.parse(body).code, scenario).toBe(code);
    expect(body).not.toContain("hidden-provider-detail");
    expect(body).not.toContain(key);
  }
});
test("expired catalog revalidation refuses removed/free-to-paid models without paid fallback", async () => {
  expect((await call(question)).status).toBe(200);
  rows = [
    row(alpha, "Alpha"),
    { ...row(beta, "Beta"), pricing: { prompt: "0.01", completion: "0.01" } },
  ];
  time += 300001;
  expect((await call(question)).status).toBe(422);
  expect(completions).toHaveLength(1);
  expect(catalogs).toBe(2);
});
test("anonymous request rate and in-flight limits apply and recover without automatic retries", async () => {
  for (let i = 0; i < 5; i++) expect((await call(question)).status).toBe(200);
  const limited = await call(question);
  expect(limited.status).toBe(429);
  expect(limited.headers.get("retry-after")).toBe("60");
  expect(completions).toHaveLength(5);
  time += 60001;
  expect((await call(question)).status).toBe(200);
  reset();
  mode = "slow";
  completions = [];
  const first = call(question),
    second = call(question);
  await expect.poll(() => completions.length).toBe(2);
  expect((await call(question)).status).toBe(429);
  for (const release of releases) release();
  expect((await first).status).toBe(200);
  expect((await second).status).toBe(200);
});
test("built public chat opens without sign-in, selects any free text model, keeps follow-ups and clears page-only history", async ({
  page,
}) => {
  await page.goto(origin + "/assistant");
  await expect(page).toHaveURL(/\/workspace\/assistant$/);
  await expect(
    page.getByRole("heading", { name: "FinAI Assistant", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Account name")).toHaveCount(0);
  await expect(page.getByLabel("Chat model").locator("option")).toHaveCount(3);
  await page.getByLabel("Chat model").selectOption(beta);
  await page.getByLabel("Your message").fill("Public hello");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByRole("log")).toContainText(
    "Hello from sample/beta:free: Public hello",
  );
  mode = "long";
  await page.getByLabel("Your message").fill("Long answer");
  await page.getByLabel("Your message").press("Enter");
  await expect(page.locator(".public-chat-message.assistant")).toHaveCount(2);
  mode = "html";
  await page.getByLabel("Chat model").selectOption(alpha);
  await page.getByLabel("Your message").fill("Follow-up");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByRole("log")).toContainText(
    '<img src=x onerror="alert(1)">',
  );
  await expect(page.getByRole("log").locator("img")).toHaveCount(0);
  expect(completions[2].body.model).toBe(alpha);
  const history = completions[2].body.messages as {
    role: string;
    content: string;
  }[];
  expect(history.map((m) => m.role)).toEqual([
    "user",
    "assistant",
    "user",
    "assistant",
    "user",
  ]);
  expect(history[3].content).toHaveLength(4000);
  expect(privateRequests).toBe(0);
  expect(
    await page.evaluate(() =>
      JSON.stringify({ ...localStorage, ...sessionStorage }),
    ),
  ).not.toContain("Public hello");
  await page.getByRole("button", { name: "Clear chat", exact: true }).click();
  await expect(page.locator(".public-chat-message")).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".public-chat-message")).toHaveCount(0);
  await page.getByLabel("Your message").fill("Hello, can we chat?");
  mode = "normal";
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.locator(".public-chat-message.assistant")).toHaveCount(1);
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `artifacts/public-chat-${width}.png`,
      fullPage: true,
    });
  }
});
test("public model search, missing key, catalog failure/empty and provider errors stay visible without fake output", async ({
  page,
}) => {
  await page.goto(origin + "/workspace/assistant");
  await page.getByLabel("Find a model").fill("beta");
  await expect(page.getByLabel("Chat model").locator("option")).toHaveCount(2);
  await page.getByLabel("Chat model").selectOption(beta);
  mode = "status-429";
  await page.getByLabel("Your message").fill("Keep this draft");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("rate limit");
  await expect(page.getByLabel("Your message")).toHaveValue("Keep this draft");
  await expect(page.locator(".public-chat-message")).toHaveCount(0);
  mode = "normal";
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.locator(".public-chat-message.assistant")).toHaveCount(1);
  expect(completions[1].body.messages as unknown[]).toHaveLength(1);
  reset({ NODE_ENV: "test" });
  await page
    .getByRole("button", { name: "Reload models", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "server key is missing" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Send message", exact: true }),
  ).toBeDisabled();
  mode = "catalog-down";
  reset();
  await page
    .getByRole("button", { name: "Reload models", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "model list is unavailable" }),
  ).toBeVisible();
  mode = "empty";
  reset();
  await page
    .getByRole("button", { name: "Reload models", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "no free text-chat models",
  );
});

test("the free router is preferred when available and the actual served model is shown", async ({
  page,
}) => {
  rows.push(row("openrouter/free", "Free model router"));
  mode = "router";
  await page.goto(origin + "/workspace/assistant");
  await expect(page.getByLabel("Chat model")).toHaveValue("openrouter/free");
  await page.getByLabel("Your message").fill("Router hello");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    page.locator(".public-chat-message.assistant strong"),
  ).toHaveText(beta);
  expect(completions[0].body.model).toBe("openrouter/free");
});
test("stopping/clearing a pending response cannot publish a late answer or resend the question", async ({
  page,
}) => {
  mode = "slow";
  await page.goto(origin + "/workspace/assistant");
  await page.getByLabel("Your message").fill("Cancelled question");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect.poll(() => completions.length).toBe(1);
  await page
    .getByRole("button", { name: "Stop response", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("cancelled");
  await page.getByRole("button", { name: "Clear chat", exact: true }).click();
  for (const release of releases) release();
  mode = "normal";
  await page.getByLabel("Your message").fill("New question");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByRole("log")).toContainText("New question");
  await expect(page.getByRole("log")).not.toContainText("Cancelled question");
  expect(completions).toHaveLength(2);
});
test("financial Assistant remains behind its session gate when public chat is enabled", async ({
  page,
}) => {
  await page.goto(origin + "/workspace/assistant");
  await page
    .getByRole("link", { name: "Financial workspace Assistant", exact: true })
    .click();
  await expect(page).toHaveURL(/\/workspace\/assistant\/records$/);
  await expect(page.getByLabel("Account name")).toBeVisible();
  await expect(page.getByLabel("Chat model")).toHaveCount(0);
  expect(privateRequests).toBeGreaterThan(0);
});
