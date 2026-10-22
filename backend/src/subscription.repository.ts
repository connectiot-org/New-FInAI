import { Inject, Injectable } from "@nestjs/common";
import { Database } from "./database";
import { ChecklistRepository } from "./checklist.repository";
import type { Identity } from "./config";
import { ApiError } from "./errors";
import type {
  SubscriptionCreate,
  SubscriptionUpdate,
  SubscriptionArchive,
  SubscriptionList,
} from "./subscription.validation";
const iso = (v: Date) => v.toISOString().slice(0, 10);
@Injectable()
export class SubscriptionRepository {
  constructor(
    @Inject(Database) private db: Database,
    @Inject(ChecklistRepository) private permissions: ChecklistRepository,
  ) {}
  async list(identity: Identity, input: SubscriptionList) {
    const escaped = input.search.replace(/[\\%_]/g, "\\$&");
    const result = await this.db.$transaction(
      async (tx) => {
        await this.permissions.authorize(tx, identity, input.entityId);
        const where = {
          organisationId: identity.organisationId,
          entityId: input.entityId,
          ...(input.status !== "all"
            ? { archived: input.status === "archived" }
            : {}),
          ...(escaped
            ? {
                OR: [
                  {
                    supplierName: {
                      contains: escaped,
                      mode: "insensitive" as const,
                    },
                  },
                  {
                    subscriptionName: {
                      contains: escaped,
                      mode: "insensitive" as const,
                    },
                  },
                ],
              }
            : {}),
        };
        const total = await tx.subscriptionRenewal.count({ where });
        const items = await tx.subscriptionRenewal.findMany({
          where,
          orderBy: [{ renewalDate: "asc" }, { id: "asc" }],
          take: input.limit,
          skip: input.offset,
        });
        return {
          items,
          total,
        };
      },
      { isolationLevel: "RepeatableRead" },
    );
    return {
      ...result,
      limit: input.limit,
      offset: input.offset,
      nextOffset:
        input.offset + result.items.length < result.total
          ? input.offset + result.items.length
          : null,
    };
  }
  details(input: SubscriptionCreate | SubscriptionUpdate) {
    return {
      supplierName: input.supplierName,
      subscriptionName: input.subscriptionName,
      renewalDate: new Date(`${input.renewalDate}T00:00:00Z`),
      cancellationDeadline: input.cancellationDeadline
        ? new Date(`${input.cancellationDeadline}T00:00:00Z`)
        : null,
      notes: input.notes,
    };
  }
  async create(identity: Identity, input: SubscriptionCreate) {
    const result = await this.db.$transaction(async (tx) => {
      await this.permissions.authorize(tx, identity, input.entityId, true);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`subscription:${input.id}`},0))`;
      const details = this.details(input),
        existing = await tx.subscriptionRenewal.findUnique({
          where: { id: input.id },
        });
      if (existing) {
        if (
          existing.organisationId !== identity.organisationId ||
          existing.entityId !== input.entityId
        )
          throw new ApiError(404, "NOT_FOUND", "Resource not found.");
        if (
          existing.archived ||
          existing.supplierName !== details.supplierName ||
          existing.subscriptionName !== details.subscriptionName ||
          iso(existing.renewalDate) !== input.renewalDate ||
          (existing.cancellationDeadline
            ? iso(existing.cancellationDeadline)
            : null) !== input.cancellationDeadline ||
          existing.notes !== details.notes
        )
          throw new ApiError(
            409,
            "CREATE_CONFLICT",
            "Identifier already used. Reload records before trying again.",
          );
        return { row: existing, created: false };
      }
      return {
        row: await tx.subscriptionRenewal.create({
          data: {
            id: input.id,
            organisationId: identity.organisationId,
            entityId: input.entityId,
            ...details,
          },
        }),
        created: true,
      };
    });
    return result;
  }
  async change(
    identity: Identity,
    id: string,
    input: SubscriptionUpdate | SubscriptionArchive,
  ) {
    const row = await this.db.$transaction(async (tx) => {
      const existing = await tx.subscriptionRenewal.findFirst({
        where: { id, organisationId: identity.organisationId },
      });
      if (!existing)
        throw new ApiError(404, "NOT_FOUND", "Resource not found.");
      await this.permissions.authorize(tx, identity, existing.entityId, true);
      if (input.expectedVersion === 2147483647)
        throw new ApiError(409, "VERSION_CONFLICT", "Version limit reached.");
      const updated = await tx.subscriptionRenewal.updateManyAndReturn({
        where: {
          id,
          organisationId: identity.organisationId,
          entityId: existing.entityId,
          version: input.expectedVersion,
        },
        data: {
          ...("archived" in input
            ? { archived: input.archived }
            : this.details(input)),
          version: { increment: 1 },
          updatedAt: new Date(),
        },
      });
      if (updated.length !== 1)
        throw new ApiError(
          409,
          "VERSION_CONFLICT",
          "Record changed. Reload and review before saving again.",
        );
      return updated[0];
    });
    return row;
  }
}
