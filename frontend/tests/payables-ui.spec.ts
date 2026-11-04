import { test, expect, type Page } from "@playwright/test";
import { invoicePdf } from "../scripts/payables-pdf";
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
        documents: [
          {
            id: "55555555-5555-4555-8555-555555555555",
            filename: "supplier-invoice-" + "x".repeat(160) + ".pdf",
            digest: "a".repeat(64),
            scanState: "clean",
            revision: 1,
          },
        ],
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
    const documentMetadata = page.locator(".ap-document-row > div").first();
    await expect(documentMetadata).toBeVisible();
    expect(
      (await documentMetadata.boundingBox())!.width,
    ).toBeGreaterThanOrEqual(120);
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

function reviewedInvoiceDetail(
  scanState: "clean" | "infected" | "quarantined" = "clean",
  version = 1,
) {
  const line = {
    quantity: "1",
    taxCode: "STANDARD",
    taxBps: 2000,
    recoverable: true,
    account: "6000",
    taxAccount: "2200",
    payableAccount: "2100",
    costCentre: "Operations",
  };
  return {
    id: invoice,
    entityId: entity,
    supplier: { id: supplier, name: "Studio Supply Ltd", taxId: "TEST" },
    data: {
      supplierId: supplier,
      reference: "INV-2026-041",
      invoiceDate: "2026-11-01",
      dueDate: "2026-12-01",
      currency: "GBP",
      declaredGross: "3600",
      lines: [
        { ...line, description: "First line", unitMinor: "1000" },
        { ...line, description: "Second line", unitMinor: "2000" },
      ],
    },
    version,
    revision: version,
    state: "review",
    route: null,
    totals: {
      net: "3000",
      tax: "600",
      gross: "3600",
      recoverable: "600",
      matches: true,
      lines: [
        { net: "1000", tax: "200" },
        { net: "2000", tax: "400" },
      ],
    },
    documents: [
      {
        id: "55555555-5555-4555-8555-555555555555",
        filename: "controlled-review.pdf",
        digest: "a".repeat(64),
        scanState,
        revision: version,
      },
    ],
    events: [],
    exports: [],
    payment: "unpaid",
    capabilities: grants,
  };
}

test("controlled UI: removing an earlier invoice line keeps displayed and submitted money aligned", async ({
  page,
}) => {
  await setup(page);
  const detail = reviewedInvoiceDetail();
  let saved: Record<string, unknown> | undefined;
  await page.route("**/api/v1/payables/invoices/" + invoice, async (r) => {
    if (r.request().method() === "PATCH") {
      saved = r.request().postDataJSON();
      return r.fulfill({ json: { id: invoice } });
    }
    return r.fulfill({ json: detail });
  });
  await page.goto("/workspace/payables/invoices/" + invoice);
  await page
    .getByRole("button", { name: "Edit metadata", exact: true })
    .click();
  const form = page.getByRole("dialog", { name: "Edit invoice metadata" });
  await expect(
    form
      .getByRole("group", { name: "Line 1", exact: true })
      .getByLabel("Unit price (GBP)"),
  ).toHaveValue("10.00");
  await expect(
    form
      .getByRole("group", { name: "Line 2", exact: true })
      .getByLabel("Unit price (GBP)"),
  ).toHaveValue("20.00");
  await form
    .getByRole("group", { name: "Line 1", exact: true })
    .getByRole("button", { name: "Remove line", exact: true })
    .click();
  const remaining = form.getByRole("group", { name: "Line 1", exact: true });
  await expect(
    remaining.getByLabel("Description", { exact: true }),
  ).toHaveValue("Second line");
  // RED before correction: display is 10.00 although data.lines contains 2000.
  await expect(remaining.getByLabel("Unit price (GBP)")).toHaveValue("20.00");
  await remaining.getByLabel("Unit price (GBP)").fill("20.");
  await expect(remaining.getByLabel("Unit price (GBP)")).toHaveValue("20.");
  await remaining.getByLabel("Unit price (GBP)").pressSequentially("0");
  await expect(remaining.getByLabel("Unit price (GBP)")).toHaveValue("20.0");
  await remaining.getByLabel("Unit price (GBP)").fill("20.00");
  await form.getByLabel("Total on supplier document (GBP)").fill("24.00");
  await form.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect.poll(() => saved?.expectedVersion).toBe(1);
  expect(saved?.lines).toEqual([detail.data.lines[1]]);
  expect(saved?.declaredGross).toBe("2400");
});

