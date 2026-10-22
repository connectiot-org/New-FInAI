import { test, expect } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
let fixture: ChildProcess;
let info: { origin: string; organisationId: string; entityId: string };
test.beforeAll(async () => {
  fixture = spawn(
    process.execPath,
    [
      "--env-file=../backend/.env",
      "--import",
      "../backend/node_modules/tsx/dist/loader.mjs",
      "scripts/session-fixture.ts",
    ],
    { stdio: ["ignore", "ignore", "pipe", "ipc"] },
  );
  let stderr = "";
  fixture.stderr?.on("data", (chunk) => (stderr += chunk));
  info = await new Promise((resolve, reject) => {
    fixture.once("message", (message) => resolve(message as typeof info));
    fixture.once("exit", () =>
      reject(new Error("Session fixture failed: " + stderr)),
    );
  });
});
test.afterAll(async () => {
  if (fixture?.exitCode === null) {
    const exited = new Promise<void>((resolve) =>
      fixture.once("exit", () => resolve()),
    );
    fixture.kill("SIGTERM");
    await exited;
  }
});
test("HTTPS production sign-in, copy, refresh, CSRF denial, cookie flags and logout", async ({
  page,
  context,
}) => {
  await page.goto(`${info.origin}/close/checklist?month=2060-09`);
  await expect(
    page.getByRole("heading", { name: "Sign in to FinAI" }),
  ).toBeVisible();
  await page.getByLabel("Account name").fill("browser-test");
  await page.getByLabel("Organisation ID").fill(info.organisationId);
  await page
    .getByLabel("Password", { exact: true })
    .fill("synthetic-browser-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("Saved tasks", { exact: true })).toBeVisible();
  await page.getByLabel("Task title").fill("Secure session task");
  await page.getByRole("button", { name: "Add task", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "Secure session task" }),
  ).toBeVisible();
  await page.getByRole("checkbox", { name: "Secure session task" }).click();
  await expect(
    page.getByRole("checkbox", { name: "Secure session task" }),
  ).toBeChecked();
  await page.getByLabel("Checklist month").fill("2060-10");
  await page
    .getByRole("button", { name: "Copy last month’s tasks", exact: true })
    .click();
  await page.getByRole("button", { name: "Copy tasks", exact: true }).click();
  await expect(page.getByText("0/1 completed", { exact: true })).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("checkbox", { name: "Secure session task" }),
  ).not.toBeChecked();
  const unknown = await page.evaluate(async () => {
    const r = await fetch("/api/v1/does-not-exist");
    return {
      status: r.status,
      type: r.headers.get("content-type"),
      body: await r.json(),
    };
  });
  expect(unknown.status).toBe(404);
  expect(unknown.type).toContain("application/json");
  expect(unknown.body.code).toBe("NOT_FOUND");
  const cookies = await context.cookies();
  const session = cookies.find((c) => c.name === "__Host-finai_session")!;
  expect(session.httpOnly).toBe(true);
  expect(session.secure).toBe(true);
  expect(session.sameSite).toBe("Strict");
  const status = await page.evaluate(async () => {
    const r = await fetch("/api/v1/checklist-tasks/copy-previous-month", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entityId: "22222222-2222-4222-8222-222222222222",
        month: "2060-11",
      }),
    });
    return r.status;
  });
  expect(status).toBe(403);
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).some((k) => /password|token|session/i.test(k)),
    ),
  ).toBe(false);
  await page.goto(`${info.origin}/tools/subscriptions?entity=${info.entityId}`);
  await expect(
    page.getByRole("heading", { name: "Subscription renewals", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Add subscription", exact: true })
    .click();
  await page
    .getByLabel("Supplier name", { exact: true })
    .fill("Session supplier");
  await page
    .getByLabel("Subscription name", { exact: true })
    .fill("Authenticated renewal");
  await page.getByLabel("Renewal date", { exact: true }).fill("2060-12-01");
  await page
    .getByRole("button", { name: "Save subscription", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Edit Authenticated renewal",
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", {
      name: "Edit Authenticated renewal",
      exact: true,
    }),
  ).toBeVisible();
  await page.goto(`${info.origin}/tools/payment-due-date`);
  await page.getByLabel("Invoice date", { exact: true }).fill("2026-10-01");
  await page.getByLabel("As-of date", { exact: true }).fill("2026-11-02");
  await page.getByRole("button", { name: "Calculate", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Payment due-date result", exact: true }),
  ).toContainText("2 days overdue");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Sign in to FinAI" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Sign in to FinAI" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Payment due-date result", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Account name").fill("browser-test");
  await page.getByLabel("Organisation ID").fill(info.organisationId);
  await page
    .getByLabel("Password", { exact: true })
    .fill("synthetic-browser-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Calculate", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("region", { name: "Payment due-date result", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Invoice date", { exact: true })).toHaveValue(
    "",
  );
});

async function signIn(page: import("@playwright/test").Page) {
  await page.getByLabel("Account name").fill("browser-test");
  await page.getByLabel("Organisation ID").fill(info.organisationId);
  await page
    .getByLabel("Password", { exact: true })
    .fill("synthetic-browser-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Sign out", exact: true }),
  ).toBeVisible();
}

