import { test, expect, type Page } from "@playwright/test";
const root = "/demo/payables/invoices";
const open = async (page: Page) => {
  await page.goto("/demo/invoices");
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

test("demo aliases refresh directly and every workflow stage has a ready sample", async ({
  page,
}) => {
  for (const alias of ["/demo/invoices", "/demo/payables/invoices"]) {
    await page.goto(alias);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Invoices", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Sign in", exact: true }),
    ).toHaveCount(0);
  }
  await expect(
    page.getByRole("tab", { name: "All 6", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("row", { name: /DEV-1005/ })
      .getByRole("cell", { name: "Closed", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Review 2", exact: true }).click();
  await page.getByRole("link", { name: /DEV-1006/ }).click();
  await expect(page.getByRole("alert")).toContainText(
    "differs from calculated",
  );
  await expect(
    page.getByRole("button", { name: "Confirm details & submit" }),
  ).toBeDisabled();
  await page.getByRole("link", { name: "All invoices", exact: true }).click();
  await role(page, "Verifier");
  await page.getByRole("tab", { name: "Verify 1", exact: true }).click();
  await expect(page.getByRole("link", { name: /DEV-1002/ })).toBeVisible();
  await expect(
    page
      .getByLabel("Assigned to")
      .getByRole("option", { name: "First approver", exact: true }),
  ).toHaveCount(1);
  await role(page, "First approver");
  await page.getByRole("tab", { name: "Approve 1", exact: true }).click();
  await expect(page.getByRole("link", { name: /DEV-1003/ })).toBeVisible();
  await role(page, "Reviewer");
  await page
    .getByRole("link", { name: "Accounting export", exact: true })
    .click();
  await page.getByRole("link", { name: /DEV-1004/ }).click();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Prepare accounting export" }).click();
  expect((await downloaded).suggestedFilename()).toBe(
    "development-invoice-export.csv",
  );
});

test("new stage samples are added without overwriting an older browser's invoice edits", async ({
  page,
}) => {
  await open(page);
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("finai-invoices-development-v1", 1);
      request.onsuccess = () => {
        const db = request.result,
          tx = db.transaction("workspace", "readwrite"),
          store = tx.objectStore("workspace"),
          get = store.get("state");
        get.onsuccess = () => {
          const state = get.result;
          delete state.sampleVersion;
          state.invoices = [state.invoices[0]];
          state.invoices[0].data.reference = "LOCAL-EDIT-KEPT";
          state.suppliers = [state.suppliers[0]];
          store.put(state, "state");
        };
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });
  });
  await page.reload();
  await expect(
    page.getByRole("tab", { name: "All 6", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /LOCAL-EDIT-KEPT/ }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /DEV-1002/ })).toBeVisible();
});

test("legacy invoice routes open samples directly without sign-in or private company identity", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (r) => {
    if (/^\/(api|auth)\//.test(new URL(r.url()).pathname))
      requests.push(r.url());
  });
  for (const alias of [
    "/development/payables/invoices",
    "/invoices",
    "/invoice-approvals",
  ]) {
    await page.goto(alias);
    await expect(page).toHaveURL("/demo/payables/invoices");
    await expect(
      page.getByRole("region", { name: "Development preview" }),
    ).toBeVisible();
    await expect(page.getByLabel("Account name")).toHaveCount(0);
    await expect(page.getByLabel("Organisation ID")).toHaveCount(0);
    await expect(page.getByLabel("Password", { exact: true })).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: /Sample Studio Supplier DEV-1001/ }),
    ).toBeVisible();
  }
  await page.goto(
    "/development/payables/invoices?entityId=22222222-2222-4222-8222-222222222222",
  );
  await expect(page).toHaveURL("/demo/payables/invoices");
  await expect(
    page.getByRole("link", { name: /Sample Studio Supplier DEV-1001/ }),
  ).toBeVisible();
  expect(requests).toEqual([]);
});

