import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import {
  changesSchema,
  usdChangeCents,
  type ChangesPage,
} from "../src/features/receivables/changes";
const basic = JSON.parse(
  await readFile(
    "../contracts/receivables-examples/changes-basic.json",
    "utf8",
  ),
) as ChangesPage;
const e = basic.entityId,
  e2 = "22222222-2222-4222-8222-222222222223";
const defaultSources = [basic.toSource, basic.fromSource];
function result(q: URLSearchParams, sources = defaultSources) {
  const from =
      sources.find((s) => s.snapshotId === q.get("fromSnapshotId")) ||
      basic.fromSource,
    to =
      sources.find((s) => s.snapshotId === q.get("toSnapshotId")) ||
      basic.toSource;
  return from.snapshotId === to.snapshotId
    ? {
        ...basic,
        fromSource: from,
        toSource: to,
        laterOutstandingCents: basic.earlierOutstandingCents,
        deltaCents: "0",
        changedInvoiceCount: 0,
        items: [],
        bridge: {
          newInLaterCents: "0",
          absentFromLaterCents: "0",
          increasedCents: "0",
          decreasedCents: "0",
        },
      }
    : { ...basic, fromSource: from, toSource: to };
}
async function setup(page: Page, sources = defaultSources) {
  await page.route("**/auth/session", (r) =>
    r.fulfill({ json: { csrfToken: "a".repeat(64) } }),
  );
  await page.route("**/api/v1/workspace/context", (r) =>
    r.fulfill({
      json: {
        userId: e,
        organisationId: e,
        organisationName: "Comparison organisation",
        administrator: false,
        revision: "a".repeat(64),
        entities: [e, e2].map((id, i) => ({
          id,
          name: i ? "Second company" : "First company",
          canWrite: false,
          canImport: false,
        })),
      },
    }),
  );
  await page.route("**/api/v1/receivables/snapshots?*", (r) => {
    const q = new URL(r.request().url()).searchParams,
      items = q.get("entityId") === e2 ? [] : sources,
      offset = Number(q.get("offset") || 0);
    return r.fulfill({
      json: {
        entityId: q.get("entityId"),
        offset,
        limit: 20,
        total: items.length,
        nextOffset: offset + 20 < items.length ? offset + 20 : null,
        items: items.slice(offset, offset + 20).map((s) => ({
          ...s,
          importingActorId: e,
          digest: "a".repeat(64),
        })),
      },
    });
  });
  await page.route("**/api/v1/receivables/changes?*", (r) =>
    r.fulfill({
      json: result(new URL(r.request().url()).searchParams, sources),
    }),
  );
}
test("exact money formatting and strict response validation reject corrupt reconciliation, field labels and ordering", () => {
  expect(usdChangeCents("90071992547409910000")).toBe(
    "$900,719,925,474,099,100.00",
  );
  expect(usdChangeCents("-1", true)).toBe("−$0.01");
  expect(usdChangeCents("40000", true)).toBe("+$400.00");
  expect(changesSchema.safeParse(basic).success).toBe(true);
  for (const value of ["-0", "01", "1.5", "+1", 1])
    expect(
      changesSchema.safeParse({ ...basic, deltaCents: value }).success,
    ).toBe(false);
  for (const patch of [
    { deltaCents: "-39999" },
    { changedInvoiceCount: 0 },
    { sourceCutoffReversed: true },
    { items: [{ ...basic.items[0], changedFields: [] }] },
    { items: [{ ...basic.items[0], earlier: null }] },
  ])
    expect(changesSchema.safeParse({ ...basic, ...patch }).success).toBe(false);
});
test("defaults pin both sources, show full summary, hide changed selections, and link both immutable all-status registers", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/workspace/receivables/changes");
  const region = page.getByRole("region", {
    name: "Import comparison",
    exact: true,
  });
  await expect(
    region.getByRole("heading", { name: "Outstanding decreased by $400.00." }),
  ).toBeVisible();
  expect(new URL(page.url()).searchParams.get("fromSnapshotId")).toBe(
    basic.fromSource.snapshotId,
  );
  expect(new URL(page.url()).searchParams.get("toSnapshotId")).toBe(
    basic.toSource.snapshotId,
  );
  await expect(
    page.getByText("All invoice issue dates", { exact: false }),
  ).toBeVisible();
  await expect(
    region.locator(".change-summary").first().locator("dd"),
  ).toHaveText(["$2,550.00", "$2,150.00", "−$400.00"]);
  for (const side of ["earlier", "later"]) {
    const href = await region
        .getByRole("link", { name: `Open ${side} source register` })
        .getAttribute("href"),
      q = new URL(href!, "https://example.test").searchParams;
    expect(q.get("period")).toBe("all");
    expect(q.get("status")).toBe("all");
    expect(q.get("snapshotId")).toBe(
      side === "earlier"
        ? basic.fromSource.snapshotId
        : basic.toSource.snapshotId,
    );
  }
  await page
    .getByLabel("Later import", { exact: true })
    .selectOption(basic.fromSource.snapshotId);
  await expect(region).toHaveCount(0);
  await expect(
    page.getByText("Selection changed.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Compare selected imports" }).click();
  await expect(region).toContainText("The same source is selected");
  await expect(region).toContainText("No invoice changes");
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
});
test("a response for another entity is never shown under the selected company", async ({
  page,
}) => {
  await setup(page);
  await page.route("**/api/v1/receivables/changes?*", (r) =>
    r.fulfill({ json: { ...basic, entityId: e2 } }),
  );
  await page.goto("/workspace/receivables/changes");
  await expect(page.getByRole("alert")).toContainText(
    "different comparison scope",
  );
  await expect(
    page.getByRole("region", { name: "Import comparison", exact: true }),
  ).toHaveCount(0);
});
test("source choices paginate beyond the latest pair and reloading history never changes pinned IDs", async ({
  page,
}) => {
  const sources = Array.from({ length: 22 }, (_, i) => ({
    ...basic.fromSource,
    version: 22 - i,
    snapshotId: `00000000-0000-4000-8000-${String(22 - i).padStart(12, "0")}`,
    sourceName: `Saved source ${22 - i}`,
  }));
  await setup(page, sources);
  await page.goto("/workspace/receivables/changes");
  await expect(
    page.getByRole("region", { name: "Import comparison", exact: true }),
  ).toBeVisible();
  const pinned = page.url();
  await page.getByRole("button", { name: "Older source choices" }).click();
  await expect(
    page
      .getByLabel("Earlier import", { exact: true })
      .getByRole("option")
      .filter({ hasText: "Version 1 ·" }),
  ).toHaveCount(1);
  await page
    .getByLabel("Earlier import", { exact: true })
    .selectOption(sources[21].snapshotId);
  await page.getByRole("button", { name: "Compare selected imports" }).click();
  expect(page.url()).not.toBe(pinned);
  expect(new URL(page.url()).searchParams.get("fromSnapshotId")).toBe(
    sources[21].snapshotId,
  );
  const selected = page.url();
  await page.getByRole("button", { name: "Reload source choices" }).click();
  await expect(
    page.getByRole("region", { name: "Import comparison", exact: true }),
  ).toBeVisible();
  expect(page.url()).toBe(selected);
});
test("changed-row pagination preserves complete totals and exact signed amounts", async ({
  page,
}) => {
  await setup(page);
  await page.route("**/api/v1/receivables/changes?*", (r) => {
    const offset = Number(
      new URL(r.request().url()).searchParams.get("offset") || 0,
    );
    const items = Array.from({ length: 21 }, (_, i) => ({
      ...basic.items[0],
      invoiceId: `INV-${String(i).padStart(3, "0")}`,
    }));
    return r.fulfill({
      json: {
        ...basic,
        earlierOutstandingCents: "2100000",
        laterOutstandingCents: "1260000",
        deltaCents: "-840000",
        changedInvoiceCount: 21,
        unionInvoiceCount: 21,
        bridge: {
          newInLaterCents: "0",
          absentFromLaterCents: "0",
          increasedCents: "0",
          decreasedCents: "-840000",
        },
        offset,
        nextOffset: offset === 0 ? 20 : null,
        items: items.slice(offset, offset + 20),
      },
    });
  });
  await page.goto("/workspace/receivables/changes");
  const summary = page.locator(".change-summary").first().locator("dd");
  await expect(summary).toHaveText(["$21,000.00", "$12,600.00", "−$8,400.00"]);
  await expect(page.getByRole("rowheader")).toHaveCount(20);
  await page.getByRole("button", { name: "Next changes", exact: true }).click();
  await expect(page.getByRole("rowheader")).toHaveCount(1);
  await expect(page.getByRole("rowheader").first()).toContainText("INV-020");
  await expect(summary).toHaveText(["$21,000.00", "$12,600.00", "−$8,400.00"]);
  await expect(
    page.getByRole("button", { name: "Next changes", exact: true }),
  ).toBeDisabled();
});
test("empty and single-source states and safe provider-independent API errors offer deliberate retry", async ({
  page,
}) => {
  await setup(page, []);
  await page.goto("/workspace/receivables/changes");
  await expect(
    page.getByText("No invoice imports saved for this entity.", {
      exact: true,
    }),
  ).toBeVisible();
  await setup(page, [basic.fromSource]);
  await page.reload();
  await expect(
    page.getByText("Only one import is available.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Import comparison", exact: true }),
  ).toContainText("No invoice changes");
  for (const [status, message] of [
    [403, "You cannot read these sources."],
    [503, "Database is not connected."],
  ] as const) {
    await page.route("**/api/v1/receivables/changes?*", (r) =>
      r.fulfill({ status, json: { message } }),
    );
    await page.reload();
    await expect(page.getByRole("alert")).toContainText(message);
    await expect(
      page.getByRole("region", { name: "Import comparison", exact: true }),
    ).toHaveCount(0);
  }
  await page.route("**/api/v1/receivables/changes?*", (r) => r.abort());
  await page.getByRole("button", { name: "Retry comparison" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Cannot reach the backend",
  );
  await page.route("**/api/v1/receivables/changes?*", (r) =>
    r.fulfill({
      json: { ...basic, fromSource: basic.toSource, toSource: basic.toSource },
    }),
  );
  await page.getByRole("button", { name: "Retry comparison" }).click();
  await expect(page.getByRole("alert")).toContainText("inconsistent");
});
test("late source/entity reads cannot reveal prior private rows after a source change or logout", async ({
  page,
}) => {
  await setup(page);
  let release!: () => void, started!: () => void;
  const gate = new Promise<void>((r) => (release = r)),
    hit = new Promise<void>((r) => (started = r));
  await page.route("**/api/v1/receivables/changes?*", async (r) => {
    const q = new URL(r.request().url()).searchParams;
    if (q.get("fromSnapshotId") !== q.get("toSnapshotId")) {
      started();
      await gate;
    }
    await r.fulfill({ json: result(q) });
  });
  await page.goto("/workspace/receivables/changes");
  await hit;
  await page
    .getByLabel("Later import", { exact: true })
    .selectOption(basic.fromSource.snapshotId);
  await page.getByRole("button", { name: "Compare selected imports" }).click();
  await expect(
    page.getByRole("region", { name: "Import comparison", exact: true }),
  ).toContainText("No invoice changes");
  release();
  await expect(
    page.getByRole("rowheader", { name: "INV-001", exact: false }),
  ).toHaveCount(0);
  let releaseEntity!: () => void, entityStarted!: () => void;
  const entityGate = new Promise<void>((r) => (releaseEntity = r)),
    entityHit = new Promise<void>((r) => (entityStarted = r));
  await page.route("**/api/v1/receivables/changes?*", async (r) => {
    entityStarted();
    await entityGate;
    await r.fulfill({ json: result(new URL(r.request().url()).searchParams) });
  });
  await page.goto(
    `/workspace/receivables/changes?entityId=${e}&fromSnapshotId=${basic.fromSource.snapshotId}&toSnapshotId=${basic.toSource.snapshotId}`,
  );
  await entityHit;
  await page.getByLabel("Comparison entity").selectOption(e2);
  await expect(
    page.getByText("No invoice imports saved for this entity.", {
      exact: true,
    }),
  ).toBeVisible();
  releaseEntity();
  await expect(
    page.getByRole("region", { name: "Import comparison", exact: true }),
  ).toHaveCount(0);
  await page.route("**/auth/logout", (r) =>
    r.fulfill({ json: { status: "signed-out" } }),
  );
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Sign in to your finance workspace" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Import comparison", exact: true }),
  ).toHaveCount(0);
});
