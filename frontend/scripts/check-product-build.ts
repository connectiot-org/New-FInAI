import { spawnSync } from "node:child_process";
const cases = [
  [
    { VITE_APP_MODE: "product", VITE_AUTH_MODE: "local" },
    "Product builds require",
  ],
  [
    {
      VITE_APP_MODE: "product",
      VITE_AUTH_MODE: "session",
      VITE_API_BASE_URL: "http://127.0.0.1:3000/api/v1",
    },
    "Product builds require",
  ],
  [
    {
      VITE_APP_MODE: "product",
      VITE_AUTH_MODE: "session",
      VITE_CHECKLIST_MODE: "demo",
    },
    "Product builds require",
  ],
  [{ VITE_APP_MODE: "demo", VERCEL: "1" }, "Demo builds cannot"],
  [{ VITE_APP_MODE: "invalid" }, "Invalid VITE_APP_MODE"],
] as const;
for (const [overrides, message] of cases) {
  const result = spawnSync(
    process.execPath,
    ["node_modules/vite/bin/vite.js", "build"],
    {
      env: {
        ...process.env,
        VITE_API_BASE_URL: "/api/v1",
        VITE_CHECKLIST_MODE: "api",
        ...overrides,
      },
      encoding: "utf8",
    },
  );
  if (result.status === 0 || !(result.stdout + result.stderr).includes(message))
    throw new Error(
      "Unsafe build configuration was not rejected: " +
        JSON.stringify(overrides),
    );
}
console.log("PASS: 5 unsafe product/hosted-demo build configurations rejected");
