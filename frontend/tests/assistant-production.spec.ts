import { test, expect } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
let fixture: ChildProcess,
  info: { origin: string; organisationId: string; entityId: string };
async function action(command: string) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Synthetic fixture timeout")),
      15000,
    );
    fixture.once("message", (v: { ok: boolean }) => {
      clearTimeout(timer);
      if (v.ok) resolve();
      else reject(new Error("Synthetic fixture failed"));
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
        FINAI_TEST_ASSISTANT: "1",
      },
      stdio: ["ignore", "ignore", "pipe", "ipc"],
    },
  );
  let stderr = "";
  fixture.stderr?.on("data", (c) => (stderr += c));
  info = await new Promise((resolve, reject) => {
    fixture.once("message", (v) => resolve(v as typeof info));
    fixture.once("exit", () =>
      reject(new Error("Controlled-provider fixture failed: " + stderr)),
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
test("built HTTPS proxy/session/PostgreSQL with controlled provider: grounded A/B, ledger, follow-ups, private memory/restart/delete and mobile", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(info.origin + "/assistant");
  await page.getByLabel("Account name").fill("browser-test");
  await page.getByLabel("Organisation ID").fill(info.organisationId);
  await page
    .getByLabel("Password", { exact: true })
    .fill("synthetic-browser-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page
    .getByLabel("Assistant entity", { exact: true })
    .selectOption(info.entityId);
  await page.getByLabel("Assistant month", { exact: true }).fill("2026-09");
  await page
    .getByRole("button", { name: "New conversation", exact: true })
    .click();
  await expect(
    page.getByText("No questions yet.", { exact: true }),
  ).toBeVisible();
  const firstChat = page.url();
  async function ask(question: string) {
    await page.getByLabel("Ask FinAI", { exact: true }).fill(question);
    await page.getByLabel("Ask FinAI", { exact: true }).press("Enter");
    await expect(
      page.getByRole("status").filter({ hasText: "Answering from permitted" }),
    ).toHaveCount(0);
    await expect(
      page.locator(".assistant-turn").last().locator("details"),
    ).toBeVisible();
  }
  await ask("Which customers owe us the most?");
  await expect(page.locator(".assistant-turn").first()).toContainText(
    "USD 750.00",
  );
  await page
    .locator(".assistant-turn")
    .first()
    .getByText("Answer basis and sources")
    .click();
  const source = page.locator(".assistant-turn").first().getByRole("link");
  await expect(source).toHaveAttribute(
    "href",
    /\/workspace\/receivables\/invoices\?/,
  );
  await source.click();
  await expect(
    page.getByRole("heading", { name: "Imported invoices", exact: true }),
  ).toBeVisible();
  await page.goto(firstChat);
  await action("importB");
  await ask("Show the invoice records behind that amount");
  await expect(page.locator(".assistant-turn").first()).toContainText(
    "USD 750.00",
  );
  await expect(page.locator(".assistant-turn").nth(1)).toContainText(
    "USD 500.00",
  );
  await page
    .getByRole("link", { name: "Monthly checklist", exact: true })
    .click();
  await page.getByLabel("Checklist entity").selectOption(info.entityId);
  await page.getByLabel("Checklist month", { exact: true }).fill("2026-09");
  await page
    .getByLabel("Task title", { exact: true })
    .fill("Synthetic engineering close item");
  await page.getByRole("button", { name: "Add task", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "Synthetic engineering close item" }),
  ).toBeVisible();
  await page.goto(firstChat);
  await ask("What is incomplete for this close checklist?");
  const operational = page.locator(".assistant-turn").last();
  await expect(operational).toContainText("Synthetic engineering close item");
  await operational.getByText("Answer basis and sources").click();
  await operational.getByRole("link").click();
  await expect(
    page.getByRole("heading", {
      name: "Incomplete checklist source",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator("main")).toContainText(
    "Synthetic engineering close item",
  );
  expect(new URL(page.url()).searchParams.get("month")).toBe("2026-09");
  expect(new URL(page.url()).searchParams.get("entityId")).toBe(info.entityId);
  await page.goto(firstChat);
  await page
    .getByLabel("Answer detail", { exact: true })
    .selectOption("detailed");
  await page
    .getByLabel("Preference note", { exact: true })
    .fill("Show supporting exact source facts.");
  await page
    .getByRole("button", { name: "Save preference", exact: true })
    .click();
  await expect(
    page.getByText("Preference saved for future questions in this entity.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.locator(".assistant-memory").getByText("Version 1", { exact: false }),
  ).toBeVisible();
  await page
    .getByLabel("Preference note", { exact: true })
    .fill("Keep the full arithmetic trail.");
  await page
    .getByRole("button", { name: "Save preference changes", exact: true })
    .click();
  await expect(
    page.locator(".assistant-memory").getByText("Version 2", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "New conversation", exact: true })
    .click();
  await expect(page.getByLabel("Answer detail", { exact: true })).toHaveValue(
    "detailed",
  );
  await ask(
    "Show closing cash, revenue, expenses and profit from the imported ledger",
  );
  const ledgerTurn = page.locator(".assistant-turn").last();
  await expect(ledgerTurn).toContainText("USD 1,050.00");
  await expect(ledgerTurn).toContainText("USD 250.00");
  await expect(ledgerTurn).toContainText("USD 50.00");
  await expect(ledgerTurn).toContainText("USD 200.00");
  await ledgerTurn.getByText("Answer basis and sources").click();
  await ledgerTurn.getByRole("link").click();
  await expect(
    page.getByRole("heading", { name: "Imported ledger source", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Posted source journals through selected month",
      exact: true,
    }),
  ).toBeVisible();
  await page.goBack();
  await action("restart");
  await page.reload();
  await expect(page.locator(".assistant-turn")).toContainText("USD 1,050.00");
  await expect(page.getByLabel("Preference note", { exact: true })).toHaveValue(
    "Keep the full arithmetic trail.",
  );
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `artifacts/assistant/production-${width}.png`,
      fullPage: true,
    });
  }
  await page
    .getByRole("button", { name: "Forget preference", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm forget preference", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Preference forgotten." }),
  ).toBeVisible();
  await expect(page.getByLabel("Answer detail", { exact: true })).toHaveValue(
    "concise",
  );
  await page
    .getByRole("button", { name: "Delete conversation", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm delete conversation", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Start a scoped conversation" }),
  ).toBeVisible();
  await page.goto(firstChat);
  await expect(page.locator(".assistant-turn").first()).toContainText(
    "USD 750.00",
  );
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Sign in to your finance workspace" }),
  ).toBeVisible();
  await expect(page.locator(".assistant-turn")).toHaveCount(0);
  await page.getByLabel("Account name").fill("browser-test");
  await page.getByLabel("Organisation ID").fill(info.organisationId);
  await page
    .getByLabel("Password", { exact: true })
    .fill("synthetic-browser-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator(".assistant-turn").first()).toContainText(
    "USD 750.00",
  );
  await action("expire");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Sign in to your finance workspace" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
