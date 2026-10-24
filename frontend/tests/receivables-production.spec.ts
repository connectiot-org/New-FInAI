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
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Fixture command timeout")),
      15000,
    );
    fixture.once("message", (v: { ok: boolean }) => {
      clearTimeout(timer);
      if (v.ok) resolve();
      else reject(new Error("Fixture command failed"));
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
      env: { ...process.env, FINAI_TEST_RECEIVABLES: "1" },
      stdio: ["ignore", "ignore", "pipe", "ipc"],
    },
  );
  let stderr = "";
  fixture.stderr?.on("data", (c) => (stderr += c));
  info = await new Promise((resolve, reject) => {
    fixture.once("message", (v) => resolve(v as typeof info));
    fixture.once("exit", () =>
      reject(new Error("Synthetic fixture failed: " + stderr)),
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
test("built HTTPS frontend -> actual proxy/session backend/DB: persisted imports, refresh/restart, denial/outage/expiry", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(info.origin + "/welcome");
  await page.getByRole("button", { name: "Enter demo workspace" }).click();
  const card = page.getByRole("region", {
    name: "Outstanding by customer",
    exact: true,
  });
  await card.getByLabel("Account name").fill("browser-test");
  await card.getByLabel("Organisation ID").fill(info.organisationId);
  await card
    .getByLabel("Password", { exact: true })
    .fill("synthetic-browser-password");
  await card.getByRole("button", { name: "Sign in", exact: true }).click();
  await card.getByLabel("Receivables entity").selectOption(info.entityId);
  await expect(card.locator("dd")).toHaveText(["$750.00", "1", "1"]);
  await expect(card).toContainText("Synthetic source A");
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("finai-demo-v1")!),
  );
  await page.reload();
  // Production selections are in memory, so explicitly reselect after a full reload.
  await card.getByLabel("Receivables entity").selectOption(info.entityId);
  await expect(card.locator("dd")).toHaveText(["$750.00", "1", "1"]);
  await action("restart");
  await card.getByRole("button", { name: "Refresh stored snapshot" }).click();
  await expect(card.locator("dd")).toHaveText(["$750.00", "1", "1"]);
  await action("importB");
  await card.getByRole("button", { name: "Refresh stored snapshot" }).click();
  await expect(card.locator("dd")).toHaveText(["$500.00", "1", "1"]);
  await expect(card).toContainText("Synthetic source B");
  await expect(card).toContainText("version 2");
  await expect(card.locator("a")).toHaveCount(0);
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `artifacts/receivables-production/overview-${width}.png`,
      fullPage: true,
    });
    await card.screenshot({
      path: `artifacts/receivables-production/card-${width}.png`,
    });
  }
  await card.getByLabel("Receivables entity").selectOption(info.secondEntityId);
  await expect(card).toContainText("No invoice snapshot imported");
  await expect(card.locator("dd")).toHaveCount(0);
  await card.getByLabel("Receivables entity").selectOption(info.entityId);
  await expect(card.locator("dd")).toHaveCount(3);
  await action("deny");
  await card.getByRole("button", { name: "Refresh stored snapshot" }).click();
  await expect(card).toContainText("Permission denied");
  await expect(card.locator("dd")).toHaveCount(0);
  await action("allow");
  await action("proxyOff");
  await card.getByRole("button", { name: "Refresh stored snapshot" }).click();
  await expect(card).toContainText("backend/proxy unavailable");
  await expect(card.locator("dd")).toHaveCount(0);
  await action("proxyOn");
  await card.getByRole("button", { name: "Refresh stored snapshot" }).click();
  await expect(card.locator("dd")).toHaveCount(3);
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("finai-demo-v1")!),
    ),
  ).toEqual(stored);
  const cookie = (await context.cookies()).find(
    (v) => v.name === "__Host-finai_session",
  );
  expect(cookie?.secure).toBe(true);
  expect(cookie?.httpOnly).toBe(true);
  await action("expire");
  await card.getByRole("button", { name: "Refresh stored snapshot" }).click();
  await expect(
    card.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await expect(card.locator("dd")).toHaveCount(0);
  expect(errors).toEqual([]);
});
