import { test } from "node:test";
import assert from "node:assert/strict";
import { readConfig } from "../src/config";
const local = {
  NODE_ENV: "development",
  CHECKLIST_IDENTITY: "local",
  API_HOST: "127.0.0.1",
  API_PORT: "3000",
  DATABASE_URL: "postgresql://unused@127.0.0.1/unused",
  FRONTEND_ORIGINS: "http://127.0.0.1:5173",
};
test("explicit local configuration accepts only bounded local settings", () => {
  assert.equal(readConfig(local).host, "127.0.0.1");
  for (const overrides of [
    { NODE_ENV: "production" },
    { NODE_ENV: undefined },
    { CHECKLIST_IDENTITY: undefined },
    { CHECKLIST_IDENTITY: "public" },
    { API_HOST: "0.0.0.0" },
    { API_PORT: "nope" },
    { FRONTEND_ORIGINS: "*" },
    { FRONTEND_ORIGINS: "http://127.0.0.1:5173/path" },
    { FRONTEND_ORIGINS: "https://public.example" },
    { VERCEL: "1" },
    { K_SERVICE: "public-service" },
  ])
    assert.throws(() => readConfig({ ...local, ...overrides }));
});