test("leaving a PDF while its bytes load does not start an orphan preview worker", async ({
  page,
}) => {
  await open(page);
  await page.evaluate(() => {
    const probe = {
      pending: false,
      finished: false,
      workers: 0,
      release: () => {},
    };
    Object.assign(window, { finaiPdfProbe: probe });
    const buffer = Blob.prototype.arrayBuffer;
    Blob.prototype.arrayBuffer = async function () {
      if (this.type === "application/pdf" && !probe.pending) {
        probe.pending = true;
        await new Promise<void>((resolve) => {
          probe.release = resolve;
        });
      }
      const value = await buffer.call(this);
      probe.finished = true;
      return value;
    };
    const NativeWorker = window.Worker;
    window.Worker = new Proxy(NativeWorker, {
      construct(target, args) {
        if (String(args[0]).includes("pdf.worker")) probe.workers++;
        return Reflect.construct(target, args);
      },
    });
  });
  await page
    .getByRole("link", { name: /Sample Studio Supplier DEV-1001/ })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { finaiPdfProbe: { pending: boolean } })
            .finaiPdfProbe.pending,
      ),
    )
    .toBe(true);
  await page.getByRole("link", { name: "All invoices", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Supplier invoices", exact: true }),
  ).toBeVisible();
  const workers = await page.evaluate(async () => {
    const p = (
      window as unknown as {
        finaiPdfProbe: {
          release: () => void;
          finished: boolean;
          workers: number;
        };
      }
    ).finaiPdfProbe;
    p.release();
    while (!p.finished) await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    return p.workers;
  });
  expect(workers).toBe(0);
});

