import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { host: "0.0.0.0" },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          charts: ["recharts"],
          routing: ["react-router-dom"],
          state: ["@reduxjs/toolkit", "react-redux"],
          primitives: [
            "@radix-ui/react-dialog",
            "@radix-ui/react-dropdown-menu",
          ],
          forms: ["react-hook-form", "zod", "@hookform/resolvers"],
          table: ["@tanstack/react-table"],
        },
      },
    },
  },
});
