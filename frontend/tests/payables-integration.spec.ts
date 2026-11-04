import { test, expect, type Page } from "@playwright/test";
import { fork, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { invoicePdf } from "../scripts/payables-pdf";
type Info = {
  organisationId: string;
  entityId: string;
  secondEntityId: string;
  actors: { username: string; userId: string }[];
  foreignInvoice: string;
  origin: string;
};
for (const mode of ["remote", "embedded", "packaged"])
  test.describe.serial(`real AP journey through ${mode} runtime`, () => {
    let child: ChildProcess, info: Info;
    test.beforeAll(async () => {
      child = fork("scripts/payables-fixture.ts", [], {
        execArgv: [
          "--env-file=../backend/.env",
          "--import",
          "../backend/node_modules/tsx/dist/loader.mjs",
        ],
        env: { ...process.env, FINAI_TEST_PAYABLES_MODE: mode },
        stdio: ["ignore", "pipe", "pipe", "ipc"],
      });
      let output = "";
      child.stdout?.on("data", (b) => {
        output = (output + b.toString()).slice(-3000);
      });
      child.stderr?.on("data", (b) => {
        output = (output + b.toString()).slice(-3000);
      });
      info = await new Promise<Info>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("AP fixture did not start: " + output)),
          60000,
        );
        child.on("message", (value: Info & { ready?: boolean }) => {
          if (value.ready) {
            clearTimeout(timer);
            resolve(value);
          }
        });
        child.once("exit", (code) => {
          clearTimeout(timer);
          reject(new Error(`AP fixture exited ${code}: ${output}`));
        });
      });
    });
    test.afterAll(async () => {
      if (child && child.exitCode === null && child.signalCode === null) {
        const closed = new Promise<void>((resolve) =>
          child.once("exit", () => resolve()),
        );
        child.kill("SIGTERM");
        await closed;
      }
    });
    const command = (command: string, userId?: string) =>
      new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("AP fixture command timeout")),
          15000,
        );
        const listener = (m: { command?: string; ok?: boolean }) => {
          if (m.command === command) {
            clearTimeout(timer);
            child.off("message", listener);
            if (m.ok) resolve();
            else reject(new Error("AP fixture command failed"));
          }
        };
        child.on("message", listener);
        child.send({ command, userId });
      });
    const login = async (page: Page, actor: number) => {
      await page.goto(info.origin + "/workspace/payables/invoices");
      await page.getByLabel("Account name").fill(info.actors[actor].username);
      await page.getByLabel("Organisation ID").fill(info.organisationId);
      await page
        .getByLabel("Password", { exact: true })
        .fill("synthetic-ap-password");
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "Invoices", exact: true }),
      ).toBeVisible();
    };
    const logout = async (page: Page) => {
      await page.getByRole("button", { name: "Sign out", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "Sign in", exact: true }),
      ).toBeVisible();
    };
    test("supplier PDF, mismatch correction, factual verification, two approvals, immutable export and restart", async ({
      page,
    }) => {
      await login(page, 0);
      await page.getByRole("link", { name: "Suppliers", exact: true }).click();
      await page
        .getByLabel("Legal / display name")
        .fill("Synthetic Studio Supplier");
      await page
        .getByLabel("Tax identifier", { exact: true })
        .fill("SYNTHETIC-TAX");
      await page
        .getByRole("button", { name: "Add supplier", exact: true })
        .click();
      await expect(
        page.getByRole("cell", {
          name: "Synthetic Studio Supplier",
          exact: true,
        }),
      ).toBeVisible();
      await page.getByRole("link", { name: "Invoices", exact: true }).click();
      await page
        .getByRole("button", { name: "Add invoice", exact: true })
        .click();
      const dialog = page.getByRole("dialog", { name: "Add invoice" });
      await dialog
        .getByLabel("Supplier", { exact: true })
        .selectOption({ label: "Synthetic Studio Supplier" });
      await dialog.getByLabel("Supplier reference").fill("AP-PILOT-001");
      await dialog.getByLabel("Invoice date").fill("2026-11-01");
      await dialog.getByLabel("Due date").fill("2026-12-01");
      await dialog
        .getByLabel("Total on supplier document (GBP)")
        .fill("1201.00");
      await dialog
        .getByLabel("Description", { exact: true })
        .fill("Synthetic design services");
      await dialog.getByLabel("Unit price (GBP)").fill("1000.00");
      await dialog.getByLabel("Expense account").fill("6000");
      await dialog.getByLabel("Tax account", { exact: true }).fill("2200");
      await dialog.getByLabel("Payable account").fill("2100");
      await dialog.getByLabel("Cost centre").fill("Operations");
      await dialog.getByLabel("Tax treatment").selectOption("STANDARD");
      await dialog.getByLabel("Tax recoverable").check();
      await dialog
        .getByRole("button", { name: "Save draft", exact: true })
        .click();
      await expect(dialog).toHaveCount(0);
      const id = new URL(page.url()).pathname.split("/").pop()!;
      await expect(page.getByRole("alert")).toContainText(
        "differs from calculated",
      );
      await page.getByLabel("Add original PDF").setInputFiles({
        name: "synthetic-invoice.pdf",
        mimeType: "application/pdf",
        buffer: invoicePdf(),
      });
      await expect(
        page.getByText("Synthetic test fixture", { exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Edit metadata", exact: true })
        .click();
      await page
        .getByRole("dialog")
        .getByLabel("Total on supplier document (GBP)")
        .fill("1200.00");
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Save draft", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(page.getByRole("alert")).toHaveCount(0);
      const document = (
        await page.evaluate(async (id) => {
          const r = await fetch("/api/v1/payables/invoices/" + id);
          return r.json();
        }, id)
      ).documents[0];
      const pdfDownload = page.waitForEvent("download");
      await page.getByRole("button", { name: "Download", exact: true }).click();
      expect(readFileSync((await (await pdfDownload).path())!)).toEqual(
        invoicePdf(),
      );
      await page.getByRole("button", { name: "Preview", exact: true }).click();
      const preview = page.locator(".ap-pdf canvas");
      await expect(preview).toBeVisible();
      await expect
        .poll(() =>
          preview.evaluate((element) => {
            const canvas = element as HTMLCanvasElement;
            const data = canvas
              .getContext("2d")!
              .getImageData(0, 0, canvas.width, canvas.height).data;
            let ink = 0;
            for (let i = 0; i < data.length; i += 4)
              if (
                data[i + 3] > 0 &&
                data[i] < 180 &&
                data[i + 1] < 180 &&
                data[i + 2] < 180
              )
                ink++;
            return ink;
          }),
        )
        .toBeGreaterThan(100);
      if (mode === "remote")
        for (const width of [1440, 390, 320]) {
          await page.setViewportSize({ width, height: 1000 });
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth + 1,
            ),
          ).toBeTruthy();
          expect(
            (await page
              .locator(".ap-document-row > div")
              .first()
              .boundingBox())!.width,
          ).toBeGreaterThanOrEqual(120);
          await page.screenshot({
            path: `artifacts/payables/live-${width}.png`,
            fullPage: true,
          });
        }
      await page
        .getByRole("button", { name: "Confirm details & submit" })
        .click();
      await expect(
        page.locator(".ap-status").filter({ hasText: "Awaiting verification" }),
      ).toBeVisible();
      await logout(page);
      await login(page, 1);
      await page.goto(info.origin + "/workspace/payables/invoices/" + id);
      await expect(
        page.getByRole("button", { name: "Approve invoice", exact: true }),
      ).toHaveCount(0);
      await page
        .getByRole("button", { name: "Verify delivery", exact: true })
        .click();
      await expect(
        page.locator(".ap-status").filter({ hasText: "Awaiting approval" }),
      ).toBeVisible();
      await logout(page);
      await login(page, 2);
      await page.goto(info.origin + "/workspace/payables/invoices/" + id);
      await page
        .getByRole("button", { name: "Approve invoice", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Approve invoice", exact: true }),
      ).toHaveCount(0);
      await expect(
        page.locator(".ap-status").filter({ hasText: "Awaiting approval" }),
      ).toBeVisible();
      await logout(page);
      await login(page, 3);
      await page.goto(info.origin + "/workspace/payables/invoices/" + id);
      await page
        .getByRole("button", { name: "Approve invoice", exact: true })
        .click();
      await expect(
        page.locator(".ap-status").filter({ hasText: "Approved" }),
      ).toBeVisible();
      await logout(page);
      await login(page, 0);
      await page.goto(info.origin + "/workspace/payables/invoices/" + id);
      const download = page.waitForEvent("download");
      await page
        .getByRole("button", { name: "Prepare accounting export" })
        .click();
      const csv = readFileSync((await (await download).path())!, "utf8");
      const rows = csv
        .trim()
        .split("\r\n")
        .slice(1)
        .map((r) => r.split(",").map((v) => v.slice(1, -1)));
      expect(rows.reduce((n, r) => n + BigInt(r[5]) - BigInt(r[6]), 0n)).toBe(
        0n,
      );
      expect(csv).toContain("AP-PILOT-001");
      const first = await page.evaluate(
        async (id) =>
          (await (await fetch("/api/v1/payables/invoices/" + id)).json())
            .exports[0].id,
        id,
      );
      await command("restart");
      await page.reload();
      await expect(
        page.locator(".ap-status").filter({ hasText: "Approved" }),
      ).toBeVisible();
      const again = page.waitForEvent("download");
      await page
        .getByRole("button", { name: "Prepare accounting export" })
        .click();
      await again;
      const current = await page.evaluate(
        async (id) =>
          await (await fetch("/api/v1/payables/invoices/" + id)).json(),
        id,
      );
      expect(current.exports).toHaveLength(1);
      expect(current.exports[0].id).toBe(first);
      expect(current.documents[0].digest).toBe(document.digest);
      expect(
        await page.evaluate(
          async (foreign) =>
            (await fetch("/api/v1/payables/invoices/" + foreign)).status,
          info.foreignInvoice,
        ),
      ).toBe(404);
      const noCsrf = await page.evaluate(
        async (id) =>
          (
            await fetch("/api/v1/payables/invoices/" + id + "/exports", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                operationId: crypto.randomUUID(),
                expectedVersion: 1,
              }),
            })
          ).status,
        id,
      );
      expect(noCsrf).toBe(403);
    });
    test("FinAI invoice context, explicit confirmation, ambiguous retry and stale proposal through real sessions", async ({
      page,
    }) => {
      await login(page, 0);
      const api = (method: string, path: string, body?: unknown) =>
        page.evaluate(
          async ({ method, path, body }) => {
            const csrfToken = (await (await fetch("/auth/session")).json())
              .csrfToken;
            const response = await fetch("/api/v1/payables" + path, {
              method,
              headers: {
                "Content-Type": "application/json",
                "X-CSRF-Token": csrfToken,
              },
              ...(body ? { body: JSON.stringify(body) } : {}),
            });
            return { status: response.status, body: await response.json() };
          },
          { method, path, body },
        );
      const supplierId = crypto.randomUUID(),
        invoiceId = crypto.randomUUID();
      expect(
        (
          await api("POST", "/suppliers", {
            id: supplierId,
            entityId: info.secondEntityId,
            name: "Assistant company B supplier",
            taxId: "TEST",
          })
        ).status,
      ).toBe(201);
      const data = {
        supplierId,
        reference: "ASSISTANT-B-001",
        invoiceDate: "2026-11-01",
        dueDate: "2026-12-01",
        currency: "GBP",
        declaredGross: "10000",
        lines: [
          {
            description: "Synthetic Assistant service",
            quantity: "1",
            unitMinor: "10000",
            taxCode: "NONE",
            taxBps: 0,
            recoverable: false,
            account: "6000",
            taxAccount: "2200",
            payableAccount: "2100",
            costCentre: "Operations",
          },
        ],
      };
      expect(
        (
          await api("POST", "/invoices", {
            id: invoiceId,
            entityId: info.secondEntityId,
            ...data,
          })
        ).status,
      ).toBe(201);
      await page.goto(
        `${info.origin}/workspace/payables/invoices/${invoiceId}?entityId=${info.secondEntityId}`,
      );
      await expect(
        page.getByRole("combobox", { name: "Company", exact: true }),
      ).toHaveValue(info.secondEntityId);
      await page
        .getByRole("link", { name: "Ask FinAI about this invoice" })
        .click();
      await expect(
        page.getByLabel("Assistant entity", { exact: true }),
      ).toHaveValue(info.secondEntityId);
      await expect(
        page.getByLabel("Assistant currency", { exact: true }),
      ).toHaveValue("GBP");
      await expect(
        page.getByLabel("Assistant month", { exact: true }),
      ).toHaveValue("2026-11");
      await page
        .getByRole("button", { name: "New conversation", exact: true })
        .click();
      await expect(page.getByLabel("Ask FinAI", { exact: true })).toHaveValue(
        `Explain supplier invoice ${invoiceId} and its approval readiness.`,
      );
      const question = page.getByLabel("Ask FinAI", { exact: true });
      await question.fill(
        'Find supplier invoices matching "Assistant company B supplier"',
      );
      await page
        .getByRole("button", { name: "Send question", exact: true })
        .click();
      await page
        .getByText("Answer basis and sources", { exact: true })
        .last()
        .click();
      const source = page.getByRole("link", {
        name: "2026-11 supplier invoice register",
        exact: true,
      });
      await expect(source).toHaveAttribute(
        "href",
        /search=assistant\+company\+b\+supplier/,
      );
      await source.click();
      await expect(
        page.getByRole("combobox", { name: "Company", exact: true }),
      ).toHaveValue(info.secondEntityId);
      await expect(
        page.getByPlaceholder("Supplier or invoice reference"),
      ).toHaveValue("assistant company b supplier");
      await expect(
        page.getByRole("link", { name: /ASSISTANT-B-001/ }),
      ).toBeVisible();
      await page.goBack();
      await expect(page.getByLabel("Ask FinAI", { exact: true })).toBeVisible();

      await question.fill(
        `Propose correction for supplier invoice ${invoiceId}`,
      );
      await page
        .getByRole("button", { name: "Send question", exact: true })
        .click();
      const proposal = page
        .getByRole("region", { name: "Proposed action: Request correction" })
        .last();
      await expect(proposal).toBeVisible();
      expect((await api("GET", "/invoices/" + invoiceId)).body.version).toBe(1);
      await proposal
        .getByRole("button", { name: "Review proposed action" })
        .click();
      let dialog = page.getByRole("dialog", { name: "Confirm invoice action" });
      await expect(
        dialog.getByRole("button", {
          name: "Confirm invoice action",
          exact: true,
        }),
      ).toBeDisabled();
      for (const width of [320, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
        ).toBeTruthy();
        const bounds = await dialog.boundingBox();
        expect(bounds!.x).toBeGreaterThanOrEqual(15);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
        await page.screenshot({
          path: `artifacts/payables/assistant-confirmation-${mode}-${width}.png`,
          fullPage: true,
        });
      }
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      expect((await api("GET", "/invoices/" + invoiceId)).body.version).toBe(1);
      await proposal
        .getByRole("button", { name: "Review proposed action" })
        .click();
      dialog = page.getByRole("dialog", { name: "Confirm invoice action" });
      await dialog
        .getByLabel("Reason", { exact: true })
        .fill("Supplier coding needs correction");
      const payloads: unknown[] = [];
      await page.route(
        "**/api/v1/payables/invoices/*/assistant-actions",
        async (route) => {
          payloads.push(route.request().postDataJSON());
          if (payloads.length === 1) {
            await route.fetch();
            await route.abort("failed");
          } else await route.continue();
        },
      );
      await dialog
        .getByRole("button", { name: "Confirm invoice action", exact: true })
        .click();
      await expect(dialog.getByRole("alert")).toContainText(
        "outcome is uncertain",
      );
      expect((await api("GET", "/invoices/" + invoiceId)).body.version).toBe(2);
      await dialog
        .getByRole("button", { name: "Retry same confirmation", exact: true })
        .click();
      await expect(proposal.getByRole("status")).toContainText(
        "Recorded: review, version 2",
      );
      expect(payloads).toHaveLength(2);
      expect(payloads[1]).toEqual(payloads[0]);
      expect(
        (await api("GET", "/invoices/" + invoiceId)).body.events.filter(
          (e: { action: string }) => e.action === "correction",
        ),
      ).toHaveLength(1);
      await page.unroute("**/api/v1/payables/invoices/*/assistant-actions");
      await question.fill(
        `Propose correction for supplier invoice ${invoiceId}`,
      );
      await page
        .getByRole("button", { name: "Send question", exact: true })
        .click();
      const next = page
        .getByRole("region", { name: "Proposed action: Request correction" })
        .last();
      await expect(
        next.getByRole("button", { name: "Review proposed action" }),
      ).toBeVisible();
      expect(
        (
          await api("PATCH", "/invoices/" + invoiceId, {
            ...data,
            expectedVersion: 2,
          })
        ).status,
      ).toBe(200);
      await next
        .getByRole("button", { name: "Review proposed action" })
        .click();
      dialog = page.getByRole("dialog", { name: "Confirm invoice action" });
      await dialog
        .getByLabel("Reason", { exact: true })
        .fill("Recheck current source");
      await dialog
        .getByRole("button", { name: "Confirm invoice action", exact: true })
        .click();
      await expect(dialog.getByRole("alert")).toContainText("record changed");
      await expect(
        dialog.getByRole("button", {
          name: "Retry same confirmation",
          exact: true,
        }),
      ).toBeDisabled();
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      expect((await api("GET", "/invoices/" + invoiceId)).body.version).toBe(3);
      await next.getByRole("link", { name: "Open current invoice" }).click();
      await expect(
        page.getByRole("combobox", { name: "Company", exact: true }),
      ).toHaveValue(info.secondEntityId);
      await expect(
        page.getByRole("heading", { name: "ASSISTANT-B-001", exact: true }),
      ).toBeVisible();
    });
    test("real HTTP retries, totals, assignment, CSRF, grants and scope controls", async ({
      page,
    }) => {
      await login(page, 0);
      const api = async (method: string, path: string, body?: unknown) =>
        page.evaluate(
          async ({ method, path, body }) => {
            const headers: Record<string, string> = {};
            if (method !== "GET") {
              headers["Content-Type"] = "application/json";
              headers["X-CSRF-Token"] = (
                await (await fetch("/auth/session")).json()
              ).csrfToken;
            }
            const r = await fetch("/api/v1/payables" + path, {
              method,
              headers,
              ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            });
            return { status: r.status, data: await r.json() };
          },
          { method, path, body },
        );
      const supplierId = crypto.randomUUID();
      expect(
        (
          await api("POST", "/suppliers", {
            id: supplierId,
            entityId: info.entityId,
            name: "HTTP synthetic supplier",
            taxId: "TEST",
          })
        ).status,
      ).toBe(201);
      const example = JSON.parse(
          readFileSync("../contracts/payables-examples/bill.json", "utf8"),
        ),
        bill = {
          ...example,
          id: crypto.randomUUID(),
          entityId: info.entityId,
          supplierId,
          reference: "HTTP-001",
        };
      expect((await api("POST", "/invoices", bill)).status).toBe(201);
      expect((await api("POST", "/invoices", bill)).status).toBe(201);
      expect(
        (await api("POST", "/invoices", { ...bill, reference: "CHANGED" }))
          .status,
      ).toBe(409);
      expect(
        (await api("POST", "/invoices", { ...bill, id: crypto.randomUUID() }))
          .status,
      ).toBe(409);
      expect(
        (
          await api("POST", "/invoices", {
            ...bill,
            id: crypto.randomUUID(),
            reference: "USD",
            currency: "USD",
          })
        ).status,
      ).toBe(422);
      const list = await api(
        "GET",
        "/invoices?" +
          new URLSearchParams({
            entityId: info.entityId,
            search: "HTTP-",
            limit: "1",
          }),
      );
      expect(list.status).toBe(200);
      expect(list.data.items).toHaveLength(1);
      expect(list.data.counts.all).toBe(list.data.total);
      expect(list.data.items[0].attention).toBe(true);
      const file = {
          entityId: info.entityId,
          operationId: crypto.randomUUID(),
          expectedVersion: "1",
          filename: "original.pdf",
        },
        path =
          `/api/v1/payables/invoices/${bill.id}/documents?` +
          new URLSearchParams(file);
      const upload = async (csrf = true) =>
        page.evaluate(
          async ({ path, pdf, csrf }) => {
            const token = (await (await fetch("/auth/session")).json())
                .csrfToken,
              r = await fetch(path, {
                method: "POST",
                headers: {
                  "Content-Type": "application/pdf",
                  ...(csrf ? { "X-CSRF-Token": token } : {}),
                },
                body: Uint8Array.from(atob(pdf), (c) => c.charCodeAt(0)),
              });
            return { status: r.status, data: await r.json() };
          },
          { path, pdf: invoicePdf().toString("base64"), csrf },
        );
      expect((await upload(false)).status).toBe(403);
      const original = await upload();
      expect(original.status).toBe(201);
      expect((await upload()).data.id).toBe(original.data.id);
      expect(
        (
          await api("POST", `/invoices/${bill.id}/actions`, {
            operationId: crypto.randomUUID(),
            expectedVersion: 2,
            action: "review",
          })
        ).status,
      ).toBe(201);
      const pending = await api("GET", "/invoices/" + bill.id);
      expect(pending.data.route.verified).toBe(true);
      expect(pending.data.state).toBe("approve");
      expect(
        (
          await api("POST", `/invoices/${bill.id}/actions`, {
            operationId: crypto.randomUUID(),
            expectedVersion: 3,
            action: "approve",
          })
        ).status,
      ).toBe(403);
      const access = await api("GET", "/grants?entityId=" + info.entityId);
      expect(access.status).toBe(200);
      expect(access.data.items).toHaveLength(4);
      expect(
        (
          await api("POST", "/grants", {
            entityId: info.entityId,
            userId: info.actors[0].userId,
            view: true,
            review: true,
            verify: true,
            approve: true,
            manage: true,
          })
        ).status,
      ).toBe(403);
      const verifierContext = await page.context().browser()!.newContext();
      try {
        const verifierPage = await verifierContext.newPage();
        await login(verifierPage, 1);
        expect(
          (
            await api("POST", "/grants", {
              entityId: info.entityId,
              userId: info.actors[1].userId,
              view: true,
              review: false,
              verify: true,
              approve: false,
              manage: false,
            })
          ).status,
        ).toBe(201);
        expect(
          await verifierPage.evaluate(
            async () => (await fetch("/auth/session")).status,
          ),
        ).toBe(401);
      } finally {
        await verifierContext.close();
      }
      await logout(page);
      await login(page, 2);
      const decisions = await Promise.all(
        [1, 2].map(() =>
          api("POST", `/invoices/${bill.id}/actions`, {
            operationId: crypto.randomUUID(),
            expectedVersion: 3,
            action: "approve",
          }),
        ),
      );
      expect(decisions.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(
        (await api("GET", "/invoices/" + info.foreignInvoice)).status,
      ).toBe(404);
      await command("revoke", info.actors[2].userId);
      expect(
        (
          await api("POST", `/invoices/${bill.id}/actions`, {
            operationId: crypto.randomUUID(),
            expectedVersion: 4,
            action: "approve",
          })
        ).status,
      ).toBe(403);
      await logout(page);
      await login(page, 0);
      const removed = await page.evaluate(
        async ({ entityId, userId }) => {
          const session = await (await fetch("/auth/session")).json();
          const r = await fetch("/api/v1/admin/access", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-CSRF-Token": session.csrfToken,
            },
            body: JSON.stringify({
              entityId,
              userId,
              access: false,
              canWrite: false,
              canImport: false,
              expectedVersion: 1,
            }),
          });
          return r.status;
        },
        { entityId: info.entityId, userId: info.actors[2].userId },
      );
      expect(removed).toBe(201);
      const remaining = await api("GET", "/grants?entityId=" + info.entityId);
      expect(remaining.data.items).toHaveLength(3);
    });
  });
