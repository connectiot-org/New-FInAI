import { test, expect, type Page } from "@playwright/test";
const root = "/development/payables/invoices";
const open = async (page: Page) => {
  await page.goto("/");
  await page
    .getByRole("banner")
    .getByRole("link", { name: "Supplier invoices", exact: true })
    .click();
  await expect(page).toHaveURL(root);
  await expect(
    page.getByRole("region", { name: "Development preview" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Invoices", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: /Sample Studio Supplier DEV-1001/ }),
  ).toBeVisible();
};
const role = async (page: Page, label: string) => {
  await page.getByLabel("Development role").selectOption({ label });
  await expect(
    page.getByRole("heading", { name: "Invoices", exact: true }),
  ).toBeVisible();
};
test("development invoices open without sign-in or API, render PDF, approve, balance CSV and survive refresh", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (r) => {
    if (/\/(?:api\/|auth\/)/.test(new URL(r.url()).pathname))
      requests.push(r.url());
  });
  await open(page);
  await page
    .getByRole("link", { name: /Sample Studio Supplier DEV-1001/ })
    .click();
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.locator(".ap-pdf canvas")).toBeVisible();
  for (const width of [1440, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBeTruthy();
    await page.screenshot({
      path: `artifacts/payables/development-${width}.png`,
      fullPage: true,
    });
  }
  await expect(page.getByText("Development file · unscanned")).toBeVisible();
  await page.getByRole("button", { name: "Confirm details & submit" }).click();
  await expect(page.locator(".ap-status")).toHaveText("Awaiting approval");
  await role(page, "Second approver");
  await expect(
    page.getByRole("button", { name: "Approve invoice", exact: true }),
  ).toHaveCount(0);
  await role(page, "First approver");
  await page
    .getByRole("button", { name: "Approve invoice", exact: true })
    .click();
  await expect(page.locator(".ap-status")).toHaveText("Approved");
  await role(page, "Reviewer");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Prepare accounting export" }).click();
  const stream = await (await download).createReadStream();
  let csv = "";
  for await (const bytes of stream!) csv += bytes.toString();
  const rows = csv
    .trim()
    .split("\r\n")
    .slice(1)
    .map((r) => r.split(",").map((v) => v.slice(1, -1)));
  expect(
    rows.reduce((sum, row) => sum + BigInt(row[5]) - BigInt(row[6]), 0n),
  ).toBe(0n);
  expect(csv).toContain("DEV-1001");
  await page.reload();
  await expect(page.locator(".ap-status")).toHaveText("Approved");
  await expect(page.getByText("Revision 1 · current")).toHaveCount(1);
  expect(requests).toEqual([]);
});
test("development supplier, invoice and PDF persist through verification and two assigned approvals", async ({
  page,
}) => {
  test.setTimeout(90000);
  await open(page);
  await page.getByRole("link", { name: "Suppliers", exact: true }).click();
  await page
    .getByLabel("Legal / display name")
    .fill("Development Test Supplier");
  await page.getByLabel("Tax identifier", { exact: true }).fill("SAMPLE");
  await page.getByRole("button", { name: "Add supplier", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: "Development Test Supplier", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Invoices", exact: true }).click();
  await page.getByRole("button", { name: "Add invoice", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Supplier", { exact: true })
    .selectOption({ label: "Development Test Supplier" });
  await dialog.getByLabel("Supplier reference").fill("DEV-CREATE-001");
  await dialog.getByLabel("Invoice date").fill("2026-11-01");
  await dialog.getByLabel("Due date").fill("2026-12-01");
  await dialog.getByLabel("Total on supplier document (GBP)").fill("1200.00");
  await dialog
    .getByLabel("Description", { exact: true })
    .fill("Sample design work");
  await dialog.getByLabel("Unit price (GBP)").fill("1000.00");
  await dialog.getByLabel("Tax treatment").selectOption("STANDARD");
  await dialog.getByLabel("Expense account").fill("6000");
  await dialog.getByLabel("Tax account", { exact: true }).fill("2200");
  await dialog.getByLabel("Payable account").fill("2100");
  await dialog.getByLabel("Cost centre").fill("Operations");
  await dialog.getByLabel("Tax recoverable").check();
  await dialog.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Confirm details & submit" }).click();
  await expect(page.getByRole("alert")).toContainText("sample PDF");
  await page.getByLabel("Add original PDF").setInputFiles({
    name: "sample.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n" + "0".repeat(20000) + "\n%%EOF"),
  });
  await expect(page.getByText("Development file · unscanned")).toBeVisible();
  await page.reload();
  await expect(page.getByText("sample.pdf", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Confirm details & submit" }).click();
  await expect(page.locator(".ap-status")).toHaveText("Awaiting verification");
  await role(page, "Verifier");
  await page.getByRole("button", { name: "Verify delivery" }).click();
  await expect(page.locator(".ap-status")).toHaveText("Awaiting approval");
  await role(page, "First approver");
  await page
    .getByRole("button", { name: "Approve invoice", exact: true })
    .click();
  await expect(page.getByText("Second approver · current")).toBeVisible();
  await role(page, "Second approver");
  await page
    .getByRole("button", { name: "Approve invoice", exact: true })
    .click();
  await expect(page.locator(".ap-status")).toHaveText("Approved");
});
test("development reset restores sample data and private workspace retains its own gate", async ({
  page,
}) => {
  await open(page);
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const r = indexedDB.open("finai-invoices-development-v1", 1);
      r.onsuccess = () => {
        const tx = r.result.transaction("workspace", "readwrite");
        tx.objectStore("workspace").put({ format: "corrupt" }, "state");
        tx.oncomplete = () => {
          r.result.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });
  });
  await page.reload();
  await expect(page.getByRole("alert")).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Reset preview" }).click();
  await expect(
    page.getByRole("link", { name: /Sample Studio Supplier DEV-1001/ }),
  ).toBeVisible();
  await page.goto("/workspace/payables/invoices");
  await expect(
    page.getByRole("region", { name: "Development preview" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: /Sample Studio Supplier DEV-1001/ }),
  ).toHaveCount(0);
});

test("development policies save/publish and reasoned correction/rejection remain functional", async ({
  page,
}) => {
  await open(page);
  await page
    .getByRole("link", { name: "Approval settings", exact: true })
    .click();
  await expect(
    page.getByText("Published revision 1", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Publish policy", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByText("Published revision 1", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Publish policy", exact: true })
    .click();
  await expect(
    page.getByText("Published revision 3", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Invoices", exact: true }).click();
  await page
    .getByRole("link", { name: /Sample Studio Supplier DEV-1001/ })
    .click();
  await page
    .getByLabel("Reason for challenge or rejection")
    .fill("Correct the sample reference");
  await page
    .getByRole("button", { name: "Request correction", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Confirm details & submit" }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Edit metadata", exact: true })
    .click();
  const form = page.getByRole("dialog");
  await form.getByLabel("Supplier reference").fill("DEV-CORRECTED");
  await form.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(form).toHaveCount(0);
  await page.getByRole("button", { name: "Confirm details & submit" }).click();
  await expect(page.locator(".ap-status")).toHaveText("Awaiting approval");
  await role(page, "First approver");
  await page
    .getByLabel("Reason for challenge or rejection")
    .fill("Sample rejection");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Reject", exact: true }).click();
  await expect(page.locator(".ap-status")).toHaveText("Rejected");
  await role(page, "Reviewer");
  await expect(
    page.getByRole("button", { name: "Edit metadata", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Prepare accounting export" }),
  ).toHaveCount(0);
});
