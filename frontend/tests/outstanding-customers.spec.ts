import { test, expect } from "@playwright/test";
import { seed } from "../src/demo/seed";
import type { DemoState, Invoice } from "../src/types/domain";
import { outstandingCustomers } from "../src/features/receivables/outstandingCustomers";

function invoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: "synthetic-invoice",
    entity: "us",
    customer: "cus-1",
    date: "2026-09-01",
    due: "2026-09-30",
    description: "Synthetic test invoice",
    amount: 10000,
    paid: 2500,
    status: "Partial",
    department: "Operations",
    ...overrides,
  };
}
function summary(state: DemoState) {
  const result = outstandingCustomers(state);
  expect(result.available).toBe(true);
  if (!result.available) throw new Error("Expected a valid summary");
  return result;
}
function freeze(value: unknown) {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
}

test.describe("outstanding calculation", () => {
  for (const [entity, period, totalCents, invoiceCount, customerCount] of [
    ["us", "all", 14217000, 30, 14],
    ["us", "2026-09", 2700500, 5, 5],
    ["uk", "all", 2909550, 6, 6],
    ["uk", "2026-09", 526300, 1, 1],
  ] as const) {
    test(`unchanged seed ${entity}/${period}`, () => {
      const result = summary({ ...seed(), entity, period });
      expect(result).toMatchObject({ totalCents, invoiceCount, customerCount });
      if (entity === "us" && period === "all") {
        expect(result.rows).toEqual(
          [
            ["cus-10", "Evergreen Energy", 3, 1907350],
            ["cus-9", "Pioneer Mobility", 3, 1824600],
            ["cus-6", "Atlas Learning", 4, 1488100],
            ["cus-11", "Canvas Media", 2, 1263900],
            ["cus-7", "Harbor Robotics", 3, 1148800],
          ].map(([customerId, customerName, count, cents]) => ({
            customerId,
            customerName,
            customerAvailable: true,
            invoiceCount: count,
            remainingCents: cents,
          })),
        );
      }
    });
  }

  test("scope, exact Outstanding predicate, partial balances and valid zero scope", () => {
    const state = {
      ...seed(),
      period: "2026-09",
      invoices: [
        invoice(),
        invoice({ id: "partial", amount: 6000, paid: 1000 }),
        invoice({ id: "draft", status: "Draft" }),
        invoice({ id: "paid", paid: 10000, status: "Paid" }),
        // Status alone does not replace the existing predicate.
        invoice({ id: "paid-label", status: "Paid", amount: 100, paid: 0 }),
        invoice({ id: "other-entity", entity: "uk", amount: 999999 }),
        invoice({ id: "other-period", date: "2026-08-01", amount: 999999 }),
      ],
    };
    expect(summary(state)).toMatchObject({
      totalCents: 12600,
      invoiceCount: 3,
      customerCount: 1,
      rows: [{ customerId: "cus-1", invoiceCount: 3, remainingCents: 12600 }],
    });
    expect(summary({ ...state, period: "2026-07" })).toEqual({
      available: true,
      totalCents: 0,
      invoiceCount: 0,
      customerCount: 0,
      rows: [],
    });
    expect(
      summary({
        ...state,
        invoices: [invoice({ status: "Draft" }), invoice({ paid: 10000 })],
      }).totalCents,
    ).toBe(0);
    expect(summary({ ...state, period: "all" }).invoiceCount).toBe(4);
  });

  test("groups by ID, deterministic ID ties and totals include customers outside top five", () => {
    const state = seed();
    state.customers = state.customers.map((c) => ({
      ...c,
      name: "Identical name",
    }));
    state.invoices = [
      "cus-7",
      "cus-2",
      "cus-10",
      "cus-1",
      "cus-4",
      "cus-3",
      "cus-5",
    ].map((customer, i) =>
      invoice({ id: `test-${i}`, customer, amount: 10000, paid: 0 }),
    );
    const result = summary(state);
    expect(result).toMatchObject({
      totalCents: 70000,
      invoiceCount: 7,
      customerCount: 7,
    });
    expect(result.rows.map((r) => r.customerId)).toEqual([
      "cus-1",
      "cus-10",
      "cus-2",
      "cus-3",
      "cus-4",
    ]);
    expect(result.rows.every((r) => r.customerName === "Identical name")).toBe(
      true,
    );
  });

  test("missing/foreign customer references preserve totals without disclosing names", () => {
    const state = seed();
    state.customers.unshift({
      ...state.customers[0],
      id: "cus-1",
      entity: "uk",
      name: "Foreign secret",
    });
    state.invoices = [
      invoice(),
      invoice({ customer: "missing" }),
      invoice({ customer: "cus-21" }),
    ];
    const result = summary(state);
    expect(result).toMatchObject({
      totalCents: 22500,
      invoiceCount: 3,
      customerCount: 3,
    });
    expect(result.rows.find((r) => r.customerId === "cus-1")).toMatchObject({
      customerName: "Acorn Labs",
      customerAvailable: true,
    });
    for (const id of ["missing", "cus-21"])
      expect(result.rows.find((r) => r.customerId === id)).toMatchObject({
        customerName: "Customer unavailable",
        customerAvailable: false,
        remainingCents: 7500,
      });
    expect(JSON.stringify(result)).not.toContain("Prism Data");
    expect(JSON.stringify(result)).not.toContain("Foreign secret");
  });

  test("unavailable entity/currency, invalid scoped money and overflow never become zero", () => {
    const state = seed();
    expect(outstandingCustomers({ ...state, entity: "missing" })).toEqual({
      available: false,
    });
    expect(
      outstandingCustomers({
        ...state,
        entities: state.entities.map((e) => ({
          ...e,
          currency: "EUR" as "USD",
        })),
      }),
    ).toEqual({ available: false });
    for (const overrides of [
      { amount: -1 },
      { amount: 0.5 },
      { amount: NaN },
      { amount: Infinity },
      { amount: Number.MAX_SAFE_INTEGER + 1 },
      { paid: -1 },
      { paid: 0.1 },
      { paid: NaN },
      { paid: Infinity },
      { paid: Number.MAX_SAFE_INTEGER + 1 },
      { paid: 10001 },
      { status: "Draft" as const, paid: 10001 },
    ])
      expect(
        outstandingCustomers({ ...state, invoices: [invoice(overrides)] }),
      ).toEqual({ available: false });
    for (const customer of ["cus-1", "cus-2"])
      expect(
        outstandingCustomers({
          ...state,
          invoices: [
            invoice({ amount: Number.MAX_SAFE_INTEGER, paid: 0 }),
            invoice({ customer, amount: 1, paid: 0 }),
          ],
        }),
      ).toEqual({ available: false });
    expect(
      summary({
        ...state,
        invoices: [invoice({ amount: Number.MAX_SAFE_INTEGER, paid: 0 })],
      }).totalCents,
    ).toBe(Number.MAX_SAFE_INTEGER);
    expect(
      summary({
        ...state,
        invoices: [invoice({ entity: "uk", amount: NaN }), invoice()],
      }).totalCents,
    ).toBe(7500);
    expect(
      summary({
        ...state,
        period: "2026-09",
        invoices: [invoice({ date: "2026-08-01", paid: -1 }), invoice()],
      }).totalCents,
    ).toBe(7500);
  });

  test("does not mutate frozen state or source arrays, including source sort order", () => {
    const state = seed(),
      before = structuredClone(state);
    freeze(state);
    const first = summary(state);
    expect(summary(state)).toEqual(first);
    expect(state).toEqual(before);
  });
});

