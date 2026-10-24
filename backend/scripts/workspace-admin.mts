// Trusted database operator only. Default dry run. Never exposes passwords or sessions.
import { randomUUID } from "node:crypto";
import { Database } from "../dist/src/database.js";
import { recordAudit } from "../dist/src/audit.js";
const db = new Database();
try {
  const args = process.argv.slice(2),
    apply = args.includes("--apply"),
    recovery = args.includes("--recovery"),
    values = args.filter((a) => !a.startsWith("--"));
  if (
    args.some(
      (a) => a.startsWith("--") && !["--apply", "--recovery"].includes(a),
    ) ||
    values.length !== 2
  )
    throw new Error(
      "Usage: workspace-admin.mts <organisation UUID> <existing username> [--apply] [--recovery]",
    );
  const [organisationId, username] = values;
  if (!/^[0-9a-f-]{36}$/i.test(organisationId))
    throw new Error("Organisation UUID required.");
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`admin:${organisationId}`},0))`;
    const account = await tx.account.findUniqueOrThrow({ where: { username } });
    if (account.disabled) throw new Error("Account must be enabled.");
    const where = {
        organisationId_userId: { organisationId, userId: account.userId },
      },
      member = await tx.membership.findUniqueOrThrow({ where });
    const count = await tx.membership.count({
      where: {
        organisationId,
        active: true,
        isAdministrator: true,
        user: { account: { is: { disabled: false } } },
      },
    });
    if (count && !recovery)
      throw new Error(
        "An enabled administrator already exists. Use the UI or explicit trusted recovery.",
      );
    if (member.version === 2147483647)
      throw new Error("Membership version exhausted.");
    if (apply) {
      await tx.membership.update({
        where,
        data: {
          active: true,
          isAdministrator: true,
          version: { increment: 1 },
        },
      });
      await tx.session.deleteMany({
        where: { organisationId, userId: account.userId },
      });
      await recordAudit(
        tx,
        { organisationId, userId: account.userId },
        "access.operator_bootstrap",
        randomUUID(),
        undefined,
        { reasonCode: recovery ? "operator_recovery" : "first_administrator" },
      );
    }
  });
  console.log(
    apply
      ? "Administrator provisioned; target sessions revoked and audit recorded."
      : "Dry run passed; no permissions changed. Repeat with --apply after operator review.",
  );
} catch (e) {
  console.error(
    e instanceof Error ? e.message : "Workspace administration failed.",
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
