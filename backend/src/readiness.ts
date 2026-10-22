import type { Database } from "./database";
import { ApiError } from "./errors";
/** Probe migration completion and critical model columns without reading records. */
export async function requireReadySchema(db: Database) {
  const [state] = await db.$queryRaw<
    { completed: number; unfinished: number }[]
  >`
    SELECT COUNT(DISTINCT migration_name) FILTER (
      WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL AND migration_name IN (
        '202610190001_checklist', '202610210001_sessions', '202610220001_subscription_renewals'
      ))::int AS completed,
      COUNT(*) FILTER (WHERE finished_at IS NULL AND rolled_back_at IS NULL)::int AS unfinished
    FROM "_prisma_migrations"`;
  if (state.completed !== 3 || state.unfinished !== 0)
    throw new ApiError(
      503,
      "UNAVAILABLE",
      "Database migrations are not ready.",
    );
  await db.$queryRaw`
    SELECT t.create_digest, sr."renewalDate", sr.version, s."csrfHash", s."expiresAt",
      a."passwordHash", a.disabled, ea.can_write, m.active, e.id, o.id, u.id, r.count
    FROM "ChecklistTask" t, "SubscriptionRenewal" sr, "Session" s, "Account" a,
      "EntityAccess" ea, "Membership" m, "Entity" e, "Organisation" o, "User" u, "RateLimit" r
    LIMIT 0`;
}
