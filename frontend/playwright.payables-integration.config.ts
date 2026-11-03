import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({
  ...base,
  testIgnore: [],
  testMatch: /payables-integration\.spec\.ts/,
  workers: 1,
  fullyParallel: false,
  webServer: undefined,
  timeout: 120000,
  use: { ...base.use, ignoreHTTPSErrors: true, actionTimeout:15000 },
});
