import { test, expect, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
let fixture: ChildProcess;
const result = (page: Page) =>
  page.getByRole("region", { name: "Payment due-date result", exact: true });
// Reuse the existing synthetic entity fixture. It seeds only its unique test schema.
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
      reject(new Error("Calculator fixture failed: " + stderr)),
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
  await page.goto("/tools/payment-due-date");
  await expect(page.getByLabel("Company", { exact: true })).toBeEnabled();
}
async function dates(page: Page) {
  await page.getByLabel("Invoice date", { exact: true }).fill("2026-10-01");
  await page.getByLabel("As-of date", { exact: true }).fill("2026-11-02");
}
const calculate = (page: Page) =>
  page.getByRole("button", { name: "Calculate", exact: true });
test("real API calendar calculation, local as-of default, presets/custom, reset and untouched demo storage", async ({
  page,
}) => {
  await open(page);
  const localToday = await page.evaluate(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  await expect(page.getByLabel("As-of date", { exact: true })).toHaveValue(
    localToday,
  );
  await expect(page.getByLabel("Payment terms", { exact: true })).toHaveValue(
    "30",
  );
  const stored = await page.evaluate(() =>
    localStorage.getItem("finai-demo-v1"),
  );
  let submitted: Record<string, unknown> | undefined;
  page.on("request", (req) => {
    if (req.url().endsWith("/payment-due-date-checks"))
      submitted = req.postDataJSON();
  });
  await dates(page);
  await calculate(page).click();
  await expect(result(page)).toContainText("2026-10-31");
  await expect(result(page)).toContainText("2 days overdue");
  await expect(result(page)).toContainText("2026-11-02");
  await expect(result(page)).toContainText(
    "Based on the dates entered; payment status is not checked.",
  );
  expect(submitted).toMatchObject({
    invoiceDate: "2026-10-01",
    termsDays: 30,
    asOfDate: "2026-11-02",
  });
  await page.getByLabel("Payment terms", { exact: true }).selectOption("0");
  await expect(result(page)).toHaveCount(0);
  await page.getByLabel("As-of date", { exact: true }).fill("2026-10-01");
  await calculate(page).click();
  await expect(result(page)).toContainText("Due today");
  await expect(result(page)).toContainText("Calendar day count0");
  await page
    .getByLabel("Payment terms", { exact: true })
    .selectOption("custom");
  await page.getByLabel("Custom payment days", { exact: true }).fill("365");
  await page.getByLabel("Invoice date", { exact: true }).fill("2028-01-01");
  await page.getByLabel("As-of date", { exact: true }).fill("2028-01-01");
  await calculate(page).click();
  await expect(result(page)).toContainText("2028-12-31");
  await expect(result(page)).toContainText("Due in 365 days");
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(result(page)).toHaveCount(0);
  await expect(page.getByLabel("Invoice date", { exact: true })).toHaveValue(
    "",
  );
  await expect(page.getByLabel("Payment terms", { exact: true })).toHaveValue(
    "30",
  );
  await expect(page.getByLabel("As-of date", { exact: true })).toHaveValue(
    localToday,
  );
  expect(await page.evaluate(() => localStorage.getItem("finai-demo-v1"))).toBe(
    stored,
  );
  await page.getByLabel("Invoice date", { exact: true }).fill("2026-10-01");
  await page.getByLabel("As-of date", { exact: true }).fill("2026-10-30");
  await calculate(page).click();
  await expect(result(page)).toContainText("Due in 1 day");
  await page.goto("/tools/subscriptions");
  await page.goBack();
  await expect(result(page)).toHaveCount(0);
  await expect(page.getByLabel("Invoice date", { exact: true })).toHaveValue(
    "",
  );
});
test("network failure, retry and server validation never display fixture success", async ({
  page,
}) => {
  await open(page);
  await dates(page);
  await page.route("**/payment-due-date-checks", (route) =>
    route.abort("failed"),
  );
  await calculate(page).click();
  await expect(page.getByRole("alert")).toContainText("Unable to calculate");
  await expect(result(page)).toHaveCount(0);
  await page.unroute("**/payment-due-date-checks");
  await calculate(page).click();
  await expect(result(page)).toContainText("2 days overdue");
  await page.getByLabel("Invoice date", { exact: true }).fill("9999-12-31");
  await expect(result(page)).toHaveCount(0);
  await page.getByLabel("Payment terms", { exact: true }).selectOption("7");
  await calculate(page).click();
  await expect(page.getByRole("alert")).toContainText("9999");
  await expect(result(page)).toHaveCount(0);
});
test("changing every input/company or resetting cancels pending results; repeated submits blocked", async ({
  page,
}) => {
  await open(page);
  await dates(page);
  let calls = 0;
  let release: () => void = () => {};
  let settled: Promise<void> = Promise.resolve();
  await page.route("**/payment-due-date-checks", async (route) => {
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let complete!: () => void;
    settled = new Promise<void>((resolve) => {
      complete = resolve;
    });
    calls++;
    try {
      const response = await route.fetch();
      await gate;
      await route.fulfill({ response });
    } finally {
      complete();
    }
  });
  const changes: [string, string][] = [
    ["Invoice date", "2026-10-02"],
    ["As-of date", "2026-11-03"],
    ["Payment terms", "14"],
    ["Company", "22222222-2222-4222-8222-222222222223"],
  ];
  for (const [label, value] of changes) {
    await calculate(page).click();
    await expect(
      page.getByRole("button", { name: "Calculating…", exact: true }),
    ).toBeDisabled();
    await expect
      .poll(() => calls)
      .toBe(changes.indexOf(changes.find((v) => v[0] === label)!) + 1);
    if (label === "Company" || label === "Payment terms")
      await page.getByLabel(label, { exact: true }).selectOption(value);
    else await page.getByLabel(label, { exact: true }).fill(value);
    release();
    await settled;
    await expect(result(page)).toHaveCount(0);
  }
  await page
    .getByLabel("Payment terms", { exact: true })
    .selectOption("custom");
  await page.getByLabel("Custom payment days", { exact: true }).fill("10");
  await calculate(page).click();
  await expect(
    page.getByRole("button", { name: "Calculating…", exact: true }),
  ).toBeDisabled();
  await expect.poll(() => calls).toBe(5);
  await page.getByLabel("Custom payment days", { exact: true }).fill("11");
  release();
  await settled;
  await expect(result(page)).toHaveCount(0);
  await calculate(page).click();
  await expect(
    page.getByRole("button", { name: "Calculating…", exact: true }),
  ).toBeDisabled();
  await expect.poll(() => calls).toBe(6);
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  release();
  await settled;
  await expect(result(page)).toHaveCount(0);
});
for (const [name, change] of [
  ["invalid date", { dueDate: "2026-02-29" }],
  ["wrong company", { entityId: "22222222-2222-4222-8222-222222222223" }],
  ["wrong input", { termsDays: 7 }],
  ["wrong day count", { daysUntilDue: 2 }],
  ["wrong sign status", { status: "not_due" }],
  ["extra field", { paymentStatus: "paid" }],
] as const)
  test(`reject ${name} in a calculation response`, async ({ page }) => {
    await open(page);
    await dates(page);
    await page.route("**/payment-due-date-checks", async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        json: { ...(await response.json()), ...change },
      });
    });
    await calculate(page).click();
    await expect(page.getByRole("alert")).toContainText(
      "could not be verified",
    );
    await expect(result(page)).toHaveCount(0);
  });
