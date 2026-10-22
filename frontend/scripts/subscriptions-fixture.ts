// Isolated synthetic PostgreSQL fixture, never the application schema.
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { PrismaClient } from "../../backend/node_modules/@prisma/client/default.js";
import { createApplication } from "../../backend/dist/src/app.js";
const initial = process.env.DATABASE_URL!;
if (!["127.0.0.1", "localhost"].includes(new URL(initial).hostname))
  throw new Error("Local test database required");
const schema = `renewals_${randomUUID().replaceAll("-", "")}`,
  admin = new PrismaClient({ datasourceUrl: initial }),
  url = new URL(initial);
url.searchParams.set("schema", schema);
process.env.DATABASE_URL = url.toString();
process.env.NODE_ENV = "test";
process.env.CHECKLIST_IDENTITY = "local";
process.env.API_HOST = "127.0.0.1";
process.env.API_PORT = "3002";
process.env.FRONTEND_ORIGINS = "http://127.0.0.1:5173";
await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
let app: Awaited<ReturnType<typeof createApplication>> | undefined,
  closing = false;
const stop = async () => {
  if (closing) return;
  closing = true;
  await app?.close();
  await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
  await admin.$disconnect();
  process.exit(0);
};
process.on("SIGTERM", () => void stop());
process.on("disconnect", () => void stop());
for (const args of [
  ["node_modules/prisma/build/index.js", "migrate", "deploy"],
  ["--import", "tsx", "prisma/seed.ts"],
]) {
  const result = spawnSync(process.execPath, args, {
    cwd: "../backend",
    env: process.env,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    await stop();
    throw new Error("Synthetic renewal database preparation failed");
  }
}
app = await createApplication({ quiet: true });
process.send?.({ ready: true });
process.on("message", async (command) => {
  if (command === "restart") {
    await app?.close();
    app = await createApplication({ quiet: true });
    process.send?.({ restarted: true });
  }
});
