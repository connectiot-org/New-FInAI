import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({
  ...base,
  testIgnore: [],
  testMatch: /checklist\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  webServer: {
    command:
      "VITE_CHECKLIST_MODE=api VITE_API_BASE_URL=http://127.0.0.1:3001/api/v1 npm run dev -- --port 5173 --strictPort",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: false,
  },
});
