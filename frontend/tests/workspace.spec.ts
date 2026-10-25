import { test, expect, type Page } from "@playwright/test";
const A = "22222222-2222-4222-8222-222222222222",
  B = "22222222-2222-4222-8222-222222222223",
  token = { csrfToken: "a".repeat(64) };
const ready = (entityId = A, period = "all", cents = 75000) => ({
  dataState: "ready",
  entityId,
  period,
  currency: "USD",
  source: {
    snapshotId: "33333333-3333-4333-8333-333333333333",
    version: 1,
    sourceName: "Approved source",
    sourceCapturedAt: "2026-10-23T00:00:00Z",
    importedAt: "2026-10-24T00:00:00Z",
  },
  totalCents: cents,
  invoiceCount: 1,
  customerCount: 1,
  rows: [
    {
      customerId: "external",
      customerName: "Private customer",
      invoiceCount: 1,
      remainingCents: cents,
    },
  ],
});
const card = (p: Page) =>
  p.getByRole("region", { name: "Outstanding by customer", exact: true });
async function routes(p: Page, authenticated = true) {
  await p.route("**/api/v1/workspace/context", (r) =>
    r.fulfill({
      json: {
        userId: A,
        organisationId: A,
        organisationName: "Authorized workspace",
        administrator: false,
        revision: "a".repeat(64),
        entities: [
          { id: A, name: "Authorized A", canWrite: true, canImport: false },
          { id: B, name: "Authorized B", canWrite: true, canImport: false },
        ],
      },
    }),
  );
  await p.route("**/auth/session", (r) =>
    r.fulfill({
      status: authenticated ? 200 : 401,
      json: authenticated ? token : { message: "Expired" },
    }),
  );
  await p.route("**/auth/login", (r) => r.fulfill({ json: token }));
  await p.route("**/auth/logout", (r) =>
    r.fulfill({ json: { status: "signed-out" } }),
  );
  await p.route("**/api/v1/entities", (r) =>
    r.fulfill({
      json: {
        items: [
          { id: A, name: "Authorized A" },
          { id: B, name: "Authorized B" },
        ],
      },
    }),
  );
  await p.route("**/api/v1/receivables/outstanding-customers?*", (r) => {
    const q = new URL(r.request().url()).searchParams;
    return r.fulfill({ json: ready(q.get("entityId")!, q.get("period")!) });
  });
  await p.route("**/api/v1/checklist-tasks?*", (r) =>
    r.fulfill({
      json: { items: [], summary: { total: 0, completed: 0, percent: 0 } },
    }),
  );
  await p.route("**/api/v1/subscription-renewals?*", (r) =>
    r.fulfill({
      json: {
        items: [],
        total: 0,
        offset: 0,
        limit: 20,
        nextOffset: null,
        today: "2026-10-24",
        timezone: "UTC",
      },
    }),
  );
}
async function login(p: Page) {
  await p.getByLabel("Account name").fill("synthetic");
  await p.getByLabel("Organisation ID").fill(A);
  await p.getByLabel("Password", { exact: true }).fill("synthetic-password");
  await p.getByRole("button", { name: "Sign in", exact: true }).click();
}
test("private entry has one gate, no synthetic body/requests before login; public/demo remain accessible", async ({
  page,
}) => {
  await routes(page, false);
  const calls: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/v1/")) calls.push(r.url());
  });
  await page.goto("/workspace");
  await expect(
    page.getByRole("heading", { name: "Sign in to your finance workspace" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toHaveCount(1);
  expect(calls).toEqual([]);
  await expect(page.locator("main")).not.toContainText("Northstar");
  await expect(page.locator(".finance-snapshot")).toHaveCount(0);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Clearer books",
  );
  await page.goto("/welcome");
  await expect(
    page.getByRole("button", { name: "Enter demo workspace" }),
  ).toBeVisible();
});
test("invalid session/login JSON or service failure never authenticates", async ({
  page,
}) => {
  await routes(page);
  let privateCalls = 0;
  page.on("request", (r) => {
    if (r.url().includes("/api/v1/")) privateCalls++;
  });
  await page.route("**/auth/session", (r) =>
    r.fulfill({ body: "<html>Not JSON</html>", contentType: "text/html" }),
  );
  await page.goto("/workspace");
  await expect(page.getByRole("alert")).toBeVisible();
  expect(privateCalls).toBe(0);
  for (const json of [{ ok: true }, { csrfToken: "invalid" }]) {
    await page.route("**/auth/login", (r) => r.fulfill({ json }));
    await login(page);
    await expect(page.getByRole("alert")).toContainText("invalid response");
    expect(privateCalls).toBe(0);
  }
  await page.route("**/auth/session", (r) =>
    r.fulfill({ status: 503, json: { message: "Unavailable" } }),
  );
  await page.getByRole("button", { name: "Check session again" }).click();
  await expect(page.getByRole("alert")).toContainText("unavailable");
  expect(privateCalls).toBe(0);
});
test("one validated session covers all three real modules and unknown private routes stay private", async ({
  page,
}) => {
  await routes(page);
  let checks = 0;
  await page.route("**/auth/session", (r) => {
    checks++;
    return r.fulfill({ json: token });
  });
  await page.goto("/workspace/overview");
  await expect(card(page).locator("dd")).toHaveText(["$750.00", "1", "1"]);
  await expect(
    page.getByRole("button", { name: "Sign out", exact: true }),
  ).toHaveCount(1);
  await page
    .getByRole("link", { name: "Monthly checklist", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Monthly checklist", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Subscriptions", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Subscription renewals" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sign out", exact: true }),
  ).toHaveCount(1);
  expect(checks).toBe(1);
  await page.goto("/workspace/accounting/ledger");
  await expect(
    page.getByRole("heading", { name: "Workspace page not found" }),
  ).toBeVisible();
  await expect(page.locator(".finance-snapshot")).toHaveCount(0);
  await expect(page.locator("main")).not.toContainText("Northstar");
});
test("401 from any module clears the complete private body", async ({
  page,
}) => {
  await routes(page);
  await page.goto("/workspace/overview");
  await expect(card(page).locator("dd")).toHaveCount(3);
  await page.route("**/api/v1/subscription-renewals?*", (r) =>
    r.fulfill({ status: 401, json: { message: "Expired" } }),
  );
  await page.getByRole("link", { name: "Subscriptions", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Sign in to your finance workspace" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Subscription renewals" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("navigation", { name: "Workspace navigation" }),
  ).toHaveCount(0);
});
test("failed logout stays visible and does not claim success; confirmed logout removes all private data", async ({
  page,
}) => {
  await routes(page);
  await page.goto("/workspace/overview");
  await expect(card(page).locator("dd")).toHaveCount(3);
  await page.route("**/auth/logout", (r) =>
    r.fulfill({ status: 503, json: { message: "Unavailable" } }),
  );
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Sign out failed");
  await expect(card(page).locator("dd")).toHaveCount(3);
  await page.route("**/auth/logout", (r) =>
    r.fulfill({ json: { status: "signed-out" } }),
  );
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Sign in to your finance workspace" }),
  ).toBeVisible();
  await expect(page.getByText("Private customer", { exact: true })).toHaveCount(
    0,
  );
});
test("scope changes hide previous data immediately and ignore slow responses", async ({
  page,
}) => {
  await routes(page);
  await page.goto("/workspace/overview");
  await expect(card(page).locator("dd")).toHaveCount(3);
  let release: () => void = () => {};
  const delayed = new Promise<void>((r) => (release = r));
  await page.route(
    "**/api/v1/receivables/outstanding-customers?*",
    async (r) => {
      const q = new URL(r.request().url()).searchParams;
      if (q.get("entityId") === B) {
        await delayed;
        await r.fulfill({ json: ready(B, "all", 99000) }).catch(() => {});
      } else await r.fulfill({ json: ready(A, "all", 10000) });
    },
  );
  await card(page).getByLabel("Receivables entity").selectOption(B);
  await expect(card(page).locator("dd")).toHaveCount(0);
  await card(page).getByLabel("Receivables entity").selectOption(A);
  await expect(card(page).locator("dd")).toHaveText(["$100.00", "1", "1"]);
  release();
  await expect(card(page).locator("dd")).toHaveText(["$100.00", "1", "1"]);
});
test("no snapshot, permission and proxy failures never invent balances or authenticate malformed data", async ({
  page,
}) => {
  await routes(page);
  await page.goto("/workspace/overview");
  await expect(card(page).locator("dd")).toHaveCount(3);
  for (const [status, json, text] of [
    [
      200,
      { dataState: "no_snapshot", entityId: A, period: "all", currency: "USD" },
      "No invoice snapshot imported",
    ],
    [403, { message: "Forbidden" }, "Permission denied"],
    [
      503,
      { message: "API proxy is not configured." },
      "backend/proxy unavailable",
    ],
  ] as const) {
    await page.route("**/api/v1/receivables/outstanding-customers?*", (r) =>
      r.fulfill({ status, json }),
    );
    await card(page)
      .getByRole("button", { name: "Refresh stored snapshot" })
      .click();
    await expect(card(page)).toContainText(text);
    await expect(card(page).locator("dd")).toHaveCount(0);
  }
});
test("long untrusted source names remain text, mobile/keyboard contained, no private browser persistence", async ({
  page,
}) => {
  await routes(page);
  const hostile = "<img src=x onerror=alert(1)> " + "Long".repeat(35);
  await page.route("**/api/v1/receivables/outstanding-customers?*", (r) =>
    r.fulfill({
      json: {
        ...ready(),
        rows: [{ ...ready().rows[0], customerName: hostile }],
      },
    }),
  );
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/workspace/overview");
  await expect(card(page)).toContainText(hostile);
  await expect(card(page).locator("img")).toHaveCount(0);
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .getByRole("link", { name: "Monthly checklist", exact: true })
      .focus();
    await expect(
      page.getByRole("link", { name: "Monthly checklist", exact: true }),
    ).toBeFocused();
    await page.screenshot({
      path: `artifacts/workspace/overview-${width}.png`,
      fullPage: true,
    });
  }
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
  expect(errors).toEqual([]);
});
test("validated permission bootstrap hides restricted controls and malformed context never exposes private modules", async ({
  page,
}) => {
  await routes(page);
  const adminCalls: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/v1/admin/")) adminCalls.push(r.url());
  });
  await page.goto("/workspace/administration");
  await expect(
    page.getByText("Administrator permission required.", { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "Workspace navigation" })
      .getByRole("link", { name: "Administration", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Imports", exact: true }),
  ).toHaveCount(0);
  expect(adminCalls).toEqual([]);
  await page.route("**/api/v1/workspace/context", (r) =>
    r.fulfill({ json: { administrator: true, entities: [] } }),
  );
  await page.goto("/workspace/overview");
  await expect(
    page.getByRole("heading", { name: "Workspace unavailable", exact: true }),
  ).toBeVisible();
  await expect(card(page)).toHaveCount(0);
});