test("empty access, expired/forbidden/server errors, keyboard and 390px layout", async ({
  page,
}) => {
  await page.route("**/api/v1/entities", (route) =>
    route.fulfill({ json: { items: [] } }),
  );
  await page.goto("/tools/payment-due-date");
  await expect(
    page.getByText("No authorized companies are available for this account.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(calculate(page)).toBeDisabled();
  await page.unroute("**/api/v1/entities");
  await open(page);
  await dates(page);
  for (const [status, message] of [
    [401, "session has expired"],
    [403, "permission"],
    [503, "Unable to calculate"],
  ] as const) {
    await page.route("**/payment-due-date-checks", (route) =>
      route.fulfill({
        status,
        json: {
          code: "FORBIDDEN",
          message: "Synthetic failure",
          requestId: crypto.randomUUID(),
        },
      }),
    );
    await calculate(page).click();
    await expect(page.getByRole("alert")).toContainText(message);
    await expect(result(page)).toHaveCount(0);
    await page.unroute("**/payment-due-date-checks");
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await calculate(page).focus();
  await page.keyboard.press("Enter");
  await expect(result(page)).toContainText("2 days overdue");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("a non-200 response cannot confirm a result", async ({ page }) => {
  await open(page);
  await dates(page);
  await page.route("**/payment-due-date-checks", async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, status: 202 });
  });
  await calculate(page).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(result(page)).toHaveCount(0);
});
