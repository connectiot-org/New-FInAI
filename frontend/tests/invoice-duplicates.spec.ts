import { test, expect, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { readFile } from "node:fs/promises";
let fixture: ChildProcess;
const entity = "22222222-2222-4222-8222-222222222222";
const header =
  "supplier_id,supplier_name,invoice_number,invoice_date,amount,currency\n";
const csv =
  header +
  'V001,"=SUM(1,2)",INV-001,2026-10-01,12.5,USD\nV001,Changed name,inv-001,2026-10-02,20,EUR\nV002,Other,INV-001,2026-10-01,4,USD';
test.beforeAll(async () => {
  // Reuse the isolated migrated/seeded local API fixture; no application data is reset.
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
      reject(new Error("Checker fixture failed: " + stderr)),
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
async function open(page: Page) {
  await page.goto(`/tools/invoice-duplicates?entity=${entity}`);
  await expect(
    page.getByLabel("Invoice CSV file", { exact: true }),
  ).toBeVisible();
}
async function upload(page: Page, value = csv, name = "invoices.csv") {
  await page
    .getByLabel("Invoice CSV file", { exact: true })
    .setInputFiles({ name, mimeType: "text/csv", buffer: Buffer.from(value) });
  await expect(
    page.getByRole("button", { name: "Check for duplicates", exact: true }),
  ).toBeEnabled();
}
async function check(page: Page) {
  await page
    .getByRole("button", { name: "Check for duplicates", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Invoice check results" }),
  ).toBeVisible();
}
test("real API upload, mixed-currency review groups, full safe export, clear/refresh and unchanged demo", async ({
  page,
}) => {
  await open(page);
  const before = await page.evaluate(() =>
    localStorage.getItem("finai-demo-v1"),
  );
  await upload(page);
  await check(page);
  const results = page.getByRole("region", { name: "Invoice check results" });
  await expect(results.getByRole("row")).toHaveCount(3);
  await expect(results.getByText("12.50 USD", { exact: true })).toBeVisible();
  await expect(results.getByText("20.00 EUR", { exact: true })).toBeVisible();
  await expect(
    results.getByText("Group 1 · 2 invoices", { exact: true }),
  ).toHaveCount(2);
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download full report", exact: true })
    .click();
  const path = await (await download).path();
  const report = await readFile(path!, "utf8");
  expect(report).toContain('"\'=SUM(1,2)"');
  expect(report).toContain('"V002"');
  expect(report).toContain('"12.50","USD"');
  await page
    .getByLabel("Show possible duplicates only", { exact: true })
    .uncheck();
  await expect(results.getByRole("row")).toHaveCount(4);
  expect(await page.evaluate(() => localStorage.getItem("finai-demo-v1"))).toBe(
    before,
  );
  await page
    .getByRole("button", { name: "Clear file and results", exact: true })
    .click();
  await expect(results).toHaveCount(0);
  await expect(
    page.getByLabel("Invoice CSV file", { exact: true }),
  ).toHaveValue("");
  await upload(page);
  await check(page);
  await page.reload();
  await expect(results).toHaveCount(0);
  await expect(
    page.getByLabel("Invoice CSV file", { exact: true }),
  ).toHaveValue("");
});
test("sample, no matches, bounded pagination and mobile keyboard", async ({
  page,
}) => {
  await open(page);
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download sample CSV", exact: true })
    .click();
  const sample = await readFile((await (await download).path())!, "utf8");
  expect(sample).toContain(header.trim());
  await upload(
    page,
    header +
      Array.from(
        { length: 25 },
        (_, i) => `V${i},Example,INV-01,2026-10-01,1,USD`,
      ).join("\n"),
  );
  await check(page);
  await expect(
    page.getByText(
      "No possible duplicates found in this file using the matching rule.",
      { exact: true },
    ),
  ).toBeVisible();
  await page
    .getByLabel("Show possible duplicates only", { exact: true })
    .uncheck();
  await expect(
    page
      .getByRole("region", { name: "Invoice check results" })
      .getByRole("row"),
  ).toHaveCount(21);
  await page.getByRole("button", { name: "Next results", exact: true }).click();
  await expect(page.getByText("21–25 of 25", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Clear file and results", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("region", { name: "Invoice check results" }),
  ).toHaveCount(0);
});
test("invalid files, network/permission/validation errors and inconsistent responses never show a report", async ({
  page,
}) => {
  await open(page);
  await page.getByLabel("Invoice CSV file", { exact: true }).setInputFiles({
    name: "bad.csv",
    mimeType: "text/csv",
    buffer: Buffer.from([0xff, 0xfe, 0x41]),
  });
  await expect(page.getByRole("alert")).toContainText("UTF-8");
  await page.getByLabel("Invoice CSV file", { exact: true }).setInputFiles({
    name: "big.csv",
    mimeType: "text/csv",
    buffer: Buffer.alloc(131073, 65),
  });
  await expect(page.getByRole("alert")).toContainText("128 KiB");
  await upload(page, header + "invalid");
  await page
    .getByRole("button", { name: "Check for duplicates", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("record 2");
  await upload(page);
  await page.route("**/invoice-duplicate-checks", (route) =>
    route.abort("failed"),
  );
  await page
    .getByRole("button", { name: "Check for duplicates", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "No report was confirmed",
  );
  await expect(
    page.getByRole("region", { name: "Invoice check results" }),
  ).toHaveCount(0);
  await page.unroute("**/invoice-duplicate-checks");
  for (const status of [401, 403, 404, 503]) {
    await page.route("**/invoice-duplicate-checks", (route) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify({ message: "Synthetic unavailable check" }),
      }),
    );
    await page
      .getByRole("button", { name: "Check for duplicates", exact: true })
      .click();
    await expect(page.getByRole("alert")).toContainText(
      "Synthetic unavailable",
    );
    await expect(
      page.getByRole("region", { name: "Invoice check results" }),
    ).toHaveCount(0);
    await page.unroute("**/invoice-duplicate-checks");
  }
  await page.route("**/invoice-duplicate-checks", async (route) => {
    const response = await route.fetch(),
      body = await response.json();
    body.summary.flaggedRowCount = 0;
    await route.fulfill({ response, json: body });
  });
  await page
    .getByRole("button", { name: "Check for duplicates", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("inconsistent records");
  await page.unroute("**/invoice-duplicate-checks");
  await check(page);
});
test("changing company or file discards old results and ignores delayed responses", async ({
  page,
}) => {
  await open(page);
  await upload(page);
  let release!: () => void, started!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve)),
    reached = new Promise<void>((resolve) => (started = resolve));
  await page.route("**/invoice-duplicate-checks", async (route) => {
    const response = await route.fetch();
    started();
    await gate;
    try {
      await route.fulfill({ response });
    } catch {
      /* Request intentionally cancelled by entity change. */
    }
  });
  await page
    .getByRole("button", { name: "Check for duplicates", exact: true })
    .click();
  await reached;
  await page
    .getByLabel("Invoice check company", { exact: true })
    .selectOption("22222222-2222-4222-8222-222222222223");
  release();
  await expect(
    page.getByRole("region", { name: "Invoice check results" }),
  ).toHaveCount(0);
  await expect(
    page.getByLabel("Invoice CSV file", { exact: true }),
  ).toHaveValue("");
  await page.unroute("**/invoice-duplicate-checks");
  await upload(page);
  await check(page);
  await upload(
    page,
    header + "V9,Other,OTHER-01,2026-10-01,1,USD",
    "different.csv",
  );
  await expect(
    page.getByRole("region", { name: "Invoice check results" }),
  ).toHaveCount(0);
  await check(page);
  await expect(
    page.getByText(
      "No possible duplicates found in this file using the matching rule.",
      { exact: true },
    ),
  ).toBeVisible();
});
