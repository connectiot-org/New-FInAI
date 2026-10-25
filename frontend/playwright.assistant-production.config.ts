import { defineConfig } from "@playwright/test";
import base from "./playwright.session.config";
export default defineConfig({
  ...base,
  testMatch: /assistant-production\.spec\.ts/,
  timeout: 60000,
});
