import { test, expect } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
let fixture: ChildProcess,
  info: { origin: string; organisationId: string; entityId: string };
async function action(command: string) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Fixture command timeout")),
      15000,
    );
    fixture.once("message", (v: { ok: boolean }) => {
      clearTimeout(timer);
      if (v.ok) resolve();
      else reject(new Error("Fixture failed"));
    });
    fixture.send(command);
  });
}
test.beforeAll(async () => {
  fixture = spawn(
    process.execPath,
    [
      "--env-file=../backend/.env",
      "--import",
      "../backend/node_modules/tsx/dist/loader.mjs",
      "scripts/session-fixture.ts",
    ],
    {
      env: { ...process.env, FINAI_TEST_WORKSPACE: "1" },
      stdio: ["ignore", "ignore", "pipe", "ipc"],
    },
  );
  let stderr = "";
  fixture.stderr?.on("data", (c) => (stderr += c));
  info = await new Promise((resolve, reject) => {
    fixture.once("message", (v) => resolve(v as typeof info));
    fixture.once("exit", () =>
      reject(new Error("Synthetic workspace fixture failed: " + stderr)),
    );
  });
});
test.afterAll(async () => {
  if (fixture?.exitCode === null) {
    const done = new Promise<void>((r) => fixture.once("exit", () => r()));
    fixture.kill("SIGTERM");
    await done;
  }
});
test("real private workspace: single session, imported snapshots, saved tasks/subscriptions, restart, expiry/logout and no demo persistence", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(info.origin + "/workspace");
  await page.getByLabel("Account name").fill("browser-test");
  await page.getByLabel("Organisation ID").fill(info.organisationId);
  await page
    .getByLabel("Password", { exact: true })
    .fill("synthetic-browser-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  const card = page.getByRole("region", {
    name: "Outstanding by customer",
    exact: true,
  });
  await card.getByLabel("Receivables entity").selectOption(info.entityId);
  await expect(card.locator("dd")).toHaveText(["$750.00", "1", "1"]);
  await expect(
    page.getByRole("button", { name: "Sign out", exact: true }),
  ).toHaveCount(1);
  await expect(page.locator(".finance-snapshot")).toHaveCount(0);
  await expect(page.locator("main")).not.toContainText("Northstar");
  await page
    .getByRole("link", { name: "Monthly checklist", exact: true })
    .click();
  await page.getByLabel("Checklist entity").selectOption(info.entityId);
  await page.getByLabel("Checklist month").fill("2061-09");
  await page.getByLabel("Task title").fill("Synthetic workspace task");
  await page.getByRole("button", { name: "Add task", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "Synthetic workspace task" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("checkbox", { name: "Synthetic workspace task" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Subscriptions", exact: true }).click();
  await page
    .getByLabel("Subscription entity", { exact: true })
    .selectOption(info.entityId);
  await page
    .getByRole("button", { name: "Add subscription", exact: true })
    .click();
  await page
    .getByLabel("Supplier name", { exact: true })
    .fill("Synthetic workspace supplier");
  await page
    .getByLabel("Subscription name", { exact: true })
    .fill("Workspace plan");
  await page.getByLabel("Renewal date", { exact: true }).fill("2061-10-01");
  await page
    .getByRole("button", { name: "Save subscription", exact: true })
    .click();
  await expect(
    page.getByRole("cell", {
      name: "Synthetic workspace supplier Workspace plan",
      exact: true,
    }),
  ).toBeVisible();
  await action("restart");
  await page.reload();
  await expect(
    page.getByRole("cell", {
      name: "Synthetic workspace supplier Workspace plan",
      exact: true,
    }),
  ).toBeVisible();
  await action("importB");
  await page.getByRole("link", { name: "Overview", exact: true }).click();
  await card.getByLabel("Receivables entity").selectOption(info.entityId);
  await expect(card.locator("dd")).toHaveText(["$500.00", "1", "1"]);
  await expect(card).toContainText("version 2");
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `artifacts/workspace-production/overview-${width}.png`,
      fullPage: true,
    });
  }
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
  const cookie = (await context.cookies()).find(
    (c) => c.name === "__Host-finai_session",
  );
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.secure).toBe(true);
  await action("proxyOff");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("alert").first()).toContainText("unavailable");
  await expect(
    page.getByRole("heading", { name: "Sign in to your finance workspace" }),
  ).toHaveCount(0);
  await action("proxyOn");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Sign in to your finance workspace" }),
  ).toBeVisible();
  await expect(card).toHaveCount(0);
  await page.getByLabel("Account name").fill("browser-test");
  await page.getByLabel("Organisation ID").fill(info.organisationId);
  await page
    .getByLabel("Password", { exact: true })
    .fill("synthetic-browser-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page
    .getByRole("link", { name: "Monthly checklist", exact: true })
    .click();
  await action("expire");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Sign in to your finance workspace" }),
  ).toBeVisible();
  await expect(
    page.getByText("Synthetic workspace task", { exact: true }),
  ).toHaveCount(0);
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
  expect(errors).toEqual([]);
});