test("controlled UI: removing an earlier policy rule keeps displayed and saved thresholds aligned", async ({
  page,
}) => {
  await setup(page);
  const definition = {
    currency: "GBP",
    rules: [
      {
        priority: 1,
        minimumGross: "500000",
        verifierId: null,
        approverIds: [user],
      },
      {
        priority: 2,
        minimumGross: "100000",
        verifierId: null,
        approverIds: [user],
      },
    ],
    fallback: { verifierId: null, approverIds: [user] },
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
    page
      .getByRole("group", { name: "Amount rule 2", exact: true })
      .getByLabel("Gross amount at least (GBP)"),
  ).toHaveValue("1000.00");
  await page
    .getByRole("button", { name: "Remove rule 1", exact: true })
    .click();
  const remaining = page.getByRole("group", {
    name: "Amount rule 1",
    exact: true,
  });
  await expect(remaining.getByLabel("Priority", { exact: true })).toHaveValue(
    "2",
  );
  // RED before correction: the reused row still displays 5000.00.
  await expect(remaining.getByLabel("Gross amount at least (GBP)")).toHaveValue(
    "1000.00",
  );
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect.poll(() => saved?.expectedVersion).toBe(3);
  expect(saved?.definition).toEqual({
    ...definition,
    rules: [definition.rules[1]],
  });
  expect(saved?.publish).toBe(false);
});

for (const verdict of ["infected", "quarantined"] as const) {
  test(`controlled UI: ${verdict} rescan removes the previously cleared PDF preview`, async ({
    page,
  }) => {
    await setup(page);
    const documentId = "55555555-5555-4555-8555-555555555555";
    let scanState: "clean" | "infected" | "quarantined" = "clean";
    let version = 1;
    let decision: Record<string, unknown> | undefined;
    await page.route("**/api/v1/payables/invoices/" + invoice, (r) =>
      r.fulfill({ json: reviewedInvoiceDetail(scanState, version) }),
    );
    await page.route(
      `**/api/v1/payables/invoices/${invoice}/documents/${documentId}`,
      (r) => r.fulfill({ contentType: "application/pdf", body: invoicePdf() }),
    );
    await page.route(
      `**/api/v1/payables/invoices/${invoice}/documents/${documentId}/scan`,
      async (r) => {
        decision = r.request().postDataJSON();
        scanState = verdict;
        version++;
        await r.fulfill({ json: { id: documentId, scanState } });
      },
    );
    await page.goto("/workspace/payables/invoices/" + invoice);
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    await expect(page.locator(".ap-pdf canvas")).toBeVisible();
    await page.getByRole("button", { name: "Rescan", exact: true }).click();
    // Wait for the NEW detail, rather than letting the transient loading state
    // falsely satisfy an absent-preview assertion.
    await expect(
      page.getByText(
        verdict === "infected"
          ? "Blocked · scanner detected a threat"
          : "Quarantined · awaiting document scan",
        { exact: true },
      ),
    ).toBeVisible();
    expect(decision?.expectedVersion).toBe(1);
    await expect(
      page.getByRole("button", { name: "Preview", exact: true }),
    ).toBeDisabled();
    // RED before correction: cached previewBlob produces a new PDF component.
    await expect(page.locator(".ap-pdf")).toHaveCount(0);
  });
}

test("controlled UI: pending invoice save freezes its submitted fields", async ({
  page,
}) => {
  await setup(page);
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let saved: Record<string, unknown> | undefined;
  await page.route("**/api/v1/payables/invoices/" + invoice, async (r) => {
    if (r.request().method() !== "PATCH")
      return r.fulfill({ json: reviewedInvoiceDetail() });
    saved = r.request().postDataJSON();
    await pending;
    return r.fulfill({ json: { id: invoice } });
  });
  await page.goto("/workspace/payables/invoices/" + invoice);
  await page
    .getByRole("button", { name: "Edit metadata", exact: true })
    .click();
  const form = page.getByRole("dialog");
  await form.getByLabel("Supplier reference").fill("UNCHANGED-DURING-SAVE");
  try {
    await form.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect.poll(() => saved?.reference).toBe("UNCHANGED-DURING-SAVE");
    await expect(form.getByLabel("Supplier reference")).toBeDisabled();
    await expect(
      form.locator(
        "input:not([readonly]):enabled, select:enabled, button:enabled",
      ),
    ).toHaveCount(0);
  } finally {
    release();
  }
  await expect(form).toHaveCount(0);
});

