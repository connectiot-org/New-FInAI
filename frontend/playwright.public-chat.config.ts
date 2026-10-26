import { defineConfig } from "@playwright/test";
import base from "./playwright.session.config";
export default defineConfig({
  ...base,
  testMatch: /public-chat\.spec\.ts/,
  timeout: 45000,
});
