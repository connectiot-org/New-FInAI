import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import { Database } from "./database";
import { Identity } from "./config";
import { ApiError } from "./errors";
import { CreateInput, previousMonth } from "./validation";
export const creationDigest = (input: {
  entityId: string;
  month: string;
  title: string;
}) =>
  createHash("sha256")
    .update(JSON.stringify([input.entityId, input.month, input.title]))
    .digest("hex");
type Tx = Prisma.TransactionClient;
const notFound = () => new ApiError(404, "NOT_FOUND", "Resource not found.");
@Injectable()
export class ChecklistRepository {
  constructor(@Inject(Database) private db: Database) {}
  async authorize(tx: Tx, identity: Identity, entityId: string, write = false) {
    const access = await tx.entityAccess.findUnique({
      where: { organisationId_userId_entityId: { ...identity, entityId } },
      include: { membership: true },
    });
    if (!access || !access.membership.active) throw notFound();
    if (write && !access.canWrite)
      throw new ApiError(
        403,
        "FORBIDDEN",
        "You cannot change records for this entity.",
      );
  }
  requireEntityRead(identity: Identity, entityId: string) {
    return this.db.$transaction((tx) => this.authorize(tx, identity, entityId));
  }
  async entities(identity: Identity) {
    return this.db.entity.findMany({
      where: {
        organisationId: identity.organisationId,
        access: { some: { ...identity, membership: { active: true } } },
      },
      select: { id: true, name: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
  }
  async list(identity: Identity, entityId: string, month: string) {
    return this.db.$transaction(
      async (tx) => {
        await this.authorize(tx, identity, entityId);
        return tx.checklistTask.findMany({
          where: {
            organisationId: identity.organisationId,
            entityId,
            month: new Date(`${month}-01T00:00:00Z`),
          },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          take: 200,
        });
      },
      { isolationLevel: "RepeatableRead" },
    );
  }
  async create(identity: Identity, input: CreateInput) {
    const digest = creationDigest(input);
    // Serialize ID claims first and monthly capacity second. Locks are transaction-scoped.
    return this.db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`task:${input.id}`},0))`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`month:${identity.organisationId}:${input.entityId}:${input.month}`},0))`;
        await this.authorize(tx, identity, input.entityId, true);
        const existing = await tx.checklistTask.findUnique({
          where: { id: input.id },
        });
        if (existing) {
          if (existing.organisationId !== identity.organisationId)
            throw notFound();
          await this.authorize(tx, identity, existing.entityId, true);
          if (
            existing.entityId !== input.entityId ||
            existing.createDigest !== digest
          )
            throw new ApiError(
              409,
              "CREATE_CONFLICT",
              "This create identifier was already used for a different task.",
            );
          return { task: existing, created: false };
        }
        const where = {
          organisationId: identity.organisationId,
          entityId: input.entityId,
          month: new Date(`${input.month}-01T00:00:00Z`),
        };
        if ((await tx.checklistTask.count({ where })) >= 200)
          throw new ApiError(
            409,
            "CAPACITY_REACHED",
            "This entity and month already has 200 tasks.",
          );
        return {
          task: await tx.checklistTask.create({
            data: {
              ...where,
              id: input.id,
              title: input.title,
              createDigest: digest,
            },
          }),
          created: true,
        };
      },
      { isolationLevel: "ReadCommitted", timeout: 15000, maxWait: 15000 },
    );
  }
  async copyPreviousMonth(identity: Identity, entityId: string, month: string) {
    const sourceMonth = previousMonth(month);
    return this.db.$transaction(
      async (tx) => {
        await this.authorize(tx, identity, entityId, true);
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`month:${identity.organisationId}:${entityId}:${month}`},0))`;
        // READ COMMITTED gives this query a fresh snapshot after a lock wait.
        const where = {
          organisationId: identity.organisationId,
          entityId,
          month: new Date(`${month}-01T00:00:00Z`),
        };
        if (await tx.checklistTask.count({ where }))
          throw new ApiError(
            409,
            "DESTINATION_NOT_EMPTY",
            "The destination month already contains tasks.",
          );
        const source = await tx.checklistTask.findMany({
          where: { ...where, month: new Date(`${sourceMonth}-01T00:00:00Z`) },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          take: 201,
        });
        if (source.length > 200)
          throw new ApiError(
            409,
            "CAPACITY_REACHED",
            "The source exceeds the supported task limit.",
          );
        if (source.length)
          await tx.checklistTask.createMany({
            data: source.map((task) => ({
              ...where,
              id: randomUUID(),
              title: task.title,
              completed: false,
              version: 1,
              createDigest: creationDigest({
                entityId,
                month,
                title: task.title,
              }),
            })),
          });
        return {
          sourceMonth,
          destinationMonth: month,
          copiedCount: source.length,
        };
      },
      { isolationLevel: "ReadCommitted", timeout: 15000, maxWait: 15000 },
    );
  }
  async change(
    identity: Identity,
    id: string,
    version: number,
    completed?: boolean,
  ) {
    return this.db.$transaction(async (tx) => {
      const task = await tx.checklistTask.findFirst({
        where: { id, organisationId: identity.organisationId },
      });
      if (!task) throw notFound();
      await this.authorize(tx, identity, task.entityId, true);
      const where = {
        id,
        organisationId: identity.organisationId,
        entityId: task.entityId,
        version,
      };
      if (completed === undefined) {
        if ((await tx.checklistTask.deleteMany({ where })).count !== 1)
          throw new ApiError(
            409,
            "VERSION_CONFLICT",
            "Task changed. Reload before retrying.",
          );
        return null;
      }
      if (version === 2147483647)
        throw new ApiError(
          409,
          "VERSION_CONFLICT",
          "Task version limit reached.",
        );
      const rows = await tx.checklistTask.updateManyAndReturn({
        where,
        data: { completed, version: { increment: 1 }, updatedAt: new Date() },
      });
      if (rows.length !== 1)
        throw new ApiError(
          409,
          "VERSION_CONFLICT",
          "Task changed. Reload before retrying.",
        );
      return rows[0];
    });
  }
}