// Browser fixtures are isolated copies; the shared seed/store/receipt code stays unchanged.
async function openState(
  page: import("@playwright/test").Page,
  state = seed(),
) {
  await page.goto("/welcome");
  await page.evaluate(
    (value) => localStorage.setItem("finai-demo-v1", JSON.stringify(value)),
    state,
  );
  await page.goto("/overview?q=unrelated-table-search");
  await expect(card(page)).toBeVisible();
}
const card = (page: import("@playwright/test").Page) =>
  page.getByRole("region", { name: "Outstanding by customer", exact: true });
const stored = (page: import("@playwright/test").Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("finai-demo-v1")!));
async function expectTotals(
  page: import("@playwright/test").Page,
  amount: string,
  count: number,
  customers: number,
) {
  await expect(card(page).locator("dd")).toHaveText([
    amount,
    String(count),
    String(customers),
  ]);
}

test("Overview card follows the snapshot, shows full totals and top five, and scopes through existing selectors/links", async ({
  page,
}) => {
  await openState(page);
  await expectTotals(page, "$142,170.00", 30, 14);
  await expect(card(page).getByRole("row")).toHaveCount(6);
  await expect(card(page).locator("tbody tr td:first-child")).toHaveText([
    "Evergreen Energy",
    "Pioneer Mobility",
    "Atlas Learning",
    "Canvas Media",
    "Harbor Robotics",
  ]);
  await expect(card(page).locator("tbody tr td:nth-child(2)")).toHaveText([
    "3",
    "3",
    "4",
    "2",
    "3",
  ]);
  await expect(card(page).locator("tbody tr td:nth-child(3)")).toHaveText([
    "$19,073.50",
    "$18,246.00",
    "$14,881.00",
    "$12,639.00",
    "$11,488.00",
  ]);
  expect(
    await card(page).evaluate((el) => ({
      afterSnapshot:
        el.previousElementSibling?.classList.contains("finance-snapshot"),
      beforeActivity: el.nextElementSibling?.querySelector("h2")?.textContent,
    })),
  ).toEqual({ afterSnapshot: true, beforeActivity: "Recent activity" });
  await expect(card(page)).toContainText(
    "Current balances for invoices issued in the selected period · USD · Demo",
  );
  await expect(card(page)).toContainText(
    "may differ from the ledger-based receivables KPI",
  );
  await page
    .getByLabel("Accounting period", { exact: true })
    .selectOption("2026-09");
  await expectTotals(page, "$27,005.00", 5, 5);
  await page.getByLabel("Entity", { exact: true }).selectOption("uk");
  await expectTotals(page, "$5,263.00", 1, 1);
  const customer = card(page).getByRole("link", {
    name: "Prism Data",
    exact: true,
  });
  await expect(customer).toHaveAttribute(
    "href",
    "/receivables/customers/cus-21",
  );
  await customer.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Prism Data", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Entity", { exact: true })).toHaveValue("uk");
  await expect(
    page.getByLabel("Accounting period", { exact: true }),
  ).toHaveValue("2026-09");
  await page.getByRole("link", { name: "Overview", exact: true }).click();
  const invoicesLink = card(page).getByRole("link", {
    name: "View outstanding invoices",
    exact: true,
  });
  await expect(invoicesLink).toHaveAttribute(
    "href",
    "/receivables/invoices?status=Outstanding",
  );
  await invoicesLink.click();
  expect(new URL(page.url()).search).toBe("?status=Outstanding");
  await expect(
    page.getByRole("heading", { name: "Invoices", exact: true }),
  ).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody")).toContainText("Prism Data");
  await page.getByRole("link", { name: "Overview", exact: true }).click();
  await page
    .getByLabel("Accounting period", { exact: true })
    .selectOption("all");
  await expectTotals(page, "$29,095.50", 6, 6);
  await expect(card(page).locator("tbody tr")).toHaveCount(5);
  await page.getByLabel("Entity", { exact: true }).selectOption("us");
  await expectTotals(page, "$142,170.00", 30, 14);
});

