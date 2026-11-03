import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({
  ...base,
  testIgnore: [],
  testMatch: /payables-development\.spec\.ts/,
  workers: 1,
  fullyParallel: false,
  use: { ...base.use, baseURL: "http://127.0.0.1:4173" },
  webServer: {
    command: "node artifacts/invoice-demo/serve.mjs",
    url: "http://127.0.0.1:4173/demo/invoices",
    reuseExistingServer: false,
  },
});
