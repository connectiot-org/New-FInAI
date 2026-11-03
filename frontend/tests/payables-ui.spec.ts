import { test, expect, type Page } from "@playwright/test";
const entity = "22222222-2222-4222-8222-222222222222",
  user = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  invoice = "33333333-3333-4333-8333-333333333333",
  supplier = "44444444-4444-4444-8444-444444444444";
const grants = {
  view: true,
  review: true,
  verify: false,
  approve: false,
  manage: true,
};
async function setup(page: Page) {
  await page.route("**/auth/session", (r) =>
    r.fulfill({ json: { csrfToken: "a".repeat(64) } }),
  );
  await page.route("**/api/v1/workspace/context", (r) =>
    r.fulfill({
      json: {
        userId: user,
        organisationId: entity,
        organisationName: "Synthetic finance workspace",
        administrator: false,
        revision: "b".repeat(64),
        entities: [
          {
            id: entity,
            name: "FinAI UK · synthetic",
            canWrite: true,
            canImport: false,
          },
        ],
      },
    }),
  );
  await page.route("**/api/v1/payables/capabilities?*", (r) =>
    r.fulfill({
      json: {
        capabilities: grants,
        members: [{ id: user, verify: false, approve: true }],
        currency: "GBP",
      },
    }),
  );
  await page.route("**/api/v1/payables/suppliers?*", (r) =>
    r.fulfill({
      json: {
        items: [
          {
            id: supplier,
            name: "Studio Supply Ltd",
            taxId: "TEST",
            active: true,
            version: 1,
          },
        ],
      },
    }),
  );
  await page.route("**/api/v1/payables/invoices?*", (r) =>
    r.fulfill({
      json: {
        counts: { all: 1, review: 1, verify: 0, approve: 0, export: 0 },
        total: 1,
        offset: 0,
        limit: 20,
        items: [
          {
            id: invoice,
            supplier: "Studio Supply Ltd",
            reference: "INV-2026-041",
            dueDate: "2026-12-01",
            invoiceDate: "2026-11-01",
            gross: "12000",
            currency: "GBP",
            state: "review",
            version: 1,
            attention: true,
          },
        ],
      },
    }),
  );
  await page.route("**/api/v1/payables/invoices/" + invoice, (r) =>
    r.fulfill({
      json: {
        id: invoice,
        entityId: entity,
        supplier: { id: supplier, name: "Studio Supply Ltd", taxId: "TEST" },
        data: {
          supplierId: supplier,
          reference: "INV-2026-041",
          invoiceDate: "2026-11-01",
          dueDate: "2026-12-01",
          currency: "GBP",
          declaredGross: "12100",
          lines: [
            {
              description: "Monthly design services",
              quantity: "1",
              unitMinor: "10000",
              taxCode: "STANDARD",
              taxBps: 2000,
              recoverable: true,
              account: "6000",
              taxAccount: "2200",
              payableAccount: "2100",
              costCentre: "Operations",
            },
          ],
        },
        version: 1,
        revision: 1,
        state: "review",
        route: null,
        totals: {
          net: "10000",
          tax: "2000",
          gross: "12000",
          recoverable: "2000",
          matches: false,
          lines: [{ net: "10000", tax: "2000" }],
        },
        documents: [],
        events: [],
        exports: [],
        payment: "unpaid",
        capabilities: grants,
      },
    }),
  );
}
test("controlled UI: queues, metadata dialog keyboard focus, and visible mismatch block", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/workspace/payables/invoices");
  await expect(
    page.getByRole("link", { name: "Studio Supply Ltd INV-2026-041" }),
  ).toBeVisible();
  await expect(page.getByRole("tab", { name: "Review 1" })).toBeVisible();
  await page.getByRole("button", { name: "Add invoice", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Add invoice" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("link", { name: "Studio Supply Ltd INV-2026-041" })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "differs from calculated",
  );
  await expect(
    page.getByRole("button", { name: "Confirm details & submit" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Approve invoice", exact: true }),
  ).toHaveCount(0);
});
for (const width of [1440, 390, 320])
  test(`controlled UI: detail containment and screenshot ${width}`, async ({
    page,
  }) => {
    await setup(page);
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/workspace/payables/invoices/" + invoice);
    await expect(
      page.getByRole("heading", { name: "INV-2026-041" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBeTruthy();
    await page.screenshot({
      path: `artifacts/payables/detail-${width}.png`,
      fullPage: true,
    });
  });
test("controlled UI: permission failure has no fixture fallback", async ({
  page,
}) => {
  await setup(page);
  await page.route("**/api/v1/payables/capabilities?*", (r) =>
    r.fulfill({
      status: 404,
      json: {
        code: "NOT_FOUND",
        message: "Resource not found.",
        requestId: crypto.randomUUID(),
      },
    }),
  );
  await page.goto("/workspace/payables/invoices");
  await expect(page.getByRole("alert")).toHaveText("Resource not found.");
  await expect(
    page.getByRole("button", { name: "Add invoice", exact: true }),
  ).toHaveCount(0);
});

test("controlled UI: an identity change during CSRF lookup prevents the pending write", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/workspace/payables/suppliers");
  await expect(
    page.getByRole("heading", { name: "Suppliers", exact: true }),
  ).toBeVisible();
  let release!: () => void,
    pending = false,
    writes = 0;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/auth/session", async (r) => {
    pending = true;
    await gate;
    await r.fulfill({ json: { csrfToken: "a".repeat(64) } });
  });
  await page.route("**/api/v1/payables/suppliers", (r) => {
    writes++;
    return r.fulfill({ json: { id: supplier } });
  });
  await page.getByLabel("Legal / display name").fill("Pending supplier");
  await page.getByRole("button", { name: "Add supplier", exact: true }).click();
  await expect.poll(() => pending).toBe(true);
  await page.evaluate(async () => {
    const path = "/src/lib/session.ts";
    const session = await import(path);
    session.expireSession();
  });
  release();
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
  expect(writes).toBe(0);
});

test("controlled UI: supplier editing sends a versioned update", async ({
  page,
}) => {
  await setup(page);
  let update: Record<string, unknown> | undefined;
  await page.route("**/api/v1/payables/suppliers/" + supplier, async (r) => {
    update = r.request().postDataJSON();
    await r.fulfill({ json: { id: supplier } });
  });
  await page.goto("/workspace/payables/suppliers");
  await page.getByRole("button", { name: "Edit Studio Supply Ltd" }).click();
  await page
    .getByLabel("Supplier name", { exact: true })
    .fill("Studio Supply Limited");
  await page
    .getByRole("button", { name: "Save supplier", exact: true })
    .click();
  await expect.poll(() => update?.name).toBe("Studio Supply Limited");
  expect(update?.expectedVersion).toBe(1);
});
test("controlled UI: policy editor preserves every rule on draft save", async ({
  page,
}) => {
  await setup(page);
  const second = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  await page.route("**/api/v1/payables/capabilities?*", (r) =>
    r.fulfill({
      json: {
        capabilities: grants,
        members: [
          { id: user, name: "Reviewer", verify: true, approve: true },
          { id: second, name: "Budget owner", verify: true, approve: true },
        ],
        currency: "GBP",
      },
    }),
  );
  const definition = {
    currency: "GBP",
    rules: [
      {
        priority: 1,
        minimumGross: "500000",
        verifierId: null,
        approverIds: [user, second],
      },
      {
        priority: 2,
        minimumGross: "100000",
        verifierId: second,
        approverIds: [user],
      },
    ],
    fallback: { verifierId: null, approverIds: [second] },
  };
  let saved: Record<string, unknown> | undefined;
  await page.route("**/api/v1/payables/approval-policies?*", (r) =>
    r.fulfill({
      json: {
        item: {
          version: 3,
          draft: definition,
          published: definition,
          publishedVersion: 2,
        },
      },
    }),
  );
  await page.route("**/api/v1/payables/approval-policies", async (r) => {
    saved = r.request().postDataJSON();
    await r.fulfill({ json: { version: 4 } });
  });
  await page.goto("/workspace/payables/settings/approvals");
  await expect(
    page.getByRole("group", { name: "Amount rule 2" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect.poll(() => saved?.expectedVersion).toBe(3);
  expect(saved?.definition).toEqual(definition);
  expect(saved?.publish).toBe(false);
});
