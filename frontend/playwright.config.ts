import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testIgnore: /(?:checklist.*|session-production)\.spec\.ts/,
  fullyParallel: true,
  workers: 2,
  timeout: 45000,
  expect: { timeout: 7000 },
  use: {
    baseURL: "http://127.0.0.1:5173",
    browserName: "chromium",
    launchOptions: {
      executablePath:
        process.env.PLAYWRIGHT_CHROMIUM_PATH ||
        (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
      args: ["--no-sandbox"],
    },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev -- --port 5173",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: !process.env.CI,
  },
  reporter: [["list"], ["html", { open: "never" }]],
});
