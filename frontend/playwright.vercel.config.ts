import { defineConfig } from "@playwright/test";
import base from "./playwright.session.config";
export default defineConfig({
  ...base,
  testMatch: /vercel-backend\.spec\.ts/,
  timeout: 60000,
  workers: 1,
  fullyParallel: false,
});
