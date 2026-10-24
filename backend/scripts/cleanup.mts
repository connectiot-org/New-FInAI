// Schedule only in a trusted operator runtime. No snapshots or audit records are deleted.
import { Database } from "../dist/src/database.js";
const db = new Database();
try {
  const args = process.argv.slice(2);
  if (args.some((a) => a !== "--apply"))
    throw new Error("Usage: cleanup.mts [--apply]");
  const apply = args.includes("--apply"),
    now = new Date();
  const result = await db.$transaction(async (tx) => {
    const sessions = { expiresAt: { lte: now } },
      stages = { expiresAt: { lte: now } },
      rates = { window: { lte: new Date(now.getTime() - 86400000) } };
    if (apply)
      return {
        sessions: (await tx.session.deleteMany({ where: sessions })).count,
        previews: (await tx.receivableImportStage.deleteMany({ where: stages }))
          .count,
        rateLimits: (await tx.rateLimit.deleteMany({ where: rates })).count,
      };
    return {
      sessions: await tx.session.count({ where: sessions }),
      previews: await tx.receivableImportStage.count({ where: stages }),
      rateLimits: await tx.rateLimit.count({ where: rates }),
    };
  });
  console.log(
    JSON.stringify({ mode: apply ? "applied" : "dry-run", ...result }),
  );
} catch {
  console.error(
    "Cleanup failed. Check trusted database configuration and build.",
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
