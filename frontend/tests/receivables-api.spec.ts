import { test, expect, type Page } from "@playwright/test";
const A = "22222222-2222-4222-8222-222222222222",
  B = "22222222-2222-4222-8222-222222222223";
const ready = (entityId = A, period = "all", totalCents = 75000) => ({
  dataState: "ready",
  entityId,
  period,
  currency: "USD",
  source: {
    snapshotId: "33333333-3333-4333-8333-333333333333",
    version: 1,
    sourceName: "Synthetic source",
    sourceCapturedAt: "2026-10-23T00:00:00Z",
    importedAt: "2026-10-24T00:00:00Z",
  },
  totalCents,
  invoiceCount: 1,
  customerCount: 1,
  rows: [
    {
      customerId: "external-customer",
      customerName: "Imported customer",
      invoiceCount: 1,
      remainingCents: totalCents,
    },
  ],
});
const card = (p: Page) =>
  p.getByRole("region", { name: "Outstanding by customer", exact: true });
async function setup(page: Page) {
  await page.route("**/auth/session", (r) =>
    r.fulfill({ json: { csrfToken: "a".repeat(64) } }),
  );
  await page.route("**/api/v1/entities", (r) =>
    r.fulfill({
      json: {
        items: [
          { id: A, name: "Production A" },
          { id: B, name: "Production B" },
        ],
      },
    }),
  );
  await page.route("**/api/v1/receivables/outstanding-customers?*", (r) => {
    const q = new URL(r.request().url()).searchParams;
    return r.fulfill({ json: ready(q.get("entityId")!, q.get("period")!) });
  });
  await page.goto("/welcome");
  await page.getByRole("button", { name: "Enter demo workspace" }).click();
  await expect(card(page).locator("dd")).toHaveText(["$750.00", "1", "1"]);
}
test("API discovers UUID scope independently, source labels, no demo links/storage, keyboard and mobile", async ({
  page,
}) => {
  await setup(page);
  const before = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("finai-demo-v1")!),
  );
  await page.getByLabel("Entity", { exact: true }).selectOption("uk");
  await expect(card(page).getByLabel("Receivables entity")).toHaveValue(A);
  await card(page).getByLabel("Receivables entity").selectOption(B);
  await card(page).getByLabel("Invoice issue period").fill("2026-09");
  await expect(card(page).locator("dd")).toHaveText(["$750.00", "1", "1"]);
  await expect(card(page)).toContainText("Synthetic source");
  await expect(card(page)).toContainText("2026-10-23T00:00:00Z");
  await expect(card(page)).toContainText("2026-10-24T00:00:00Z");
  await expect(card(page).locator("a")).toHaveCount(0);
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await card(page)
      .getByRole("button", { name: "Refresh stored snapshot" })
      .focus();
    await expect(
      card(page).getByRole("button", { name: "Refresh stored snapshot" }),
    ).toBeFocused();
  }
  const after = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("finai-demo-v1")!),
  );
  expect(after.entity).toBe("uk");
  expect({ ...after, entity: before.entity }).toEqual(before);
  expect(JSON.stringify(after)).not.toContain("Imported customer");
});
test("slow old scope cannot replace new scope, and loading never shows prior data", async ({
  page,
}) => {
  await setup(page);
  let release: () => void = () => {};
  const wait = new Promise<void>((r) => (release = r));
  await page.route(
    "**/api/v1/receivables/outstanding-customers?*",
    async (r) => {
      const q = new URL(r.request().url()).searchParams;
      if (q.get("entityId") === B) {
        await wait;
        await r.fulfill({ json: ready(B, "all", 99000) }).catch(() => {});
      } else await r.fulfill({ json: ready(A, "all", 10000) });
    },
  );
  await card(page).getByLabel("Receivables entity").selectOption(B);
  await expect(card(page)).toContainText("Loading imported");
  await expect(card(page).locator("dd")).toHaveCount(0);
  await card(page).getByLabel("Receivables entity").selectOption(A);
  await expect(card(page).locator("dd")).toHaveText(["$100.00", "1", "1"]);
  release();
  await expect(card(page).locator("dd")).toHaveText(["$100.00", "1", "1"]);
});
test("no snapshot, ready empty, permission/outage/malformed scope and retry never fall back", async ({
  page,
}) => {
  await setup(page);
  for (const [status, json, text] of [
    [
      200,
      { dataState: "no_snapshot", entityId: A, period: "all", currency: "USD" },
      "No invoice snapshot imported",
    ],
    [
      200,
      {
        ...ready(),
        totalCents: 0,
        invoiceCount: 0,
        customerCount: 0,
        rows: [],
      },
      "No outstanding invoices",
    ],
    [403, { message: "Denied" }, "Permission denied"],
    [503, { message: "Unavailable" }, "backend/proxy unavailable"],
    [200, { ...ready(), entityId: B }, "different receivables scope"],
    [200, { ...ready(), totalCents: 1 }, "response invalid"],
  ] as const) {
    await page.route("**/api/v1/receivables/outstanding-customers?*", (r) =>
      r.fulfill({ status, json }),
    );
    await card(page)
      .getByRole("button", { name: "Refresh stored snapshot" })
      .click();
    await expect(card(page)).toContainText(text);
    expect(await card(page).getByText("$142,170.00").count()).toBe(0);
  }
  await card(page).getByLabel("Invoice issue period").fill("0000-01");
  await expect(card(page)).toContainText("valid YYYY-MM");
});
test("logout and session expiry clear imported data; authenticated card does not gate homepage", async ({
  page,
}) => {
  await setup(page);
  await page.route("**/auth/logout", (r) =>
    r.fulfill({ json: { status: "signed-out" } }),
  );
  await card(page)
    .getByRole("button", { name: "Sign out", exact: true })
    .click();
  await expect(
    card(page).getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await expect(card(page).locator("dd")).toHaveCount(0);
  await page.route("**/auth/login", (r) =>
    r.fulfill({ json: { csrfToken: "a".repeat(64) } }),
  );
  await card(page).getByLabel("Account name").fill("test");
  await card(page).getByLabel("Organisation ID").fill(A);
  await card(page).getByLabel("Password").fill("synthetic-password");
  await card(page)
    .getByRole("button", { name: "Sign in", exact: true })
    .click();
  await expect(card(page).locator("dd")).toHaveCount(3);
  await page.route("**/api/v1/receivables/outstanding-customers?*", (r) =>
    r.fulfill({ status: 401, json: { message: "expired" } }),
  );
  await card(page)
    .getByRole("button", { name: "Refresh stored snapshot" })
    .click();
  await expect(
    card(page).getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await expect(card(page).locator("dd")).toHaveCount(0);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    /Clearer books/,
  );
});
test("hostile long imported text is plain text and bounded at 320px; response invariants rejected", async ({
  page,
}) => {
  await setup(page);
  const name = "<img src=x onerror=alert(1)> " + "Long".repeat(35);
  await page.route("**/api/v1/receivables/outstanding-customers?*", (r) =>
    r.fulfill({
      json: { ...ready(), rows: [{ ...ready().rows[0], customerName: name }] },
    }),
  );
  await card(page)
    .getByRole("button", { name: "Refresh stored snapshot" })
    .click();
  await expect(card(page)).toContainText(name);
  await expect(card(page).locator("img")).toHaveCount(0);
  await page.setViewportSize({ width: 320, height: 1000 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  for (const patch of [
    { invoiceCount: 0 },
    { customerCount: 0 },
    { totalCents: 9007199254740992 },
    { rows: [...ready().rows, ...ready().rows] },
    { source: { ...ready().source, sourceCapturedAt: "not-a-date" } },
  ]) {
    await page.route("**/api/v1/receivables/outstanding-customers?*", (r) =>
      r.fulfill({ json: { ...ready(), ...patch } }),
    );
    await card(page)
      .getByRole("button", { name: "Refresh stored snapshot" })
      .click();
    await expect(card(page).getByRole("alert")).toBeVisible();
    await expect(card(page).locator("dd")).toHaveCount(0);
  }
});
