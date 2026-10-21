import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({
  ...base,
  testIgnore: [],
  testMatch: /session-production\.spec\.ts/,
  workers: 1,
  fullyParallel: false,
  webServer: undefined,
  use: { ...base.use, ignoreHTTPSErrors: true },
  timeout: 45000,
});
