// Schedule only in a trusted operator runtime. No snapshots or audit records are deleted.
import { recordAudit } from "../dist/src/audit.js";
import { Database } from "../dist/src/database.js";
const db = new Database();
try {
  const args = process.argv.slice(2);
  if (args.some((a) => a !== "--apply"))
    throw new Error("Usage: cleanup.mts [--apply]");
  const apply = args.includes("--apply"),
    now = new Date();
  const result = await db.$transaction(
    async (tx) => {
      const sessions = { expiresAt: { lte: now } },
        stages = { expiresAt: { lte: now } },
        rates = { window: { lte: new Date(now.getTime() - 86400000) } };
      const expiredChats = await tx.assistantConversation.findMany({
        where: { expiresAt: { lte: now } },
        take: 100,
      });
      const expiredPreferences = await tx.assistantPreference.findMany({
        where: { expiresAt: { lte: now } },
        take: 100,
      });
      const expiredTurns = await tx.assistantTurn.findMany({
        where: {
          status: "pending",
          leaseUntil: { lte: now },
          conversation: { expiresAt: { gt: now } },
        },
        include: { conversation: true },
        take: 100,
      });
      if (apply) {
        for (const c of expiredChats) {
          await tx.assistantDeletion.create({
            data: {
              id: c.id,
              kind: "conversation",
              organisationId: c.organisationId,
              userId: c.userId,
              expiresAt: new Date(now.getTime() + 90 * 86400000),
            },
          });
          await tx.assistantConversation.delete({ where: { id: c.id } });
          await recordAudit(
            tx,
            { organisationId: c.organisationId, userId: c.userId },
            "assistant.retention_deleted",
            c.id,
            c.entityId,
            { reasonCode: "retention_30d" },
          );
        }
        for (const p of expiredPreferences) {
          await tx.assistantDeletion.create({
            data: {
              id: p.id,
              kind: "preference",
              organisationId: p.organisationId,
              userId: p.userId,
              expiresAt: new Date(now.getTime() + 90 * 86400000),
            },
          });
          await tx.assistantPreference.delete({ where: { id: p.id } });
          await recordAudit(
            tx,
            { organisationId: p.organisationId, userId: p.userId },
            "assistant.preference_expired",
            p.id,
            p.entityId,
            { reasonCode: "retention_365d" },
          );
        }
        for (const t of expiredTurns) {
          const changed = await tx.assistantTurn.updateMany({
            where: { id: t.id, status: "pending", leaseUntil: { lte: now } },
            data: {
              status: "failed",
              failureCode: "LEASE_EXPIRED",
              sessionHash: null,
              finishedAt: now,
            },
          });
          if (changed.count)
            await recordAudit(
              tx,
              {
                organisationId: t.conversation.organisationId,
                userId: t.conversation.userId,
              },
              "assistant.turn_expired",
              t.id,
              t.conversation.entityId,
              { reasonCode: "lease_expired" },
            );
        }
        await tx.assistantDeletion.deleteMany({
          where: { expiresAt: { lte: now } },
        });
        await tx.assistantBudget.deleteMany({
          where: { day: { lt: new Date(now.getTime() - 90 * 86400000) } },
        });
      }
      const assistant = {
        conversations: expiredChats.length,
        preferences: expiredPreferences.length,
        leases: expiredTurns.length,
      };
      if (apply)
        return {
          assistant,
          sessions: (await tx.session.deleteMany({ where: sessions })).count,
          previews: (
            await tx.receivableImportStage.deleteMany({ where: stages })
          ).count,
          rateLimits: (await tx.rateLimit.deleteMany({ where: rates })).count,
        };
      return {
        assistant,
        sessions: await tx.session.count({ where: sessions }),
        previews: await tx.receivableImportStage.count({ where: stages }),
        rateLimits: await tx.rateLimit.count({ where: rates }),
      };
    },
    { timeout: 30000 },
  );
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
