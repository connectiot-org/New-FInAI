import { test, expect } from "@playwright/test";
test("copy demo remains session-only and makes no checklist API calls", async ({
  page,
}) => {
  const calls: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/v1/")) calls.push(request.url());
  });
  await page.goto("/close/checklist?month=2026-09");
  await page.getByLabel("Task title").fill("Demo carry title");
  await page.getByRole("button", { name: "Add task", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "Demo carry title" }),
  ).toBeVisible();
  await page.getByRole("checkbox", { name: "Demo carry title" }).click();
  await expect(
    page.getByRole("checkbox", { name: "Demo carry title" }),
  ).toBeChecked();
  await page.getByLabel("Checklist month").fill("2026-10");
  await page
    .getByRole("button", { name: "Copy last month’s tasks", exact: true })
    .click();
  await page.getByRole("button", { name: "Copy tasks", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "Demo carry title" }),
  ).not.toBeChecked();
  await expect(page.getByText("0/1 completed", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("0/0 completed", { exact: true })).toBeVisible();
  expect(calls).toEqual([]);
});
