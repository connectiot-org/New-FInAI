import { defineConfig } from "@playwright/test";
import base from "./playwright.session.config";
export default defineConfig({
  ...base,
  testMatch: /workspace(?:-changes)?-production\.spec\.ts/,
});