test("invoice workspace filters stay organized through refresh and clear without losing the queue", async ({
  page,
}) => {
  await open(page);
  const overview = page.getByRole("region", { name: "Invoice overview" });
  await expect(overview.getByRole("button")).toHaveCount(4);
  await overview.getByRole("button", { name: /^Needs review/ }).click();
  await expect(
    page.getByRole("tab", { name: "Review 2", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.getByPlaceholder("Supplier or invoice reference").fill("DEV-1006");
  await page.getByLabel("Invoice month").fill("2026-11");
  await page.getByLabel("Status", { exact: true }).selectOption("review");
  await page.getByLabel("Due on or before").fill("2026-12-31");
  await expect(
    page.getByRole("link", { name: /Sample Office Supplies DEV-1006/ }),
  ).toBeVisible();
  await expect(page).toHaveURL(/queue=review/);
  await page.reload();
  await expect(
    page.getByPlaceholder("Supplier or invoice reference"),
  ).toHaveValue("DEV-1006");
  await expect(page.getByLabel("Invoice month")).toHaveValue("2026-11");
  await expect(page.getByLabel("Status", { exact: true })).toHaveValue(
    "review",
  );
  await expect(page.getByLabel("Due on or before")).toHaveValue("2026-12-31");
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await expect(
    page.getByRole("tab", { name: "Review 2", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByPlaceholder("Supplier or invoice reference"),
  ).toHaveValue("");
  await expect(page.getByLabel("Invoice month")).toHaveValue("");
  await expect(
    page.getByRole("button", { name: "Clear filters", exact: true }),
  ).toHaveCount(0);
});

test("workspace queue summaries open the actual export workflow", async ({
  page,
}) => {
  await open(page);
  await page
    .getByRole("region", { name: "Invoice overview" })
    .getByRole("button", { name: /^Ready to export/ })
    .click();
  await expect(page).toHaveURL(/\/demo\/payables\/export/);
  await expect(
    page.getByRole("heading", { name: "Ready for accounting export" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /DEV-1004/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /DEV-1001/ })).toHaveCount(0);
  await page
    .getByRole("region", { name: "Invoice overview" })
    .getByRole("button", { name: /^All invoices/ })
    .click();
  await expect(page).toHaveURL(/\/demo\/payables\/invoices/);
  await expect(
    page.getByRole("tab", { name: "All 6", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
});

for (const width of [1440, 320]) {
  test(`organized invoice workspace contains its content at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await open(page);
    await expect(
      page.getByText("Sample workspace", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Development preview", { exact: true }),
    ).toHaveCount(0);
    const metrics = page.getByRole("region", { name: "Invoice overview" });
    await expect(metrics.getByRole("button")).toHaveCount(4);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    const month = await page.getByLabel("Invoice month").boundingBox();
    expect(month!.width).toBeLessThan(220);
    if (width > 900)
      await expect(
        page.getByRole("navigation", {
          name: "Invoice workspace",
          exact: true,
        }),
      ).toBeVisible();
    else
      await expect(
        page.getByRole("navigation", { name: "Payables", exact: true }),
      ).toBeVisible();
    await page.screenshot({
      path: `artifacts/payables/workspace-refresh-${width}.png`,
      fullPage: true,
    });
  });
}

test("invoice queues support arrow, Home and End keyboard navigation", async ({
  page,
}) => {
  await open(page);
  const all = page.getByRole("tab", { name: "All 6", exact: true });
  await all.focus();
  await page.keyboard.press("ArrowRight");
  const review = page.getByRole("tab", { name: "Review 2", exact: true });
  await expect(review).toBeFocused();
  await expect(review).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("End");
  await expect(
    page.getByRole("tab", { name: "Approve 0", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Home");
  await expect(all).toBeFocused();
  await expect(all).toHaveAttribute("aria-selected", "true");
});

test("removing a same-priced sample line retains valid input and persists the remaining draft", async ({
  page,
}) => {
  await open(page);
  await page
    .getByRole("link", { name: /Sample Studio Supplier DEV-1001/ })
    .click();
  await page
    .getByRole("button", { name: "Edit metadata", exact: true })
    .click();
  const form = page.getByRole("dialog");
  await form.getByRole("button", { name: "Add line", exact: true }).click();
  const second = form.getByRole("group", { name: "Line 2", exact: true });
  for (const [label, value] of [
    ["Description", "Retained equal-price line"],
    ["Expense account", "6000"],
    ["Tax account", "2200"],
    ["Payable account", "2100"],
    ["Cost centre", "Operations"],
    ["Unit price (GBP)", "100.00"],
  ])
    await second.getByLabel(label, { exact: true }).fill(value);
  const first = form.getByRole("group", { name: "Line 1", exact: true });
  await first.getByLabel("Unit price (GBP)").fill("100.");
  await first.getByRole("button", { name: "Remove line", exact: true }).click();
  await expect(form.getByLabel("Unit price (GBP)")).toHaveValue("100.00");
  await form.getByLabel("Total on supplier document (GBP)").fill("100.00");
  await form.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(form).toHaveCount(0);
  await expect(page.locator(".ap-total")).toHaveText("£100.00");
  await page.reload();
  await page
    .getByRole("button", { name: "Edit metadata", exact: true })
    .click();
  const restored = page.getByRole("dialog");
  await expect(restored.getByLabel("Unit price (GBP)")).toHaveValue("100.00");
  await expect(restored.getByLabel("Description", { exact: true })).toHaveValue(
    "Retained equal-price line",
  );
});

test("a duplicate sample invoice can be corrected and saved without discarding entered fields", async ({
  page,
}) => {
  await open(page);
  await page.getByRole("button", { name: "Add invoice", exact: true }).click();
  const form = page.getByRole("dialog");
  await form
    .getByLabel("Supplier", { exact: true })
    .selectOption({ label: "Sample Studio Supplier" });
  for (const [label, value] of [
    ["Supplier reference", "DEV-1001"],
    ["Invoice date", "2026-11-01"],
    ["Due date", "2026-12-01"],
    ["Total on supplier document (GBP)", "10.00"],
    ["Description", "Correctable sample invoice"],
    ["Unit price (GBP)", "10.00"],
    ["Expense account", "6000"],
    ["Tax account", "2200"],
    ["Payable account", "2100"],
    ["Cost centre", "Operations"],
  ])
    await form.getByLabel(label).fill(value);
  await form.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(form.getByRole("alert")).toContainText(
    "reference already exists",
  );
  await form.getByLabel("Supplier reference").fill("CORRECTED-SAMPLE-001");
  await form.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(form).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "CORRECTED-SAMPLE-001", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("Correctable sample invoice", { exact: true }),
  ).toBeVisible();
});
