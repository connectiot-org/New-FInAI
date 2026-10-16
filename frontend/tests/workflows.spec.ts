import { test, expect, type Page } from "@playwright/test";
const state = async (page: Page) =>
  page.evaluate(() =>
    JSON.parse(localStorage.getItem("finai-demo-v1") || "null"),
  );
async function enter(page: Page) {
  await page.goto("/welcome");
  await page.getByRole("button", { name: "Enter demo workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
}
const routes = [
  "/overview",
  "/accounting/ledger",
  "/accounting/journals",
  "/accounting/accounts",
  "/accounting/trial-balance",
  "/receivables/invoices",
  "/receivables/customers",
  "/revenue/contracts",
  "/revenue/schedules",
  "/payables/bills",
  "/payables/vendors",
  "/banking/accounts",
  "/banking/reconciliation",
  "/close",
  "/reports",
  "/reports/profit-and-loss",
  "/reports/balance-sheet",
  "/reports/cash-flow",
  "/entities",
  "/entities/consolidation",
  "/assistant",
  "/automations",
  "/integrations",
  "/audit-log",
  "/settings/workspace",
  "/settings/members",
  "/settings/approvals",
  "/settings/dimensions",
  "/settings/notifications",
  "/settings/preferences",
  "/accounting/journals/J-INV-1001",
  "/receivables/invoices/INV-1001",
  "/receivables/customers/cus-1",
  "/revenue/contracts/CON-301",
  "/payables/bills/BILL-2041",
  "/payables/vendors/ven-1",
  "/automations/auto-1",
];
test("all route deep links render and refresh without runtime or backend requests", async ({
  page,
}) => {
  const errors: string[] = [],
    remote: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (
      !r.url().startsWith("http://127.0.0.1:5173") &&
      !r.url().startsWith("data:") &&
      !r.url().startsWith("blob:")
    )
      remote.push(r.url());
  });
  for (const route of routes) {
    await page.goto(route);
    await expect(page.locator("main h1")).toBeVisible();
    await expect(page.getByText("Unexpected Application Error")).toHaveCount(0);
  }
  await page.reload();
  await expect(page.locator("main h1")).toHaveText(
    "Review high-value invoices",
  );
  expect(errors).toEqual([]);
  expect(remote).toEqual([]);
});
test("journal imbalance, save, review, post, persistence, linked reversal and audit", async ({
  page,
}) => {
  await enter(page);
  await page.goto("/accounting/journals");
  await page
    .getByRole("button", { name: "New journal entry", exact: true })
    .click();
  await page
    .getByLabel("Description", { exact: true })
    .fill("Test consulting revenue");
  await page.getByLabel("Line 1 debit").fill("123.45");
  await expect(page.getByText(/Journal is not balanced/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save draft", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Line 2 credit").fill("123.45");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page).toHaveURL(/\/accounting\/journals\/JE-/);
  const id = new URL(page.url()).pathname.split("/").at(-1)!;
  let s = await state(page);
  const initial = s.journals.filter(
    (j: { status: string }) => j.status === "Posted",
  ).length;
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(
    page.getByRole("button", { name: "Approve journal" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Approve journal" }).click();
  await page.getByRole("button", { name: "Post journal", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Reverse entry" }),
  ).toBeVisible();
  s = await state(page);
  expect(
    s.journals.filter((j: { status: string }) => j.status === "Posted"),
  ).toHaveLength(initial + 1);
  expect(s.journals.find((j: { id: string }) => j.id === id).status).toBe(
    "Posted",
  );
  await page.goto("/accounting/ledger?q=" + id);
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await page.goto("/accounting/journals/" + id);
  await page.getByRole("button", { name: "Reverse entry" }).click();
  await page
    .getByRole("button", { name: "Reverse locally", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: `REV-${id}`, exact: true }),
  ).toBeVisible();
  s = await state(page);
  expect(
    s.journals.find((j: { reversalOf: string }) => j.reversalOf === id),
  ).toBeTruthy();
  expect(
    s.audit.filter((a: { object: string }) => a.object === id),
  ).toHaveLength(5);
  await page.goto("/reports/balance-sheet");
  await expect(page.getByText(/Control difference: \$0.00/)).toBeVisible();
});
test("invoice draft issue and partial/full demo receipt reconcile", async ({
  page,
}) => {
  await enter(page);
  await page.goto("/receivables/invoices");
  await page.getByRole("button", { name: "New invoice", exact: true }).click();
  await page.getByLabel("Rate (USD)").fill("1750.00");
  await page.getByRole("button", { name: "Save draft invoice" }).click();
  await expect(page).toHaveURL(/\/receivables\/invoices\/INV-/);
  const id = new URL(page.url()).pathname.split("/").at(-1)!;
  await page.getByRole("button", { name: "Issue locally" }).click();
  await page.getByRole("button", { name: "Apply demo receipt" }).click();
  await page.getByLabel("Receipt amount (USD)").fill("750.00");
  await page
    .getByRole("button", { name: "Record demo receipt", exact: true })
    .click();
  await expect(page.locator(".page-actions .badge")).toHaveText("Partial");
  await page.getByRole("button", { name: "Apply demo receipt" }).click();
  await page
    .getByRole("button", { name: "Record demo receipt", exact: true })
    .click();
  await expect(page.locator(".page-actions .badge")).toHaveText("Paid");
  await page.reload();
  const s = await state(page),
    i = s.invoices.find((i: { id: string }) => i.id === id);
  expect(i.amount).toBe(175000);
  expect(i.paid).toBe(175000);
  expect(
    s.journals.filter((j: { source: string }) => j.source === id),
  ).toHaveLength(3);
});
test("bill coding, submission, reviewer approval and activity", async ({
  page,
}) => {
  await enter(page);
  await page.goto("/payables/bills/BILL-2041");
  await page.getByLabel("Expense account").selectOption("6130");
  await page.getByRole("button", { name: "Submit bill", exact: true }).click();
  await page.getByRole("button", { name: "Profile and demo role" }).click();
  await page.getByRole("menuitem", { name: "Reviewer", exact: true }).click();
  await page.getByRole("button", { name: "Approve bill", exact: true }).click();
  await expect(page.locator(".page-actions .badge")).toHaveText("Approved");
  const s = await state(page);
  expect(
    s.bills.find((b: { id: string }) => b.id === "BILL-2041").account,
  ).toBe("6130");
  expect(
    s.journals.find((j: { id: string }) => j.id === "J-BILL-2041").lines[0]
      .account,
  ).toBe("6130");
  await page.getByRole("link", { name: "Inspect full activity" }).click();
  await expect(
    page.getByRole("button", { name: "Bill approved", exact: true }),
  ).toBeVisible();
});
test("bank suggestion match and unmatch persist", async ({ page }) => {
  await enter(page);
  await page.goto("/banking/reconciliation");
  await page.getByRole("tab", { name: "Unmatched", exact: true }).click();
  await page.locator("tbody .row-link").first().click();
  await expect(page.getByText("Match difference")).toBeVisible();
  await page.getByRole("button", { name: "Confirm match" }).click();
  await expect(
    page.getByRole("button", { name: "Unmatch transaction" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Unmatch transaction" }).click();
  await expect(
    page.getByRole("button", { name: "Confirm match" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.reload();
  expect(
    (await state(page)).bank.some((b: { matched: boolean }) => !b.matched),
  ).toBe(true);
});
test("close evidence complete request review approve updates progress", async ({
  page,
}) => {
  await enter(page);
  await page.goto("/close");
  await page
    .getByRole("button", { name: /Approve accrual journal entries/ })
    .click();
  await page
    .getByLabel("Evidence note")
    .fill("Local account review completed; no exceptions.");
  await page
    .getByRole("button", { name: "Complete task", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Request review", exact: true })
    .click();
  await page.getByRole("button", { name: "Approve task", exact: true }).click();
  await expect(page.getByText("This task is approved.")).toBeVisible();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await expect(page.locator(".close-summary strong").first()).toContainText(
    "3",
  );
  await page.reload();
  expect(
    (await state(page)).tasks.filter(
      (t: { id: string; status: string }) =>
        t.id.includes("us-2026-09") && t.status === "Approved",
    ),
  ).toHaveLength(3);
});
test("reports period/entity controls, drill-through and real CSV download", async ({
  page,
}) => {
  await enter(page);
  await page.goto("/reports/profit-and-loss");
  const first = await page.getByTestId("report-total").innerText();
  await page.getByLabel("Accounting period").selectOption("2026-09");
  expect(await page.getByTestId("report-total").innerText()).not.toBe(first);
  const september = await page.getByTestId("report-total").innerText();
  await page.getByLabel("Entity", { exact: true }).selectOption("uk");
  expect(await page.getByTestId("report-total").innerText()).not.toBe(
    september,
  );
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("profit-and-loss.csv");
  await page
    .getByRole("link", { name: "4000 · Subscription revenue", exact: true })
    .click();
  await expect(page.getByLabel("Filter account")).toHaveValue("4000");
  await page.locator("tbody .row-link").first().click();
  await expect(page.locator("main h1")).toContainText("J-INV");
});
test("deterministic assistant evidence and explicitly approved proposal", async ({
  page,
}) => {
  await enter(page);
  await page.goto("/assistant");
  await page.getByRole("button", { name: "What is our cash balance?" }).click();
  await expect(page.getByRole("link", { name: "Cash ledger" })).toBeVisible();
  await page
    .getByRole("button", { name: "Prepare a close task for review" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Proposed demo action" }),
  ).toBeVisible();
  const before = (await state(page)).tasks.filter(
    (t: { status: string }) => t.status === "Complete",
  ).length;
  await page.getByRole("button", { name: "Approve demo action" }).click();
  expect(
    (await state(page)).tasks.filter(
      (t: { status: string }) => t.status === "Complete",
    ),
  ).toHaveLength(before + 1);
  await page
    .getByLabel("Ask FinAI", { exact: true })
    .fill("Predict the stock market");
  await page.getByRole("button", { name: "Send question" }).click();
  await expect(page.getByText(/This demo supports cash/)).toBeVisible();
});
test("automation preview run and integration simulation", async ({ page }) => {
  await enter(page);
  await page.goto("/automations/auto-1");
  await page.getByLabel("Amount at least (USD)").fill("1000.00");
  await page
    .getByRole("button", { name: "Save automation", exact: true })
    .click();
  await page.getByRole("button", { name: "Preview demo results" }).click();
  await expect(page.getByText(/matching records · Action:/)).toBeVisible();
  await page.getByRole("button", { name: "Run locally", exact: true }).click();
  expect((await state(page)).automations[0].runs).toHaveLength(1);
  await page.goto("/integrations");
  await page
    .locator(".integration-card")
    .filter({
      has: page.getByRole("heading", { name: "Stripe (demo)", exact: true }),
    })
    .getByRole("button")
    .click();
  await page
    .getByRole("checkbox", { name: "I understand this is a simulation" })
    .check();
  await page.getByRole("button", { name: "Continue simulation" }).click();
  await page.getByRole("button", { name: "Finish demo connection" }).click();
  expect((await state(page)).integrations).toContain("Stripe (demo)");
});
test("roles disable mutations and reset restores consistent seed", async ({
  page,
}) => {
  await enter(page);
  await page.goto("/settings/members");
  await page.getByRole("button", { name: "Use Reviewer" }).click();
  await page.goto("/accounting/journals");
  await expect(
    page.getByRole("button", { name: "New journal entry", exact: true }),
  ).toHaveCount(0);
  await page.goto("/settings/preferences");
  await page.getByRole("button", { name: "Reset demo", exact: true }).click();
  await page.getByRole("button", { name: "Reset everything locally" }).click();
  const s = await state(page);
  expect(s.role).toBe("Admin");
  expect(s.invoices).toHaveLength(72);
  expect(s.audit).toHaveLength(1);
  expect(s.accounts.length).toBeGreaterThanOrEqual(40);
  expect(
    s.journals.flatMap((j: { lines: unknown[] }) => j.lines).length,
  ).toBeGreaterThanOrEqual(150);
  expect(
    s.journals.every(
      (j: { lines: { debit: number; credit: number }[] }) =>
        j.lines.reduce((v, l) => v + l.debit - l.credit, 0) === 0,
    ),
  ).toBe(true);
});
test("invalid durable state falls back safely and error retry is functional", async ({
  page,
}) => {
  await page.goto("/welcome");
  await page.evaluate(() =>
    localStorage.setItem(
      "finai-demo-v1",
      JSON.stringify({ version: 1, journals: "bad" }),
    ),
  );
  await page.goto("/overview");
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/Invalid or older saved data/).first(),
  ).toBeVisible();
  await page.goto("/accounting/ledger?demoState=error");
  await expect(
    page.getByRole("heading", { name: "Simulated loading error" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Retry locally" }).click();
  await expect(
    page.getByRole("heading", { name: "General ledger", exact: true }),
  ).toBeVisible();
});
for (const width of [1440, 1280, 1024, 390])
  test(`responsive containment and screenshot at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await enter(page);
    await expect(page.locator(".metrics-grid")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/overview-${width}.png`,
      fullPage: true,
    });
    await page.goto("/accounting/ledger");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (width === 390) {
      await page.getByRole("button", { name: "Open navigation" }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Open navigation" }),
      ).toBeFocused();
    }
  });

test("balanced reports across every seeded period and entity", async ({
  page,
}) => {
  await enter(page);
  for (const entity of ["us", "uk"]) {
    for (const period of [
      "all",
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
    ]) {
      await page.goto("/reports/balance-sheet");
      await page.getByLabel("Entity", { exact: true }).selectOption(entity);
      await page.getByLabel("Accounting period").selectOption(period);
      await expect(page.getByText(/Control difference: \$0.00/)).toBeVisible();
      await page.goto("/reports/cash-flow");
      await expect(page.getByText(/Control difference: \$0.00/)).toBeVisible();
    }
  }
});
test("CSV safely escapes formula-like values and account mutations are audited", async ({
  page,
}) => {
  await enter(page);
  await page.goto("/accounting/accounts");
  await page.getByRole("button", { name: "New account", exact: true }).click();
  await page.getByLabel("Account code").fill("6999");
  await page.getByLabel("Account name").fill('=DANGEROUS("a,b")');
  await page.getByRole("button", { name: "Save account", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV", exact: true }).click();
  const download = await downloadEvent;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(chunk);
  const csv = Buffer.concat(chunks).toString("utf8");
  expect(csv).toContain('"\'=DANGEROUS(""a,b"")"');
  const s = await state(page);
  expect(s.audit[0].before).toBe("null");
  expect(JSON.parse(s.audit[0].after).name).toBe('=DANGEROUS("a,b")');
});
test("unsaved dialog and browser-back changes require an explicit choice", async ({
  page,
}) => {
  await enter(page);
  await page
    .getByRole("link", { name: "Journal entries", exact: true })
    .click();
  await page
    .getByRole("button", { name: "New journal entry", exact: true })
    .click();
  await page.getByLabel("Description", { exact: true }).fill("Unsaved journal");
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("heading", { name: "Discard unsaved journal?" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Cancel", exact: true })
    .last()
    .click();
  await expect(
    page.getByRole("heading", { name: "New journal entry", exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "Discard unsaved journal?" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  await expect(page).toHaveURL("/overview");
});
test("local document evidence, period lock and missing routes", async ({
  page,
}) => {
  await enter(page);
  await page.goto("/close");
  await page
    .getByRole("button", { name: /Approve accrual journal entries/ })
    .click();
  await page
    .getByLabel("Attach local PDF or image")
    .setInputFiles("tests/fixtures/close-evidence.pdf");
  await expect(page.getByLabel("Evidence note")).toHaveValue(
    /close-evidence.pdf/,
  );
  await page
    .getByRole("button", { name: "Complete task", exact: true })
    .click();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Lock period", exact: true }).click();
  await page.getByRole("button", { name: "Lock locally", exact: true }).click();
  await page.goto("/payables/bills/BILL-2041");
  await expect(
    page.getByRole("button", { name: "Submit bill", exact: true }),
  ).toHaveCount(0);
  await page.goto("/receivables/invoices/not-a-record");
  await expect(
    page.getByRole("heading", { name: "Invoice not found in this entity" }),
  ).toBeVisible();
  await page.goto("/not-a-route");
  await expect(
    page.getByRole("heading", { name: "Page not found" }),
  ).toBeVisible();
});
