import { test, expect } from "@playwright/test";

test("public navigation, six product pages and demo entry work on direct refresh", async ({
  page,
}) => {
  const errors: string[] = [],
    external: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (
      !r.url().startsWith("http://127.0.0.1:5173") &&
      !r.url().startsWith("data:") &&
      !r.url().startsWith("blob:")
    )
      external.push(r.url());
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "A clear mind.A connected ledger.",
  );
  await page.getByRole("button", { name: "Product", exact: true }).click();
  await expect(page.getByRole("menu")).toBeVisible();
  await page.getByRole("menuitem", { name: /General ledger/ }).click();
  await expect(page).toHaveURL("/product/automated-general-ledger");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Your source of truth",
  );
  for (const path of [
    "/product/accounts-receivable",
    "/product/accounts-payable",
    "/product/financial-reporting",
    "/product/month-end-close",
    "/product/assistant",
    "/resources",
    "/about",
  ]) {
    await page.goto(path);
    await expect(page.locator("main h1")).toBeVisible();
    await page.reload();
    await expect(page.locator("main h1")).toBeVisible();
  }
  await page.getByRole("link", { name: "See the idea in action" }).click();
  await expect(page).toHaveURL("/welcome");
  await page.getByRole("button", { name: "Enter demo workspace" }).click();
  await expect(page.locator("main h1")).toHaveText("Overview");
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});
test("interactive homepage preview uses real records and search links", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "General ledger", exact: true }).click();
  const preview = page.getByRole("region", {
    name: "General ledger product preview",
  });
  await expect(preview).toBeVisible();
  await preview
    .getByRole("textbox", { name: "Search product preview" })
    .fill("no matching record");
  await expect(
    preview.getByText("No matching demo records. Try another search."),
  ).toBeVisible();
  await preview
    .getByRole("textbox", { name: "Search product preview" })
    .fill("INV-1001");
  await preview.locator("tbody a").first().click();
  await expect(page).toHaveURL(/\/accounting\/journals\//);
  await expect(page.locator("main h1")).toContainText("INV-1001");
  await page.goto("/");
  await page.getByRole("tab", { name: "Receivables", exact: true }).click();
  await expect(
    page
      .getByRole("region", { name: "Receivables product preview" })
      .locator("tbody tr"),
  ).toHaveCount(5);
  await page.getByRole("tab", { name: "FinAI Assistant", exact: true }).click();
  await expect(
    page
      .getByRole("region", { name: "FinAI Assistant product preview" })
      .getByText("Demo responses · No model connection"),
  ).toBeVisible();
});
test("guided walkthrough, FAQ keyboard behavior and missing product recovery", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Take a closer look" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("button", { name: "Bring a close together", exact: true })
    .click();
  await page.getByRole("link", { name: "Start this walkthrough" }).click();
  await expect(page).toHaveURL("/close");
  await page.goto("/#questions");
  const question = page
    .locator("summary")
    .filter({ hasText: "Will this connect to my bank or move real money?" });
  await question.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByText(
      "No. Bank connections, receipts, and payments are explicitly simulated.",
      { exact: false },
    ),
  ).toBeVisible();
  await page.goto("/product/unknown-product");
  await expect(
    page.getByRole("heading", { name: "That page isn’t in this demo." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Return home" }).click();
  await expect(page).toHaveURL("/");
});
for (const width of [1440, 1280, 1024, 390])
  test(`public homepage and product containment at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    await expect(page.locator(".preview-metrics")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      await page
        .locator(".marketing-hero h1")
        .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/homepage-${width}.png`,
      fullPage: true,
    });
    if (width === 390) {
      await page
        .getByRole("button", { name: "Open public navigation" })
        .click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(
        page.getByRole("button", { name: "Open public navigation" }),
      ).toBeFocused();
    }
    await page.goto("/product/accounts-receivable");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
