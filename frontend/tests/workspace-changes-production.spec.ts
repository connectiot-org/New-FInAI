import { test, expect } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
let fixture: ChildProcess,
  info: {
    origin: string;
    organisationId: string;
    entityId: string;
    secondEntityId: string;
  };
async function action(command: string) {
  await new Promise<void>((resolve, reject) => {
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
      env: {
        ...process.env,
        FINAI_TEST_WORKSPACE: "1",
        FINAI_TEST_CHANGES: "1",
      },
      stdio: ["ignore", "ignore", "pipe", "ipc"],
    },
  );
  let stderr = "";
  fixture.stderr?.on("data", (c) => (stderr += c));
  info = await new Promise((resolve, reject) => {
    fixture.once("message", (v) => resolve(v as typeof info));
    fixture.once("exit", () =>
      reject(new Error("Comparison fixture failed: " + stderr)),
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
test("built authenticated comparison uses real sources/API/PostgreSQL, survives a third import/restart and clears private state", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(
    info.origin + "/workspace/receivables/invoices?entityId=" + info.entityId,
  );
  await page.getByLabel("Account name").fill("browser-test");
  await page.getByLabel("Organisation ID").fill(info.organisationId);
  await page
    .getByLabel("Password", { exact: true })
    .fill("synthetic-browser-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page
    .getByRole("link", { name: "Compare imports", exact: true })
    .click();
  const region = page.getByRole("region", {
    name: "Import comparison",
    exact: true,
  });
  await expect(
    region.getByRole("heading", { name: "Outstanding decreased by $400.00." }),
  ).toBeVisible();
  await expect(
    region.locator(".change-summary").first().locator("dd"),
  ).toHaveText(["$2,550.00", "$2,150.00", "−$400.00"]);
  await expect(region.getByRole("note")).toContainText(
    "Source cutoffs run backward",
  );
  await expect(
    page.getByRole("rowheader", { name: "INV-001", exact: false }),
  ).toBeVisible();
  const pinned = page.url();
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (width < 760) {
      const scroll = page.getByRole("region", {
        name: "Changed invoices table",
        exact: true,
      });
      expect(
        await scroll.evaluate((el) => el.scrollWidth > el.clientWidth),
      ).toBe(true);
      await scroll.focus();
      await page.keyboard.press("ArrowRight");
      await expect
        .poll(() => scroll.evaluate((el) => el.scrollLeft))
        .toBeGreaterThan(0);
      await scroll.evaluate((el) => {
        el.scrollLeft = 0;
      });
    }
    await page.screenshot({
      path: `artifacts/import-changes/real-comparison-${width}.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await action("changesThird");
  await page.getByRole("button", { name: "Reload source choices" }).click();
  await expect(
    page
      .getByLabel("Later import", { exact: true })
      .getByRole("option")
      .filter({ hasText: "Version 3 ·" }),
  ).toHaveCount(1);
  expect(page.url()).toBe(pinned);
  await expect(
    region.locator(".change-summary").first().locator("dd"),
  ).toHaveText(["$2,550.00", "$2,150.00", "−$400.00"]);
  await page.reload();
  expect(page.url()).toBe(pinned);
  await expect(region).toContainText("Outstanding decreased by $400.00.");
  await action("restart");
  await page.reload();
  await expect(region).toContainText("Outstanding decreased by $400.00.");
  const earlier = region.getByRole("link", {
    name: "Open earlier source register",
  });
  const href = await earlier.getAttribute("href"),
    q = new URL(href!, info.origin).searchParams;
  expect(q.get("period")).toBe("all");
  expect(q.get("status")).toBe("all");
  await earlier.click();
  await expect(
    page.getByRole("cell", { name: "INV-001", exact: true }),
  ).toBeVisible();
  await page.goto(pinned);
  await expect(region).toBeVisible();
  await page.getByLabel("Comparison entity").selectOption(info.secondEntityId);
  await expect(region).toHaveCount(0);
  await expect(
    page.getByText("No invoice imports saved for this entity.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.goto(pinned);
  await expect(region).toBeVisible();
  await page.getByLabel("Earlier import", { exact: true }).focus();
  await expect(
    page.getByLabel("Earlier import", { exact: true }),
  ).toBeFocused();
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
  expect(await page.evaluate(() => Object.keys(sessionStorage))).toEqual([]);
  await action("expire");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Sign in to your finance workspace" }),
  ).toBeVisible();
  await expect(region).toHaveCount(0);
  expect(errors).toEqual([]);
});