test("product navigation excludes simulated finance, preserves legacy storage untouched, and fits 390px", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    const get = Storage.prototype.getItem,
      set = Storage.prototype.setItem;
    const accesses: string[] = [];
    Object.defineProperty(window, "demoStorageAccess", { value: accesses });
    set.call(localStorage, "finai-demo-v1", "legacy-sentinel");
    Storage.prototype.getItem = function (key: string) {
      if (key === "finai-demo-v1") accesses.push("read");
      return get.call(this, key);
    };
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key === "finai-demo-v1") accesses.push("write");
      return set.call(this, key, value);
    };
  });
  const response = await page.goto(info.origin + "/tools/payment-due-date");
  expect(response?.headers()["content-security-policy"]).toContain(
    "frame-ancestors 'none'",
  );
  await signIn(page);
  const navigation = page.getByRole("navigation", { name: "Finance tools" });
  await expect(navigation.getByRole("link")).toHaveCount(3);
  for (const name of [
    "Monthly checklist",
    "Subscription renewals",
    "Payment due-date calculator",
  ]) {
    await navigation.getByRole("link", { name, exact: true }).click();
    await expect(
      page.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Sign out", exact: true }),
    ).toHaveCount(1);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel("Invoice date", { exact: true }).fill("2026-10-01");
  await page.getByLabel("As-of date", { exact: true }).fill("2026-11-02");
  await page.getByRole("button", { name: "Calculate", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("region", { name: "Payment due-date result" }),
  ).toContainText("2 days overdue");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "artifacts/product-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { demoStorageAccess: string[] })
          .demoStorageAccess,
    ),
  ).toEqual([]);
  await expect(page.locator("body")).not.toContainText("Demo workspace");
  await page.goto(info.origin + "/accounting/ledger");
  await expect(
    page.getByRole("heading", { name: "Page unavailable" }),
  ).toBeVisible();
  await page.goto(info.origin + "/tools/subscriptions");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Subscription renewals", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  for (const path of [
    "/api",
    "/auth",
    "/api/no-such-route",
    "/auth/no-such-route",
  ]) {
    const r = await page.request.get(info.origin + path);
    expect(r.status()).toBe(404);
    expect(r.headers()["content-type"]).toContain("application/json");
    expect((await r.json()).requestId).toBe(r.headers()["x-request-id"]);
  }
});

test("malformed sign-in and failed sign-out never confirm success; expired API session clears product state", async ({
  page,
}) => {
  await page.goto(info.origin + "/tools/payment-due-date");
  await page.route("**/auth/login", (route) =>
    route.fulfill({ json: { csrfToken: "invalid" } }),
  );
  await page.getByLabel("Account name").fill("browser-test");
  await page.getByLabel("Organisation ID").fill(info.organisationId);
  await page
    .getByLabel("Password", { exact: true })
    .fill("synthetic-browser-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Sign-in failed");
  await expect(
    page.getByRole("button", { name: "Sign out", exact: true }),
  ).toHaveCount(0);
  await page.unroute("**/auth/login");
  await signIn(page);
  await page.route("**/auth/session", (route) =>
    route.fulfill({ status: 503, json: { message: "Synthetic outage" } }),
  );
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Sign out could not be confirmed",
  );
  await expect(
    page.getByRole("button", { name: "Calculate", exact: true }),
  ).toBeEnabled();
  await page.unroute("**/auth/session");
  await page.route("**/payment-due-date-checks", (route) =>
    route.fulfill({ status: 401, json: { message: "Expired" } }),
  );
  await page.getByLabel("Invoice date", { exact: true }).fill("2026-10-01");
  await page.getByLabel("As-of date", { exact: true }).fill("2026-11-02");
  await page.getByRole("button", { name: "Calculate", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Sign in to FinAI" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Payment due-date result" }),
  ).toHaveCount(0);
  await page.unroute("**/payment-due-date-checks");
  await signIn(page);
  await expect(page.getByLabel("Invoice date", { exact: true })).toHaveValue(
    "",
  );
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Sign in to FinAI" }),
  ).toBeVisible();
});