test("controlled UI: reloading unsafe metadata removes cached PDF bytes", async ({
  page,
}) => {
  await setup(page);
  let infected = false;
  await page.route("**/api/v1/payables/invoices/" + invoice, (r) =>
    r.fulfill({
      json: reviewedInvoiceDetail(
        infected ? "infected" : "clean",
        infected ? 2 : 1,
      ),
    }),
  );
  await page.route(
    `**/api/v1/payables/invoices/${invoice}/documents/55555555-5555-4555-8555-555555555555`,
    (r) => r.fulfill({ contentType: "application/pdf", body: invoicePdf() }),
  );
  await page.goto("/workspace/payables/invoices/" + invoice);
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.locator(".ap-pdf canvas")).toBeVisible();
  infected = true;
  await page.getByRole("button", { name: "Reload", exact: true }).click();
  await expect(
    page.getByText("Blocked · scanner detected a threat", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".ap-pdf")).toHaveCount(0);
});

for (const upload of [false, true]) {
  test(`controlled UI: ${upload ? "PDF upload" : "document rescan"} waits for its bounded scanner result`, async ({
    page,
  }) => {
    await setup(page);
    const documentId = "55555555-5555-4555-8555-555555555555";
    let completed = false;
    await page.route("**/api/v1/payables/invoices/" + invoice, (r) =>
      r.fulfill({
        json: reviewedInvoiceDetail(
          completed ? "quarantined" : "clean",
          completed ? 2 : 1,
        ),
      }),
    );
    const path = upload
      ? `**/api/v1/payables/invoices/${invoice}/documents?*`
      : `**/api/v1/payables/invoices/${invoice}/documents/${documentId}/scan`;
    await page.route(path, async (r) => {
      // Beyond the previous 15s upload / 10s rescan browser limits; the backend
      // can legitimately use two 10s scanner commands before persisting a verdict.
      await new Promise((resolve) =>
        setTimeout(resolve, upload ? 16000 : 11000),
      );
      completed = true;
      await r
        .fulfill({ json: { id: documentId, scanState: "quarantined" } })
        .catch(() => {});
    });
    await page.goto("/workspace/payables/invoices/" + invoice);
    if (upload)
      await page.getByLabel("Add original PDF").setInputFiles({
        name: "bounded-scan.pdf",
        mimeType: "application/pdf",
        buffer: invoicePdf(),
      });
    else
      await page.getByRole("button", { name: "Rescan", exact: true }).click();
    await expect(
      page.getByText("Quarantined · awaiting document scan", { exact: true }),
    ).toBeVisible({ timeout: 22000 });
    await expect(
      page.getByRole("button", { name: "Rescan", exact: true }),
    ).toBeEnabled();
    await expect(
      page.getByRole("button", { name: "Preview", exact: true }),
    ).toBeDisabled();
  });
}

