import { PrismaClient } from "@prisma/client";
import { LOCAL, readConfig } from "../src/config";
readConfig();
const url = new URL(process.env.DATABASE_URL!);
if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))
  throw new Error("Seed requires a local database");
async function seed() {
  const db = new PrismaClient();
  try {
    await db.$transaction(async (tx) => {
      await tx.organisation.upsert({
        where: { id: LOCAL.organisationId },
        create: { id: LOCAL.organisationId, name: "Local checklist workspace" },
        update: {},
      });
      await tx.user.upsert({
        where: { id: LOCAL.userId },
        create: { id: LOCAL.userId },
        update: {},
      });
      await tx.membership.upsert({
        where: {
          organisationId_userId: {
            organisationId: LOCAL.organisationId,
            userId: LOCAL.userId,
          },
        },
        create: { organisationId: LOCAL.organisationId, userId: LOCAL.userId },
        update: {},
      });
      for (const [id, name] of [
        [LOCAL.entityId, "Local entity A"],
        [LOCAL.secondEntityId, "Local entity B"],
      ]) {
        await tx.entity.upsert({
          where: { id },
          create: { id, organisationId: LOCAL.organisationId, name },
          update: {},
        });
        await tx.entityAccess.upsert({
          where: {
            organisationId_userId_entityId: {
              organisationId: LOCAL.organisationId,
              userId: LOCAL.userId,
              entityId: id,
            },
          },
          create: {
            organisationId: LOCAL.organisationId,
            userId: LOCAL.userId,
            entityId: id,
            canWrite: true,
            canImport: true,
          },
          update: {},
        });
      }
    });
    console.log(
      "Local identity/entities ensured. Existing task data preserved.",
    );
  } finally {
    await db.$disconnect();
  }
}
seed().catch(() => {
  console.error("Local seed failed.");
  process.exitCode = 1;
});
