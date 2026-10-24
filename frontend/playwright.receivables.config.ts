import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({
  ...base,
  testIgnore: [],
  testMatch: /receivables-api\.spec\.ts/,
  workers: 1,
  fullyParallel: false,
  webServer: {
    command:
      "VITE_RECEIVABLES_MODE=api VITE_AUTH_MODE=session VITE_API_BASE_URL=/api/v1 npm run dev -- --port 5173 --strictPort",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: false,
  },
});
