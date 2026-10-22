import { defineConfig, loadEnv, type Plugin } from "vite";
import { readFileSync } from "node:fs";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
const productIcon: Plugin = {
  name: "product-icon",
  configureServer(server) {
    server.middlewares.use("/favicon.svg", (_req, res) => {
      res.setHeader("Content-Type", "image/svg+xml");
      res.end(readFileSync(new URL("./public/favicon.svg", import.meta.url)));
    });
  },
  generateBundle() {
    this.emitFile({
      type: "asset",
      fileName: "favicon.svg",
      source: readFileSync(new URL("./public/favicon.svg", import.meta.url)),
    });
  },
};
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const appMode = env.VITE_APP_MODE || "product";
  if (!["product", "demo"].includes(appMode))
    throw new Error("Invalid VITE_APP_MODE");
  if (appMode === "demo" && process.env.VERCEL)
    throw new Error("Demo builds cannot be hosted as the product");
  const authMode =
    env.VITE_AUTH_MODE || (appMode === "product" ? "session" : "local");
  const checklistMode =
    appMode === "product" ? "api" : env.VITE_CHECKLIST_MODE || "demo";
  if (
    !["session", "local"].includes(authMode) ||
    !["api", "demo"].includes(checklistMode)
  )
    throw new Error("Invalid authentication or checklist mode");
  const apiBase =
    env.VITE_API_BASE_URL ||
    (command === "build" ? "/api/v1" : "http://127.0.0.1:3000/api/v1");
  if (
    command === "build" &&
    appMode === "product" &&
    (authMode !== "session" ||
      apiBase !== "/api/v1" ||
      env.VITE_CHECKLIST_MODE === "demo")
  )
    throw new Error(
      "Product builds require session authentication and the same-origin API",
    );
  return {
    define: {
      "import.meta.env.VITE_APP_MODE": JSON.stringify(appMode),
      "import.meta.env.VITE_AUTH_MODE": JSON.stringify(authMode),
      "import.meta.env.VITE_CHECKLIST_MODE": JSON.stringify(checklistMode),
      "import.meta.env.VITE_API_BASE_URL": JSON.stringify(apiBase),
    },
    publicDir: appMode === "demo" ? "public" : false,
    plugins: [
      react(),
      tailwindcss(),
      ...(appMode === "product" ? [productIcon] : []),
    ],
    server: { host: "0.0.0.0" },
    build: {
      rollupOptions: {
        output: {
          manualChunks:
            appMode === "demo"
              ? {
                  charts: ["recharts"],
                  routing: ["react-router-dom"],
                  state: ["@reduxjs/toolkit", "react-redux"],
                  primitives: [
                    "@radix-ui/react-dialog",
                    "@radix-ui/react-dropdown-menu",
                  ],
                  forms: ["react-hook-form", "zod", "@hookform/resolvers"],
                  table: ["@tanstack/react-table"],
                }
              : undefined,
        },
      },
    },
  };
});
