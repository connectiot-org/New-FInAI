import { defineConfig } from "@playwright/test";
import base from "./playwright.workspace.config";
export default defineConfig({ ...base, testMatch: /assistant\.spec\.ts/ });