test("existing demo receipt workflow reduces the card balance without a new financial action", async ({
  page,
}) => {
  const state = seed();
  state.period = "2026-09";
  state.locked = [];
  state.invoices = [
    invoice({ id: "INV-OUTSTANDING-TEST", amount: 100000, paid: 25000 }),
  ];
  await openState(page, state);
  await expectTotals(page, "$750.00", 1, 1);
  const before = await stored(page);
  await page.goto("/receivables/invoices/INV-OUTSTANDING-TEST");
  await page
    .getByRole("button", { name: "Apply demo receipt", exact: true })
    .click();
  await page.getByLabel("Receipt amount (USD)").fill("250.00");
  await page
    .getByRole("button", { name: "Record demo receipt", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("link", { name: "Overview", exact: true }).click();
  await expectTotals(page, "$500.00", 1, 1);
  const after = await stored(page);
  expect(after.invoices[0].paid).toBe(50000);
  expect(after.journals).toHaveLength(before.journals.length + 1);
  expect(after.audit).toHaveLength(before.audit.length + 1);
  expect(after.entity).toBe("us");
  expect(after.period).toBe("2026-09");
});

test("read-only reviewer can view/re-render the card with no requests or changes to financial data or stored scope", async ({
  page,
}) => {
  const requests: string[] = [],
    errors: string[] = [];
  page.on("request", (req) => {
    if (["fetch", "xhr"].includes(req.resourceType())) requests.push(req.url());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  const state = seed();
  state.role = "Reviewer";
  await openState(page, state);
  const before = await stored(page);
  await expectTotals(page, "$142,170.00", 30, 14);
  await expect(card(page).locator("button,input,select,textarea")).toHaveCount(
    0,
  );
  await page.reload();
  await expectTotals(page, "$142,170.00", 30, 14);
  await page.getByRole("link", { name: "View all", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Audit log", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Overview", exact: true }).click();
  await expectTotals(page, "$142,170.00", 30, 14);
  // Existing hydration may persist an equivalent state; rendering must not change its contents.
  expect(await stored(page)).toEqual(before);
  expect(before.role).toBe("Reviewer");
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
});

test("missing/foreign customers and long plain-text names remain safe and keyboard/mobile accessible", async ({
  page,
}) => {
  const state = seed(),
    errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const longName =
    "<img src=x onerror=alert(1)> " + "LongCustomerName".repeat(30);
  state.customers[0].name = longName;
  state.invoices = [
    invoice({ customer: "missing", amount: 100000, paid: 0 }),
    invoice({ customer: "cus-21", amount: 90000, paid: 0 }),
    invoice({ amount: 80000, paid: 0 }),
  ];
  await openState(page, state);
  await expectTotals(page, "$2,700.00", 3, 3);
  await expect(
    card(page).getByText("Customer unavailable", { exact: true }),
  ).toHaveCount(2);
  await expect(card(page)).not.toContainText("Prism Data");
  await expect(card(page).locator("tbody a")).toHaveCount(1);
  await expect(card(page).locator("img")).toHaveCount(0);
  const link = card(page).getByRole("link", { name: longName, exact: true });
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(link).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await link.focus();
    await expect(link).toBeFocused();
    expect(
      await link.evaluate((el) => getComputedStyle(el).outlineStyle),
    ).not.toBe("none");
  }
  await page.screenshot({
    path: "artifacts/outstanding-customers/after-long-name-320.png",
    fullPage: true,
  });
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: longName, exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("valid empty selection shows zero totals and no invented customer rows", async ({
  page,
}) => {
  const state = seed();
  state.invoices = [invoice({ status: "Draft" }), invoice({ paid: 10000 })];
  await openState(page, state);
  await expectTotals(page, "$0.00", 0, 0);
  await expect(card(page)).toContainText(
    "No outstanding invoices in this selection.",
  );
  await expect(card(page).getByRole("table")).toHaveCount(0);
  await expect(card(page).getByRole("link")).toHaveCount(1);
});

test("unsafe aggregate and missing entity show unavailable without numbers or misleading links", async ({
  page,
}) => {
  const state = seed(),
    errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  state.invoices = [
    invoice({ amount: Number.MAX_SAFE_INTEGER, paid: 0 }),
    invoice({ amount: 1, paid: 0 }),
  ];
  await openState(page, state);
  for (const missingEntity of [false, true]) {
    if (missingEntity)
      await page.evaluate(async () => {
        const path = "/src/store/index.ts";
        const { store, command } = await import(path);
        store.dispatch(command({ kind: "scope", entity: "missing" }));
      });
    await expect(card(page)).toContainText(
      "Outstanding balances are unavailable for this selection.",
    );
    await expect(card(page).locator("dl,table,a")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Recent activity", exact: true }),
    ).toBeVisible();
  }
  expect(errors).toEqual([]);
});
