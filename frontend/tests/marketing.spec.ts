import { test, expect } from "@playwright/test";

test("public navigation, product pages and demo entry work on direct refresh", async ({
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
    /Zero-Day Close\s*starts here/,
  );
  await page.getByRole("button", { name: "Product", exact: true }).click();
  await expect(page.getByRole("menu")).toBeVisible();
  await page.getByRole("menuitem", { name: /General ledger/ }).click();
  await expect(page).toHaveURL("/product/automated-general-ledger");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Your accounting on auto-pilot",
  );
  for (const path of [
    "/customers",
    "/product/bank-reconciliation",
    "/product/native-integrations",
    "/product/advanced-revenue-recognition",
    "/product/multi-entity",
    "/product/security-permissions",
    "/product/real-time-reporting",
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
  await page.goto("/resources#interactive-preview");
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
  await page.goto("/resources#interactive-preview");
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
  await page
    .getByRole("button", { name: "Watch the demo", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("button", { name: "Bring a close together", exact: true })
    .click();
  await page.getByRole("link", { name: "Start this walkthrough" }).click();
  await expect(page).toHaveURL("/close");
  await page.goto("/resources#questions");
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
    await expect(
      page.locator(".reference-hero .finance-metrics"),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      await page
        .locator(".reference-hero h1")
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

test("measured hero geometry and fonts follow the captured public reference", async ({
  page,
}) => {
  for (const target of [
    {
      width: 1440,
      headline: { x: 51.69, y: 182.73, size: 59.08 },
      art: { x: 51.69, y: 371.02, width: 1336.63, height: 703.72 },
    },
    {
      width: 390,
      headline: { x: 24, y: 210, size: 40 },
      art: { x: 0, y: 475.59, width: 390, height: 223.75 },
    },
  ]) {
    await page.setViewportSize({ width: target.width, height: 1000 });
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    const measured = await page.evaluate(() => {
      const h = document.querySelector(".reference-hero h1")!,
        art = document.querySelector(".reference-hero-art")!,
        r = h.getBoundingClientRect(),
        a = art.getBoundingClientRect(),
        s = getComputedStyle(h);
      return {
        headline: { x: r.x, y: r.y, size: parseFloat(s.fontSize) },
        art: { x: a.x, y: a.y, width: a.width, height: a.height },
        font: s.fontFamily,
        image: (
          document.querySelector(".reference-hero-art>img") as HTMLImageElement
        ).naturalWidth,
      };
    });
    expect(measured.font).toContain("Space Grotesk");
    expect(measured.image).toBeGreaterThan(1000);
    for (const key of ["x", "y", "size"] as const)
      expect(
        Math.abs(measured.headline[key] - target.headline[key]),
      ).toBeLessThan(4);
    for (const key of ["x", "y", "width", "height"] as const)
      expect(Math.abs(measured.art[key] - target.art[key])).toBeLessThan(4);
  }
});
test("public workflow carousel, local guide bookmark and workspace navigation rail work", async ({
  page,
}) => {
  await page.goto("/");
  const story = page.locator(".reference-story-copy h3");
  await expect(story).toHaveText("An invoice. A receipt. A clear trail.");
  await page.getByRole("button", { name: "Next workflow" }).click();
  await expect(story).toHaveText("A number with a source behind it.");
  await page.getByRole("button", { name: "Previous workflow" }).click();
  await expect(story).toHaveText("An invoice. A receipt. A clear trail.");
  await page.getByRole("button", { name: "Save workflow guide" }).click();
  await expect(
    page.getByRole("link", { name: "Workflow guide saved" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("link", { name: "Workflow guide saved" }),
  ).toBeVisible();
  await page.goto("/overview");
  await expect(
    page.getByRole("button", { name: "Expand navigation" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Expand navigation" }).click();
  await expect(
    page.getByRole("button", { name: "Collapse navigation" }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Journal entries", exact: true })
    .click();
  await expect(page.locator("main h1")).toHaveText("Journal entries");
});

test("platform sections preserve measured desktop spacing and stack full cards on mobile", async ({
  page,
}) => {
  for (const target of [
    { width: 1440, headingY: 1664.69, gridY: 1843.75, columns: 4 },
    { width: 390, headingY: 1348.34, gridY: 1568.34, columns: 1 },
  ]) {
    await page.setViewportSize({ width: target.width, height: 1000 });
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator(".reference-platform-card")).toHaveCount(8);
    const layout = await page.evaluate(() => {
      const grid = document.querySelector(".reference-platform-grid")!,
        heading = document.querySelector(".reference-platform h2")!,
        cards = [...grid.children].map((card) => {
          const r = card.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        });
      return {
        headingY: heading.getBoundingClientRect().y,
        gridY: grid.getBoundingClientRect().y,
        columns: getComputedStyle(grid).gridTemplateColumns.split(" ").length,
        cards,
      };
    });
    expect(Math.abs(layout.headingY - target.headingY)).toBeLessThan(4);
    expect(Math.abs(layout.gridY - target.gridY)).toBeLessThan(4);
    expect(layout.columns).toBe(target.columns);
    if (target.width === 390) {
      for (const card of layout.cards) {
        expect(Math.abs(card.width - 342)).toBeLessThan(1);
        expect(card.height).toBeGreaterThan(400);
      }
      for (let i = 1; i < layout.cards.length; i++)
        expect(layout.cards[i].y - layout.cards[i - 1].y).toBeGreaterThan(400);
      await expect(page.locator(".reference-ai-body > nav")).toBeHidden();
    } else {
      expect(Math.abs(layout.cards[0].height - 456.23)).toBeLessThan(2);
      await expect(page.locator(".reference-ai-body > nav")).toBeVisible();
    }
  }
});

test("product feature cards, source story and related-workflow carousel remain functional", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/product/automated-general-ledger");
  await expect(page.locator(".marketing-benefits > div")).toHaveCount(3);
  await expect(
    page.locator(".product-reference-feature-grid > article"),
  ).toHaveCount(4);
  const feature = await page
    .locator(".product-reference-feature-grid > article")
    .first()
    .boundingBox();
  expect(Math.abs(feature!.width - 653.55)).toBeLessThan(2);
  expect(Math.abs(feature!.height - 605.33)).toBeLessThan(2);
  const rail = page.locator(".product-reference-related-rail");
  await expect(rail.locator(":scope > a")).toHaveCount(11);
  await expect(
    page.getByRole("button", { name: "Previous related workflows" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Next related workflows" }).click();
  await expect
    .poll(() => rail.evaluate((el) => el.scrollLeft))
    .toBeGreaterThan(0);
  await expect(
    page.getByRole("button", { name: "Previous related workflows" }),
  ).toBeEnabled();
  await page
    .getByRole("link", { name: "Explore the record", exact: true })
    .click();
  await expect(page).toHaveURL(/\/accounting\/journals\//);
  await expect(page.locator("main h1")).toBeVisible();
});
