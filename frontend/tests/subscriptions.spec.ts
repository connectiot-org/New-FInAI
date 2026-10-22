import { test, expect, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
let fixture: ChildProcess;
const api = "http://127.0.0.1:3002/api/v1",
  entity = "22222222-2222-4222-8222-222222222222";
test.beforeAll(async () => {
  fixture = spawn(
    process.execPath,
    [
      "--env-file=../backend/.env",
      "--import",
      "../backend/node_modules/tsx/dist/loader.mjs",
      "scripts/subscriptions-fixture.ts",
    ],
    { stdio: ["ignore", "ignore", "pipe", "ipc"] },
  );
  let stderr = "";
  fixture.stderr?.on("data", (chunk) => (stderr += chunk));
  await new Promise((resolve, reject) => {
    fixture.once("message", resolve);
    fixture.once("exit", () =>
      reject(new Error("Renewal fixture failed: " + stderr)),
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
async function open(page: Page, search = "") {
  await page.goto(
    `/tools/subscriptions?entity=${entity}&search=${encodeURIComponent(search)}`,
  );
  await expect(
    page.getByRole("button", { name: "Add subscription", exact: true }),
  ).toBeEnabled();
}
async function fill(page: Page, name: string) {
  await page
    .getByRole("button", { name: "Add subscription", exact: true })
    .click();
  await page
    .getByLabel("Supplier name", { exact: true })
    .fill("Example supplier");
  await page.getByLabel("Subscription name", { exact: true }).fill(name);
  await page.getByLabel("Renewal date", { exact: true }).fill("2030-01-01");
  await page
    .getByLabel("Cancellation deadline (optional)", { exact: true })
    .fill("2029-12-25");
  await page
    .getByLabel("Notes (optional)", { exact: true })
    .fill("Manually reviewed");
}
const row = (page: Page, name: string) =>
  page
    .getByRole("row")
    .filter({
      has: page.getByRole("button", { name: `Edit ${name}`, exact: true }),
    });
test("subscription add/edit/archive/unarchive, refresh/restart and mobile keyboard", async ({
  page,
}) => {
  const name = "Browser renewal journey";
  await open(page, name);
  await expect(
    page.getByText("No subscriptions found", { exact: true }),
  ).toBeVisible();
  await fill(page, name);
  await page
    .getByRole("button", { name: "Save subscription", exact: true })
    .click();
  await expect(row(page, name)).toBeVisible();
  await page.reload();
  await expect(row(page, name)).toBeVisible();
  const restarted = new Promise((resolve) => fixture.once("message", resolve));
  fixture.send("restart");
  await restarted;
  await page.reload();
  await expect(row(page, name)).toBeVisible();
  await page.getByRole("button", { name: `Edit ${name}`, exact: true }).click();
  await page
    .getByLabel("Notes (optional)", { exact: true })
    .fill("Edited note");
  await page
    .getByRole("button", { name: "Save subscription", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: `Archive ${name}`, exact: true })
    .click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(row(page, name)).toBeVisible();
  await page
    .getByRole("button", { name: `Archive ${name}`, exact: true })
    .click();
  await page.getByRole("button", { name: "Archive", exact: true }).click();
  await expect(row(page, name)).toHaveCount(0);
  await page
    .getByLabel("Subscription status", { exact: true })
    .selectOption("archived");
  await expect(row(page, name)).toBeVisible();
  await page
    .getByRole("button", { name: `Unarchive ${name}`, exact: true })
    .click();
  await page.getByRole("button", { name: "Unarchive", exact: true }).click();
  await expect(row(page, name)).toHaveCount(0);
  await page
    .getByLabel("Subscription status", { exact: true })
    .selectOption("active");
  await expect(row(page, name)).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: `Edit ${name}`, exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByLabel("Notes (optional)", { exact: true }),
  ).toHaveValue("Edited note");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
test("failed save, validation and conflict never claim success", async ({
  page,
}) => {
  await open(page, "Failed renewal");
  await fill(page, "Failed renewal");
  await page
    .getByLabel("Notes (optional)", { exact: true })
    .fill("x".repeat(2001));
  await page
    .getByRole("button", { name: "Save subscription", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "2,000",
  );
  await page.getByLabel("Notes (optional)", { exact: true }).fill("");
  await page.route("**/subscription-renewals", (route) =>
    route.request().method() === "POST"
      ? route.abort("failed")
      : route.continue(),
  );
  await page
    .getByRole("button", { name: "Save subscription", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "No success was confirmed",
  );
  await expect(
    page.getByText("Subscription saved", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.unroute("**/subscription-renewals");
  await page
    .getByRole("button", { name: "Save subscription", exact: true })
    .click();
  await expect(row(page, "Failed renewal")).toBeVisible();
  await page
    .getByRole("button", { name: "Edit Failed renewal", exact: true })
    .click();
  const list = await (
    await fetch(`${api}/subscription-renewals?entityId=${entity}&search=Failed`)
  ).json();
  await fetch(`${api}/subscription-renewals/${list.items[0].id}/archive`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      archived: false,
      expectedVersion: list.items[0].version,
    }),
  });
  await page
    .getByRole("button", { name: "Save subscription", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Record changed",
  );
  await expect(
    page.getByRole("button", { name: "Save subscription", exact: true }),
  ).toBeDisabled();
});
test("search, status filters, server indicators, pagination and entity isolation", async ({
  page,
}) => {
  const health = await (
      await fetch(`${api}/subscription-renewals?entityId=${entity}`)
    ).json(),
    today = health.today;
  for (let i = 0; i < 21; i++) {
    const response = await fetch(`${api}/subscription-renewals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: crypto.randomUUID(),
        entityId: entity,
        supplierName: "Pagination supplier",
        subscriptionName: `Pagination ${i}`,
        renewalDate: today,
        cancellationDeadline: today,
      }),
    });
    expect(response.status).toBe(201);
  }
  await open(page, "Pagination");
  await expect(page.getByText("1–20 of 21", { exact: true })).toBeVisible();
  await expect(page.getByText("Renewing soon.", { exact: true })).toHaveCount(
    20,
  );
  await expect(
    page.getByText("Cancellation deadline approaching.", { exact: true }),
  ).toHaveCount(20);
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(page.getByText("21–21 of 21", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Previous page", exact: true })
    .click();
  await expect(page.getByText("1–20 of 21", { exact: true })).toBeVisible();
  await page
    .getByLabel("Search subscriptions", { exact: true })
    .fill("Pagination 20");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(row(page, "Pagination 20")).toBeVisible();
  await expect(page.getByText("1–1 of 1", { exact: true })).toBeVisible();
  await page
    .getByLabel("Subscription entity", { exact: true })
    .selectOption("22222222-2222-4222-8222-222222222223");
  await expect(
    page.getByText("No subscriptions found", { exact: true }),
  ).toBeVisible();
});
test("a delayed earlier entity response cannot replace the selected entity", async ({
  page,
}) => {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/subscription-renewals?**", async (route) => {
    const url = new URL(route.request().url());
    const response = await route.fetch();
    if (url.searchParams.get("entityId") === entity) await gate;
    await route.fulfill({ response });
  });
  await page.goto(`/tools/subscriptions?entity=${entity}`);
  await expect(
    page.getByLabel("Subscription entity", { exact: true }),
  ).toBeEnabled();
  await page
    .getByLabel("Subscription entity", { exact: true })
    .selectOption("22222222-2222-4222-8222-222222222223");
  await expect(
    page.getByText("No subscriptions found", { exact: true }),
  ).toBeVisible();
  release();
  await expect(
    page.getByText("No subscriptions found", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Edit Pagination 20", exact: true }),
  ).toHaveCount(0);
});
