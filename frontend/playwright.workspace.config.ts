import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({
  ...base,
  testIgnore: [],
  testMatch: /workspace(?:-detail)?\.spec\.ts/,
  workers: 1,
  fullyParallel: false,
  webServer: {
    command:
      "VITE_AUTH_MODE=session VITE_API_BASE_URL=/api/v1 VITE_CHECKLIST_MODE=api VITE_RECEIVABLES_MODE=api npm run dev -- --host 127.0.0.1 --port 5173 --strictPort",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: false,
  },
});
