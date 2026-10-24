import { Inject, Injectable } from "@nestjs/common";
import { randomUUID, createHash } from "node:crypto";
import { Database } from "../database";
import type { Identity } from "../config";
import { ApiError } from "../errors";
import { recordAudit } from "../audit";
import { requireAdministrator } from "./permissions";
const conflict = () =>
  new ApiError(
    409,
    "VERSION_CONFLICT",
    "Access changed. Reload the administration page.",
  );
@Injectable()
export class WorkspaceService {
  constructor(@Inject(Database) private db: Database) {}
  async context(identity: Identity) {
    return this.db.$transaction(
      async (tx) => {
        const m = await tx.membership.findUnique({
          where: { organisationId_userId: identity },
          include: {
            organisation: true,
            access: {
              include: { entity: true },
              orderBy: { entityId: "asc" },
              take: 1001,
            },
          },
        });
        if (!m?.active)
          throw new ApiError(401, "UNAUTHENTICATED", "Session expired.");
        if (m.access.length > 1000)
          throw new ApiError(
            503,
            "UNAVAILABLE",
            "Workspace entity limit exceeded. Contact your administrator.",
          );
        const entities = m.access.map((a) => ({
          id: a.entityId,
          name: a.entity.name,
          canWrite: a.canWrite,
          canImport: a.canImport,
        }));
        return {
          ...identity,
          organisationName: m.organisation.name,
          administrator: m.isAdministrator,
          revision: createHash("sha256")
            .update(JSON.stringify([m.version, m.isAdministrator, entities]))
            .digest("hex"),
          entities,
        };
      },
      { isolationLevel: "RepeatableRead" },
    );
  }
  async list(
    identity: Identity,
    kind: "members" | "entities" | "audit",
    offset: number,
    limit: number,
  ) {
    return this.db.$transaction(
      async (tx) => {
        await requireAdministrator(tx, identity);
        const where = { organisationId: identity.organisationId };
        if (kind === "members") {
          const total = await tx.membership.count({ where });
          const members = await tx.membership.findMany({
            where,
            orderBy: { userId: "asc" },
            skip: offset,
            take: limit,
            include: {
              user: {
                include: {
                  account: { select: { username: true, disabled: true } },
                },
              },
              access: {
                select: {
                  entityId: true,
                  canWrite: true,
                  canImport: true,
                  version: true,
                },
              },
            },
          });
          return {
            offset,
            limit,
            total,
            items: members.map((m) => ({
              userId: m.userId,
              username: m.user.account?.username || null,
              disabled: m.user.account?.disabled ?? true,
              active: m.active,
              administrator: m.isAdministrator,
              version: m.version,
              access: m.access,
            })),
          };
        }
        if (kind === "entities") {
          const total = await tx.entity.count({ where });
          return {
            offset,
            limit,
            total,
            items: await tx.entity.findMany({
              where,
              orderBy: { id: "asc" },
              skip: offset,
              take: limit,
              select: { id: true, name: true },
            }),
          };
        }
        const total = await tx.serverAudit.count({ where });
        return {
          offset,
          limit,
          total,
          items: await tx.serverAudit.findMany({
            where,
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            skip: offset,
            take: limit,
            select: {
              id: true,
              actorId: true,
              entityId: true,
              requestId: true,
              createdAt: true,
              action: true,
              reference: true,
              outcome: true,
              metadata: true,
            },
          }),
        };
      },
      { isolationLevel: "RepeatableRead" },
    );
  }
  async member(
    identity: Identity,
    userId: string,
    input: { active: boolean; administrator: boolean; expectedVersion: number },
  ) {
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`admin:${identity.organisationId}`},0))`;
      await requireAdministrator(tx, identity);
      const m = await tx.membership.findUnique({
        where: {
          organisationId_userId: {
            organisationId: identity.organisationId,
            userId,
          },
        },
      });
      if (!m) throw new ApiError(404, "NOT_FOUND", "Resource not found.");
      if (m.version !== input.expectedVersion || m.version === 2147483647)
        throw conflict();
      if (
        m.active &&
        m.isAdministrator &&
        (!input.active || !input.administrator) &&
        (await tx.membership.count({
          where: {
            organisationId: identity.organisationId,
            active: true,
            userId: { not: userId },
            isAdministrator: true,
            user: { account: { is: { disabled: false } } },
          },
        })) === 0
      )
        throw new ApiError(
          409,
          "LAST_ADMINISTRATOR",
          "Keep at least one active administrator.",
        );
      if (
        input.active &&
        input.administrator &&
        !(await tx.account.findFirst({ where: { userId, disabled: false } }))
      )
        throw new ApiError(
          409,
          "ACCOUNT_UNAVAILABLE",
          "An enabled provisioned account is required.",
        );
      const row = await tx.membership.update({
        where: {
          organisationId_userId: {
            organisationId: identity.organisationId,
            userId,
          },
        },
        data: {
          active: input.active,
          isAdministrator: input.administrator,
          version: { increment: 1 },
        },
      });
      await tx.session.deleteMany({
        where: { organisationId: identity.organisationId, userId },
      });
      await recordAudit(
        tx,
        identity,
        "access.membership_changed",
        userId,
        undefined,
        {
          targetUserId: userId,
          active: input.active,
          administrator: input.administrator,
          version: row.version,
        },
      );
      return {
        userId,
        active: row.active,
        administrator: row.isAdministrator,
        version: row.version,
      };
    });
  }
  async entity(identity: Identity, name: string) {
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`admin:${identity.organisationId}`},0))`;
      await requireAdministrator(tx, identity);
      if (
        (await tx.entity.count({
          where: { organisationId: identity.organisationId },
        })) >= 1000
      )
        throw new ApiError(
          409,
          "CAPACITY_REACHED",
          "Organisation entity limit reached.",
        );
      const row = await tx.entity.create({
        data: {
          id: randomUUID(),
          organisationId: identity.organisationId,
          name,
        },
      });
      await recordAudit(tx, identity, "access.entity_created", row.id, row.id);
      return { id: row.id, name: row.name };
    });
  }
  async access(
    identity: Identity,
    input: {
      userId: string;
      entityId: string;
      access: boolean;
      canWrite: boolean;
      canImport: boolean;
      expectedVersion: number;
    },
  ) {
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`admin:${identity.organisationId}`},0))`;
      await requireAdministrator(tx, identity);
      const member = await tx.membership.findUnique({
        where: {
          organisationId_userId: {
            organisationId: identity.organisationId,
            userId: input.userId,
          },
        },
      });
      const entity = await tx.entity.findFirst({
        where: { id: input.entityId, organisationId: identity.organisationId },
      });
      if (!member?.active || !entity)
        throw new ApiError(404, "NOT_FOUND", "Resource not found.");
      const where = {
          organisationId_userId_entityId: {
            organisationId: identity.organisationId,
            userId: input.userId,
            entityId: input.entityId,
          },
        },
        old = await tx.entityAccess.findUnique({ where });
      if (
        member.version !== input.expectedVersion ||
        member.version === 2147483647 ||
        old?.version === 2147483647
      )
        throw conflict();
      const nextVersion = (old?.version || 0) + 1;
      const nextMember = await tx.membership.update({
        where: {
          organisationId_userId: {
            organisationId: identity.organisationId,
            userId: input.userId,
          },
        },
        data: { version: { increment: 1 } },
      });
      if (input.access)
        await tx.entityAccess.upsert({
          where,
          create: {
            ...where.organisationId_userId_entityId,
            canWrite: input.canWrite,
            canImport: input.canImport,
            version: nextVersion,
          },
          update: {
            canWrite: input.canWrite,
            canImport: input.canImport,
            version: nextVersion,
          },
        });
      else if (old) await tx.entityAccess.delete({ where });
      await tx.session.deleteMany({
        where: {
          organisationId: identity.organisationId,
          userId: input.userId,
        },
      });
      await recordAudit(
        tx,
        identity,
        "access.entity_grant_changed",
        input.userId,
        input.entityId,
        {
          targetUserId: input.userId,
          active: input.access,
          canWrite: input.access && input.canWrite,
          canImport: input.access && input.canImport,
          version: nextVersion,
        },
      );
      return {
        userId: input.userId,
        entityId: input.entityId,
        access: input.access,
        canWrite: input.access && input.canWrite,
        canImport: input.access && input.canImport,
        version: nextMember.version,
      };
    });
  }
}
