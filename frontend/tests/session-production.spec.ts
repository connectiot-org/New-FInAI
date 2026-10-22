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
    page.getByRole("heading", { name: "Sign in to your checklist" }),
  ).toBeVisible();
  await page.getByLabel("Account name").fill("browser-test");
  await page.getByLabel("Organisation ID").fill(info.organisationId);
  await page
    .getByLabel("Password", { exact: true })
    .fill("synthetic-browser-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByText("Connected backend", { exact: true }),
  ).toBeVisible();
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
  await page.goto(
    `${info.origin}/tools/invoice-duplicates?entity=${info.entityId}`,
  );
  const csv =
    "supplier_id,supplier_name,invoice_number,invoice_date,amount,currency\n" +
    Array.from(
      { length: 300 },
      (_, i) => `V001,Synthetic session supplier,INV-${i},2060-10-01,12.50,USD`,
    ).join("\n");
  expect(Buffer.byteLength(csv)).toBeGreaterThan(16384);
  await page
    .getByLabel("Invoice CSV file", { exact: true })
    .setInputFiles({
      name: "session-invoices.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });
  await page
    .getByRole("button", { name: "Check for duplicates", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Invoice check results" }),
  ).toContainText("300");
  await expect(
    page.getByText(
      "No possible duplicates found in this file using the matching rule.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(
    await page.evaluate(async (entityId) => {
      const response = await fetch("/api/v1/invoice-duplicate-checks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityId, csv: "bad" }),
      });
      return response.status;
    }, info.entityId),
  ).toBe(403);
  expect(
    await page.evaluate(async () => {
      const response = await fetch("/api/v1/checklist-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "x".repeat(20000) }),
      });
      return response.status;
    }),
  ).toBe(422);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Invoice check results" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Sign in to FinAI" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Sign in to FinAI" }),
  ).toBeVisible();
});
