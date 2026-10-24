import { test, expect } from "@playwright/test";
import { spawn } from "node:child_process";
for (const [mode, port, expected] of [
  ["api", 15376, "not configured for authenticated access"],
  ["invalid", 15377, "not configured correctly"],
] as const) {
  test(`receivables ${mode} configuration fails visibly without demo/API fallback`, async ({
    page,
  }) => {
    const server = spawn(
      process.execPath,
      [
        "node_modules/vite/bin/vite.js",
        "--host",
        "127.0.0.1",
        "--port",
        String(port),
        "--strictPort",
      ],
      {
        env: {
          ...process.env,
          VITE_RECEIVABLES_MODE: mode,
          VITE_AUTH_MODE: "",
          VITE_API_BASE_URL: "",
        },
        stdio: "ignore",
      },
    );
    const origin = `http://127.0.0.1:${port}`;
    try {
      await expect(async () => {
        expect((await fetch(origin)).status).toBe(200);
      }).toPass({ timeout: 10000 });
      const requests: string[] = [];
      page.on("request", (r) => {
        if (["fetch", "xhr"].includes(r.resourceType())) requests.push(r.url());
      });
      await page.goto(origin + "/welcome");
      await page.getByRole("button", { name: "Enter demo workspace" }).click();
      const card = page.locator(".outstanding-customers");
      await expect(card.getByRole("alert")).toContainText(expected);
      await expect(card.locator("dd,table,a")).toHaveCount(0);
      await expect(
        page.getByRole("heading", { name: "Recent activity", exact: true }),
      ).toBeVisible();
      expect(requests).toEqual([]);
    } finally {
      if (server.exitCode === null) {
        const done = new Promise<void>((r) => server.once("exit", () => r()));
        server.kill("SIGTERM");
        await done;
      }
    }
  });
}