test("controlled UI: the same PDF can be deliberately retried with its original operation ID", async ({
  page,
}) => {
  await setup(page);
  const pdf = invoicePdf();
  const operations: string[] = [];
  await page.route("**/api/v1/payables/invoices/" + invoice, (r) =>
    r.fulfill({ json: reviewedInvoiceDetail() }),
  );
  await page.route(
    `**/api/v1/payables/invoices/${invoice}/documents?*`,
    async (r) => {
      operations.push(
        new URL(r.request().url()).searchParams.get("operationId")!,
      );
      expect(r.request().postDataBuffer()).toEqual(pdf);
      if (operations.length === 1)
        return r.fulfill({
          status: 503,
          json: { message: "Temporary upload failure" },
        });
      return r.fulfill({
        json: {
          id: "55555555-5555-4555-8555-555555555555",
          scanState: "clean",
        },
      });
    },
  );
  await page.goto("/workspace/payables/invoices/" + invoice);
  const selectSameFile = () =>
    page.getByLabel("Add original PDF").evaluate((element, base64) => {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const transfer = new DataTransfer();
      transfer.items.add(
        new File([bytes], "retry.pdf", {
          type: "application/pdf",
          lastModified: 1700000000000,
        }),
      );
      const input = element as HTMLInputElement;
      input.files = transfer.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }, pdf.toString("base64"));
  await selectSameFile();
  await expect(page.getByRole("alert")).toHaveText("Temporary upload failure");
  await expect(page.getByLabel("Add original PDF")).toHaveValue("");
  await expect(page.getByLabel("Add original PDF")).toBeEnabled();
  await selectSameFile();
  await expect.poll(() => operations.length).toBe(2);
  expect(operations[1]).toBe(operations[0]);
  await expect(page.getByLabel("Add original PDF")).toHaveValue("");
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("controlled UI: company invoice filters restore from the URL and forward the exact scope", async ({
  page,
}) => {
  await setup(page);
  const queries: URLSearchParams[] = [];
  page.on("request", (r) => {
    const url = new URL(r.url());
    if (url.pathname === "/api/v1/payables/invoices")
      queries.push(url.searchParams);
  });
  await page.goto(
    `/workspace/payables/invoices?entityId=${entity}&queue=review&search=Studio&status=review&month=2026-11&dueBefore=2026-12-31`,
  );
  await expect(
    page.getByRole("link", { name: "Studio Supply Ltd INV-2026-041" }),
  ).toBeVisible();
  const last = () => queries.at(-1);
  expect(last()?.get("entityId")).toBe(entity);
  expect(last()?.get("queue")).toBe("review");
  expect(last()?.get("status")).toBe("review");
  expect(last()?.get("month")).toBe("2026-11");
  expect(last()?.get("dueBefore")).toBe("2026-12-31");
  await page.reload();
  await expect(
    page.getByPlaceholder("Supplier or invoice reference"),
  ).toHaveValue("Studio");
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await expect.poll(() => last()?.get("search")).toBe("");
  expect(last()?.get("queue")).toBe("review");
  expect(last()?.get("entityId")).toBe(entity);
  expect(last()?.has("dueBefore")).toBe(false);
});

test("controlled UI: register pagination refreshes and changing filters returns to the first page", async ({
  page,
}) => {
  await setup(page);
  await page.route("**/api/v1/payables/invoices?*", (r) => {
    const offset = Number(
      new URL(r.request().url()).searchParams.get("offset") || 0,
    );
    return r.fulfill({
      json: {
        counts: { all: 21, review: 21, verify: 0, approve: 0, export: 0 },
        total: 21,
        offset,
        limit: 20,
        items: Array.from({ length: Math.min(20, 21 - offset) }, (_, index) => {
          const row = offset + index + 1;
          return {
            id: `33333333-3333-4333-8333-${String(row).padStart(12, "0")}`,
            supplier: "Paging supplier",
            reference: `PAGE-${row}`,
            dueDate: "2026-12-01",
            invoiceDate: "2026-11-01",
            gross: "10000",
            currency: "GBP",
            state: "review",
            version: 1,
            attention: false,
          };
        }),
      },
    });
  });
  await page.goto("/workspace/payables/invoices");
  await expect(
    page.getByRole("link", { name: "Paging supplier PAGE-1", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page).toHaveURL(/offset=20/);
  await expect(
    page.getByRole("link", { name: "Paging supplier PAGE-21", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("21–21 of 21 invoices · GBP", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("link", { name: "Paging supplier PAGE-21", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Next", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Status", { exact: true }).selectOption("review");
  await expect(
    page.getByRole("link", { name: "Paging supplier PAGE-1", exact: true }),
  ).toBeVisible();
  expect(new URL(page.url()).searchParams.has("offset")).toBe(false);
});

test("controlled UI: changing company clears its previous queue, paging and member filters", async ({
  page,
}) => {
  await setup(page);
  const other = "22222222-2222-4222-8222-222222222223";
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
            name: "First company",
            canWrite: true,
            canImport: false,
          },
          {
            id: other,
            name: "Second company",
            canWrite: true,
            canImport: false,
          },
        ],
      },
    }),
  );
  const queries: URLSearchParams[] = [];
  page.on("request", (r) => {
    const url = new URL(r.url());
    if (url.pathname === "/api/v1/payables/invoices")
      queries.push(url.searchParams);
  });
  await page.goto(
    `/workspace/payables/invoices?entityId=${entity}&queue=review&status=review&assignee=${user}&offset=20&month=2026-11&search=Studio`,
  );
  await expect(
    page.getByRole("link", { name: "Studio Supply Ltd INV-2026-041" }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Company", exact: true })
    .selectOption(other);
  await expect.poll(() => queries.at(-1)?.get("entityId")).toBe(other);
  expect(queries.at(-1)?.get("offset")).toBe("0");
  expect(queries.at(-1)?.get("queue")).toBe("all");
  expect(queries.at(-1)?.has("assignee")).toBe(false);
  expect(queries.at(-1)?.has("status")).toBe(false);
  expect(queries.at(-1)?.get("month")).toBe("2026-11");
  expect(queries.at(-1)?.get("search")).toBe("Studio");
  const query = new URL(page.url()).searchParams;
  expect(query.has("offset")).toBe(false);
  expect(query.has("assignee")).toBe(false);
});

test("controlled UI: a stale last-page URL offers recovery without a backwards range", async ({
  page,
}) => {
  await setup(page);
  await page.route("**/api/v1/payables/invoices?*", (r) => {
    const offset = Number(
      new URL(r.request().url()).searchParams.get("offset") || 0,
    );
    return r.fulfill({
      json: {
        counts: { all: 1, review: 1, verify: 0, approve: 0, export: 0 },
        total: 1,
        offset,
        limit: 20,
        items: offset
          ? []
          : [
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
                attention: false,
              },
            ],
      },
    });
  });
  await page.goto("/workspace/payables/invoices?offset=20");
  await expect(
    page.getByRole("heading", {
      name: "No invoices on this page",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("0 of 1 invoices · GBP", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Go to first page", exact: true })
    .click();
  await expect(
    page.getByRole("link", {
      name: "Studio Supply Ltd INV-2026-041",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("1–1 of 1 invoices · GBP", { exact: true }),
  ).toBeVisible();
});

test("controlled UI: removing same-priced lines preserves the remaining row's own decimal draft", async ({
  page,
}) => {
  await setup(page);
  const detail = reviewedInvoiceDetail();
  detail.data.lines[1].unitMinor = "1000";
  detail.data.declaredGross = "2400";
  detail.totals = {
    ...detail.totals,
    net: "2000",
    tax: "400",
    gross: "2400",
    recoverable: "400",
    lines: [
      { net: "1000", tax: "200" },
      { net: "1000", tax: "200" },
    ],
  };
  let saved: Record<string, unknown> | undefined;
  await page.route("**/api/v1/payables/invoices/" + invoice, async (r) => {
    if (r.request().method() === "PATCH") {
      saved = r.request().postDataJSON();
      return r.fulfill({ json: { id: invoice } });
    }
    return r.fulfill({ json: detail });
  });
  await page.goto("/workspace/payables/invoices/" + invoice);
  await page
    .getByRole("button", { name: "Edit metadata", exact: true })
    .click();
  const form = page.getByRole("dialog");
  const first = form.getByRole("group", { name: "Line 1", exact: true });
  const second = form.getByRole("group", { name: "Line 2", exact: true });
  await second.getByLabel("Unit price (GBP)").fill("10.0");
  await first.getByLabel("Unit price (GBP)").fill("10.");
  await first.getByRole("button", { name: "Remove line", exact: true }).click();
  const remaining = form.getByRole("group", { name: "Line 1", exact: true });
  await expect(
    remaining.getByLabel("Description", { exact: true }),
  ).toHaveValue("Second line");
  await expect(remaining.getByLabel("Unit price (GBP)")).toHaveValue("10.0");
  await form.getByLabel("Total on supplier document (GBP)").fill("12.00");
  await form.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect.poll(() => saved?.declaredGross).toBe("1200");
  expect(saved?.lines).toEqual([detail.data.lines[1]]);
});

test("controlled UI: removing an edited rule cannot transfer its partial threshold draft", async ({
  page,
}) => {
  await setup(page);
  const definition = {
    currency: "GBP",
    rules: [
      {
        priority: 1,
        minimumGross: "500000",
        verifierId: null,
        approverIds: [user],
      },
      {
        priority: 2,
        minimumGross: "100000",
        verifierId: null,
        approverIds: [user],
      },
    ],
    fallback: { verifierId: null, approverIds: [user] },
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
  await page
    .getByRole("group", { name: "Amount rule 1", exact: true })
    .getByLabel("Gross amount at least (GBP)")
    .fill("1000.");
  await page
    .getByRole("button", { name: "Remove rule 1", exact: true })
    .click();
  const remaining = page.getByRole("group", {
    name: "Amount rule 1",
    exact: true,
  });
  await expect(remaining.getByLabel("Priority", { exact: true })).toHaveValue(
    "2",
  );
  await expect(remaining.getByLabel("Gross amount at least (GBP)")).toHaveValue(
    "1000.00",
  );
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect.poll(() => saved?.expectedVersion).toBe(3);
  expect(saved?.definition).toEqual({
    ...definition,
    rules: [definition.rules[1]],
  });
});

async function newInvoiceDraft(page: Page, reference: string) {
  await page.goto("/workspace/payables/invoices");
  await page.getByRole("button", { name: "Add invoice", exact: true }).click();
  const form = page.getByRole("dialog", { name: "Add invoice", exact: true });
  await form.getByLabel("Supplier", { exact: true }).selectOption(supplier);
  for (const [label, value] of [
    ["Supplier reference", reference],
    ["Invoice date", "2026-11-01"],
    ["Due date", "2026-12-01"],
    ["Total on supplier document (GBP)", "10.00"],
    ["Description", "Correctable invoice"],
    ["Unit price (GBP)", "10.00"],
    ["Expense account", "6000"],
    ["Tax account", "2200"],
    ["Payable account", "2100"],
    ["Cost centre", "Operations"],
  ])
    await form.getByLabel(label).fill(value);
  return form;
}

for (const [status, code] of [
  [422, "VALIDATION_FAILED"],
  [409, "DUPLICATE_REFERENCE"],
] as const) {
  test(`controlled UI: a rejected new invoice can be corrected after ${code}`, async ({
    page,
  }) => {
    await setup(page);
    const attempts: Record<string, unknown>[] = [];
    await page.route("**/api/v1/payables/invoices", async (r) => {
      attempts.push(r.request().postDataJSON());
      if (attempts.length === 1)
        return r.fulfill({
          status,
          json: {
            code,
            message: "Correct the invoice fields.",
            requestId: crypto.randomUUID(),
          },
        });
      return r.fulfill({ json: { id: invoice } });
    });
    const form = await newInvoiceDraft(page, "REJECTED-001");
    await form.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(form.getByRole("alert")).toHaveText(
      "Correct the invoice fields.",
    );
    await form.getByLabel("Supplier reference").fill("CORRECTED-001");
    await form.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect.poll(() => attempts.length).toBe(2);
    expect(attempts[1].id).toBe(attempts[0].id);
    expect(attempts[1].reference).toBe("CORRECTED-001");
    expect(attempts[1].lines).toEqual(attempts[0].lines);
    await expect(form).toHaveCount(0);
  });
}

for (const [status, code] of [
  [503, "UNAVAILABLE"],
  [409, "CONFLICT"],
] as const) {
  test(`controlled UI: an ambiguous new invoice retains its original payload after ${code}`, async ({
    page,
  }) => {
    await setup(page);
    const attempts: Record<string, unknown>[] = [];
    await page.route("**/api/v1/payables/invoices", async (r) => {
      attempts.push(r.request().postDataJSON());
      if (attempts.length === 1)
        return r.fulfill({
          status,
          json: {
            code,
            message: "The invoice outcome is unresolved.",
            requestId: crypto.randomUUID(),
          },
        });
      return r.fulfill({ json: { id: invoice } });
    });
    const form = await newInvoiceDraft(page, "UNCERTAIN-001");
    await form.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(form.getByRole("alert")).toHaveText(
      "The invoice outcome is unresolved.",
    );
    await form.getByLabel("Supplier reference").fill("DIFFERENT-002");
    await form.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(form.getByRole("alert")).toContainText(
      "Resolve the previous uncertain save",
    );
    expect(attempts).toHaveLength(1);
    await form.getByLabel("Supplier reference").fill("UNCERTAIN-001");
    await form.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect.poll(() => attempts.length).toBe(2);
    expect(attempts[1]).toEqual(attempts[0]);
    await expect(form).toHaveCount(0);
  });
}
