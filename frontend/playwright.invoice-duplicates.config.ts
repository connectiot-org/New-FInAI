import { defineConfig } from "@playwright/test";
import base from "./playwright.subscriptions.config";
export default defineConfig({
  ...base,
  testMatch: /invoice-duplicates\.spec\.ts/,
  webServer: {
    ...base.webServer,
    command:
      "VITE_API_BASE_URL=http://127.0.0.1:3002/api/v1 npm run dev -- --host 127.0.0.1 --port 5173 --strictPort",
    url: "http://127.0.0.1:5173",
  },
});
