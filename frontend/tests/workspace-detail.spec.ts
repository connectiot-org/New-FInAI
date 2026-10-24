import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import {
  decimalCents,
  usdCents,
  invoiceCsv,
} from "../src/features/receivables/format";
const entityId = "22222222-2222-4222-8222-222222222222",
  snapshotId = "33333333-3333-4333-8333-333333333333",
  source = {
    snapshotId,
    version: 1,
    sourceName: "Approved register",
    sourceCapturedAt: "2026-10-23T00:00:00Z",
    importedAt: "2026-10-24T00:00:00Z",
  };
const row = {
  invoiceId: "INV-1",
  customerId: "external-customer",
  customerName: "Source customer",
  issuedOn: "2026-09-01",
  status: "Issued",
  amountCents: 75000,
  paidCents: 0,
  remainingCents: 75000,
};
function pageData(q: URLSearchParams, path: string) {
  const exporting = path.endsWith("/export");
  return {
    view: "invoice",
    entityId,
    period: q.get("period") || "all",
    currency: "USD",
    source,
    filters: {
      status: q.get("status") || "outstanding",
      customerId: q.get("customerId") || null,
      search: q.get("search") || "",
    },
    sort: "invoiceId:asc",
    offset: Number(q.get("offset") || 0),
    limit: exporting ? 10000 : Number(q.get("limit") || 20),
    total: 1,
    invoiceCount: 1,
    customerCount: 1,
    remainingCents: 75000,
    nextOffset: null,
    items: [row],
  };
}
test("CSV preserves exact safe-boundary cents and escapes hostile source identifiers", () => {
  expect(decimalCents(Number.MAX_SAFE_INTEGER)).toBe("90071992547409.91");
  expect(usdCents(Number.MAX_SAFE_INTEGER)).toBe("$90,071,992,547,409.91");
  const value = {
    ...pageData(new URLSearchParams(), "export"),
    source: { ...source, sourceName: "=SOURCE()" },
    items: [
      {
        ...row,
        customerName: "=1+1",
        invoiceId: "+cmd",
        amountCents: Number.MAX_SAFE_INTEGER,
        remainingCents: Number.MAX_SAFE_INTEGER,
      },
    ],
  };
  const csv = invoiceCsv(value);
  expect(csv).toContain('"\'=1+1"');
  expect(csv).toContain('"\'+cmd"');
  expect(csv).toContain("90071992547409.91");
  expect(() => invoiceCsv({ ...value, total: 2 })).toThrow("incomplete");
});
test("real private detail route shows pinned source and explicit CSV download with no demo links/cache", async ({
  page,
}) => {
  await page.route("**/api/v1/workspace/context", (r) =>
    r.fulfill({
      json: {
        userId: entityId,
        organisationId: entityId,
        organisationName: "Authorized workspace",
        administrator: false,
        revision: "a".repeat(64),
        entities: [
          {
            id: entityId,
            name: "Authorized entity",
            canWrite: true,
            canImport: false,
          },
        ],
      },
    }),
  );
  await page.route("**/auth/session", (r) =>
    r.fulfill({ json: { csrfToken: "a".repeat(64) } }),
  );
  await page.route("**/api/v1/entities", (r) =>
    r.fulfill({
      json: { items: [{ id: entityId, name: "Authorized entity" }] },
    }),
  );
  await page.route("**/api/v1/receivables/snapshots?*", (r) =>
    r.fulfill({
      json: {
        entityId,
        offset: 0,
        limit: 20,
        total: 1,
        nextOffset: null,
        items: [
          { ...source, importingActorId: entityId, digest: "a".repeat(64) },
        ],
      },
    }),
  );
  await page.route("**/api/v1/receivables/invoices?*", (r) =>
    r.fulfill({
      json: pageData(new URL(r.request().url()).searchParams, "invoices"),
    }),
  );
  await page.route("**/api/v1/receivables/export?*", (r) => {
    const value = pageData(new URL(r.request().url()).searchParams, "/export");
    return r.fulfill({
      json: {
        ...value,
        source: { ...source, sourceName: "=SOURCE()" },
        items: [
          {
            ...row,
            customerName: "=1+1",
            invoiceId: "+cmd",
            amountCents: Number.MAX_SAFE_INTEGER,
            remainingCents: Number.MAX_SAFE_INTEGER,
          },
        ],
        remainingCents: Number.MAX_SAFE_INTEGER,
      },
    });
  });
  await page.goto("/workspace/receivables/invoices");
  await expect(
    page.getByRole("cell", { name: "INV-1", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Snapshot: " + snapshotId, { exact: false }),
  ).toBeVisible();
  const downloaded = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export filtered invoices CSV" })
    .click();
  const file = await downloaded;
  const csv = await readFile((await file.path())!, "utf8");
  expect(csv).toContain('"\'=1+1"');
  expect(csv).toContain("90071992547409.91");
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await expect(page.locator("main")).not.toContainText("Northstar");
});
