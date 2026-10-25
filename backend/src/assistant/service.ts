import { Inject, Injectable } from "@nestjs/common";
import {
  Prisma,
  type AssistantConversation,
  type AssistantTurn,
} from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import { Database } from "../database";
import type { Identity } from "../config";
import { ChecklistRepository } from "../checklist.repository";
import { recordAudit } from "../audit";
import { ApiError } from "../errors";
import { AssistantFacts } from "./facts";
import {
  OpenRouterProvider,
  ProviderFailure,
  type AssistantProvider,
} from "./provider";
import { answer, plan, composition, POLICY } from "./validation";
const missing = () =>
  new ApiError(404, "NOT_FOUND", "Conversation or preference is unavailable.");
const conflict = () =>
  new ApiError(
    409,
    "VERSION_CONFLICT",
    "Records changed. Reload before trying again.",
  );
const digest = (x: unknown) =>
  createHash("sha256").update(JSON.stringify(x)).digest("hex");
const days = (n: number) => new Date(Date.now() + n * 86400000);
const conversation = (c: AssistantConversation) => ({
  id: c.id,
  entityId: c.entityId,
  month: c.month,
  currency: c.currency,
  version: c.version,
  createdAt: c.createdAt.toISOString(),
  expiresAt: c.expiresAt.toISOString(),
});
const turn = (t: AssistantTurn) => ({
  id: t.id,
  question: t.question,
  status: t.status,
  answer: t.answer ? answer.parse(t.answer) : null,
  failureCode: t.failureCode,
  model: t.model,
  policy: t.policy,
  createdAt: t.createdAt.toISOString(),
  finishedAt: t.finishedAt?.toISOString() || null,
});
type Tx = Prisma.TransactionClient;
@Injectable()
export class AssistantService {
  provider: AssistantProvider = new OpenRouterProvider();
  private running = new Map<string, AbortController>();
  constructor(
    @Inject(Database) private db: Database,
    @Inject(ChecklistRepository) private permissions: ChecklistRepository,
    @Inject(AssistantFacts) private facts: AssistantFacts,
  ) {}
  capabilities() {
    return {
      ...this.facts.capabilities(),
      configured: this.provider.configured,
      model: this.provider.configured ? this.provider.model : null,
      policy: POLICY,
      limits: {
        conversations: 100,
        turns: 200,
        questionCharacters: 2000,
        leaseSeconds: 40,
        conversationDays: 30,
        preferenceDays: 365,
        maxTools: 3,
        tokenReservation: 50000,
      },
    };
  }
  async guard(
    tx: Tx,
    identity: Identity,
    entityId: string,
    sessionHash?: string,
  ) {
    if (sessionHash)
      await tx.$queryRaw`SELECT "userId" FROM "Account" WHERE "userId"=${identity.userId}::uuid FOR SHARE`;
    await tx.$queryRaw`SELECT a.entity_id FROM "EntityAccess" a JOIN "Membership" m ON m.organisation_id=a.organisation_id AND m.user_id=a.user_id WHERE a.organisation_id=${identity.organisationId}::uuid AND a.entity_id=${entityId}::uuid AND a.user_id=${identity.userId}::uuid FOR SHARE OF a,m`;
    await this.permissions.authorize(tx, identity, entityId);
    if (sessionHash) {
      await tx.$queryRaw`SELECT "tokenHash" FROM "Session" WHERE "tokenHash"=${sessionHash} FOR SHARE`;
      const s = await tx.session.findUnique({
          where: { tokenHash: sessionHash },
        }),
        a = await tx.account.findUnique({ where: { userId: identity.userId } });
      if (
        !s ||
        s.userId !== identity.userId ||
        s.organisationId !== identity.organisationId ||
        +s.expiresAt <= Date.now() ||
        !a ||
        a.disabled
      )
        throw new ApiError(401, "UNAUTHENTICATED", "Session expired.");
    }
  }
  private async lock(tx: Tx, i: Identity) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`assistant:${i.organisationId}`},0))`;
  }
  private async owned(tx: Tx, i: Identity, id: string, hash?: string) {
    const c = await tx.assistantConversation.findFirst({
      where: { id, ...i, expiresAt: { gt: new Date() } },
    });
    if (!c) throw missing();
    await this.guard(tx, i, c.entityId, hash);
    return c;
  }
  private async expire(tx: Tx, i: Identity, c: AssistantConversation) {
    const expired = await tx.assistantTurn.findMany({
      where: {
        conversationId: c.id,
        status: "pending",
        leaseUntil: { lte: new Date() },
      },
    });
    for (const t of expired) {
      await tx.assistantTurn.update({
        where: { id: t.id },
        data: {
          status: "failed",
          failureCode: "LEASE_EXPIRED",
          sessionHash: null,
          finishedAt: new Date(),
        },
      });
      await recordAudit(tx, i, "assistant.turn_expired", t.id, c.entityId, {
        reasonCode: "lease_expired",
      });
    }
  }
  async operationalSource(
    i: Identity,
    entityId: string,
    month: string,
    kind: "checklist" | "subscriptions",
    offset: number,
    limit: number,
    hash?: string,
  ) {
    return this.db.$transaction(
      async (tx) => {
        await this.guard(tx, i, entityId, hash);
        const start = new Date(month + "-01T00:00:00Z"),
          end = new Date(start);
        end.setUTCMonth(end.getUTCMonth() + 1);
        const common = {
          entityId,
          month,
          kind,
          retrievedAt: new Date().toISOString(),
          basis:
            "Current saved operational records, not an immutable accounting snapshot. They may differ from a dated saved answer. Checklist completion is not accounting approval; subscriptions are saved dates, not payment or renewal execution.",
          offset,
          limit,
        };
        if (kind === "checklist") {
          const where = {
              organisationId: i.organisationId,
              entityId,
              month: start,
              completed: false,
            },
            total = await tx.checklistTask.count({ where }),
            items = await tx.checklistTask.findMany({
              where,
              orderBy: [{ createdAt: "asc" }, { id: "asc" }],
              skip: offset,
              take: limit,
              select: { id: true, title: true, completed: true, version: true },
            });
          return {
            ...common,
            total,
            nextOffset:
              offset + items.length < total ? offset + items.length : null,
            items,
          };
        }
        const where = {
            organisationId: i.organisationId,
            entityId,
            archived: false,
            renewalDate: { gte: start, lt: end },
          },
          total = await tx.subscriptionRenewal.count({ where }),
          rows = await tx.subscriptionRenewal.findMany({
            where,
            orderBy: [{ renewalDate: "asc" }, { id: "asc" }],
            skip: offset,
            take: limit,
            select: {
              id: true,
              supplierName: true,
              subscriptionName: true,
              renewalDate: true,
              cancellationDeadline: true,
              version: true,
            },
          });
        return {
          ...common,
          total,
          nextOffset:
            offset + rows.length < total ? offset + rows.length : null,
          items: rows.map((r) => ({
            ...r,
            renewalDate: r.renewalDate.toISOString().slice(0, 10),
            cancellationDeadline:
              r.cancellationDeadline?.toISOString().slice(0, 10) || null,
          })),
        };
      },
      { isolationLevel: "RepeatableRead" },
    );
  }
  async list(
    i: Identity,
    entityId: string,
    offset: number,
    limit: number,
    hash?: string,
  ) {
    return this.db.$transaction(async (tx) => {
      await this.guard(tx, i, entityId, hash);
      const where = { ...i, entityId, expiresAt: { gt: new Date() } },
        total = await tx.assistantConversation.count({ where }),
        items = await tx.assistantConversation.findMany({
          where,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip: offset,
          take: limit,
        });
      return { offset, limit, total, items: items.map(conversation) };
    });
  }
  async create(
    i: Identity,
    input: { id: string; entityId: string; month: string; currency: string },
    hash?: string,
  ) {
    return this.db.$transaction(async (tx) => {
      await this.lock(tx, i);
      await this.guard(tx, i, input.entityId, hash);
      if (
        await tx.assistantDeletion.findUnique({
          where: { id_kind: { id: input.id, kind: "conversation" } },
        })
      )
        throw missing();
      const d = digest(input),
        old = await tx.assistantConversation.findUnique({
          where: { id: input.id },
        });
      if (old) {
        if (
          old.organisationId !== i.organisationId ||
          old.userId !== i.userId ||
          +old.expiresAt <= Date.now()
        )
          throw missing();
        if (old.createDigest !== d) throw conflict();
        return conversation(old);
      }
      if (
        (await tx.assistantConversation.count({
          where: { ...i, expiresAt: { gt: new Date() } },
        })) >= 100
      )
        throw new ApiError(
          409,
          "CAPACITY_REACHED",
          "Conversation limit reached; delete older conversations.",
        );
      const c = await tx.assistantConversation.create({
        data: { ...input, ...i, createDigest: d, expiresAt: days(30) },
      });
      await recordAudit(
        tx,
        i,
        "assistant.conversation_created",
        c.id,
        c.entityId,
        { version: c.version },
      );
      return conversation(c);
    });
  }
  async read(
    i: Identity,
    id: string,
    hash?: string,
    offset?: number,
    limit = 50,
  ) {
    return this.db.$transaction(async (tx) => {
      await this.lock(tx, i);
      const c = await this.owned(tx, i, id, hash);
      await this.expire(tx, i, c);
      const total = await tx.assistantTurn.count({
          where: { conversationId: id },
        }),
        start = offset ?? Math.max(0, total - limit),
        rows = await tx.assistantTurn.findMany({
          where: { conversationId: id },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          skip: start,
          take: limit,
        });
      return {
        ...conversation(c),
        offset: start,
        limit,
        total,
        turns: rows.map(turn),
      };
    });
  }
  async remove(
    i: Identity,
    id: string,
    expectedVersion: number,
    hash?: string,
  ) {
    return this.db.$transaction(async (tx) => {
      await this.lock(tx, i);
      const c = await this.owned(tx, i, id, hash);
      if (c.version !== expectedVersion) throw conflict();
      const pending = await tx.assistantTurn.findMany({
        where: { conversationId: id, status: "pending" },
      });
      await tx.assistantDeletion.create({
        data: { id, kind: "conversation", ...i, expiresAt: days(90) },
      });
      await tx.assistantConversation.delete({ where: { id } });
      await recordAudit(
        tx,
        i,
        "assistant.conversation_deleted",
        id,
        c.entityId,
        { version: c.version },
      );
      for (const t of pending) this.running.get(t.id)?.abort();
      return { status: "deleted" };
    });
  }
  async preferences(i: Identity, entityId: string, hash?: string) {
    return this.db.$transaction(async (tx) => {
      await this.guard(tx, i, entityId, hash);
      const items = await tx.assistantPreference.findMany({
        where: { ...i, entityId, expiresAt: { gt: new Date() } },
        take: 1,
      });
      return {
        items: items.map((p) => ({
          id: p.id,
          entityId: p.entityId,
          detail: p.detail,
          note: p.note,
          version: p.version,
          createdAt: p.createdAt.toISOString(),
          updatedAt: p.updatedAt.toISOString(),
          expiresAt: p.expiresAt.toISOString(),
        })),
      };
    });
  }
  async preference(
    i: Identity,
    id: string,
    p: {
      entityId: string;
      detail: "concise" | "detailed";
      note: string;
      expectedVersion: number;
    },
    hash?: string,
  ) {
    return this.db.$transaction(async (tx) => {
      await this.lock(tx, i);
      await this.guard(tx, i, p.entityId, hash);
      await tx.assistantPreference.deleteMany({
        where: { ...i, entityId: p.entityId, expiresAt: { lte: new Date() } },
      });
      if (
        await tx.assistantDeletion.findUnique({
          where: { id_kind: { id, kind: "preference" } },
        })
      )
        throw missing();
      const old = await tx.assistantPreference.findUnique({ where: { id } });
      if (
        old &&
        (old.organisationId !== i.organisationId ||
          old.userId !== i.userId ||
          old.entityId !== p.entityId)
      )
        throw missing();
      if (
        (old?.version || 0) !== p.expectedVersion ||
        old?.version === 2147483647
      )
        throw conflict();
      if (
        !old &&
        (await tx.assistantPreference.findFirst({
          where: { ...i, entityId: p.entityId },
        }))
      )
        throw conflict();
      const row = old
        ? await tx.assistantPreference.update({
            where: { id },
            data: {
              detail: p.detail,
              note: p.note,
              version: { increment: 1 },
              expiresAt: days(365),
            },
          })
        : await tx.assistantPreference.create({
            data: {
              id,
              ...i,
              entityId: p.entityId,
              detail: p.detail,
              note: p.note,
              expiresAt: days(365),
            },
          });
      await recordAudit(tx, i, "assistant.preference_saved", id, p.entityId, {
        version: row.version,
      });
      return { id: row.id, version: row.version };
    });
  }
  async forget(
    i: Identity,
    id: string,
    entityId: string,
    expectedVersion: number,
    hash?: string,
  ) {
    return this.db.$transaction(async (tx) => {
      await this.lock(tx, i);
      await this.guard(tx, i, entityId, hash);
      const row = await tx.assistantPreference.findFirst({
        where: { id, ...i, entityId },
      });
      if (!row) throw missing();
      if (row.version !== expectedVersion) throw conflict();
      await tx.assistantDeletion.create({
        data: { id, kind: "preference", ...i, expiresAt: days(90) },
      });
      await tx.assistantPreference.delete({ where: { id } });
      await recordAudit(tx, i, "assistant.preference_forgotten", id, entityId, {
        version: row.version,
      });
      return { status: "forgotten" };
    });
  }
  async reserve(
    i: Identity,
    id: string,
    input: { id: string; question: string; expectedVersion: number },
    hash?: string,
  ) {
    const result = await this.db.$transaction(async (tx) => {
      await this.lock(tx, i);
      const c = await this.owned(tx, i, id, hash);
      await this.expire(tx, i, c);
      const d = digest({ conversationId: id, ...input }),
        existing = await tx.assistantTurn.findUnique({
          where: { id: input.id },
        });
      if (existing) {
        if (existing.conversationId !== id) throw missing();
        if (existing.digest !== d) throw conflict();
        return { c, t: existing, run: false };
      }
      if (!this.provider.configured)
        throw new ApiError(
          503,
          "ASSISTANT_NOT_CONFIGURED",
          "Configure an approved assistant model/provider and budget before asking a question.",
        );
      if (c.version !== input.expectedVersion || c.version === 2147483647)
        throw conflict();
      if (
        (await tx.assistantTurn.count({ where: { conversationId: id } })) >= 200
      )
        throw new ApiError(
          409,
          "CAPACITY_REACHED",
          "Conversation turn limit reached; start another conversation.",
        );
      if (
        await tx.assistantTurn.count({
          where: { conversationId: id, status: "pending" },
        })
      )
        throw new ApiError(
          409,
          "TURN_PENDING",
          "A question is already being answered.",
        );
      if (
        (await tx.assistantTurn.count({
          where: {
            status: "pending",
            leaseUntil: { gt: new Date() },
            conversation: { organisationId: i.organisationId },
          },
        })) >= 2
      )
        throw new ApiError(
          429,
          "ASSISTANT_BUSY",
          "Assistant capacity is busy; retry later.",
        );
      const day = new Date(
          new Date().toISOString().slice(0, 10) + "T00:00:00Z",
        ),
        where = {
          organisationId_day: { organisationId: i.organisationId, day },
        },
        b = await tx.assistantBudget.findUnique({ where });
      if ((b?.tokens || 0) + 50000 > this.provider.dailyLimit)
        throw new ApiError(
          429,
          "ASSISTANT_BUDGET",
          "The configured daily assistant allowance is exhausted.",
        );
      await tx.assistantBudget.upsert({
        where,
        create: { organisationId: i.organisationId, day, tokens: 50000 },
        update: { tokens: { increment: 50000 } },
      });
      const t = await tx.assistantTurn.create({
        data: {
          id: input.id,
          conversationId: id,
          question: input.question,
          digest: d,
          status: "pending",
          lease: randomUUID(),
          leaseUntil: new Date(Date.now() + 40000),
          sessionHash: hash || null,
          model: this.provider.model,
          policy: POLICY,
        },
      });
      const updated = await tx.assistantConversation.update({
        where: { id },
        data: { version: { increment: 1 } },
      });
      await recordAudit(tx, i, "assistant.turn_reserved", t.id, c.entityId, {
        version: updated.version,
      });
      return { c: updated, t, run: true };
    });
    if (result.run) {
      const controller = new AbortController();
      this.running.set(result.t.id, controller);
      void this.execute(i, result.c, result.t, controller)
        .finally(() => this.running.delete(result.t.id))
        .catch(() => {});
    }
    return { conversationVersion: result.c.version, turn: turn(result.t) };
  }
  async execute(
    i: Identity,
    c: AssistantConversation,
    t: AssistantTurn,
    controller: AbortController,
  ) {
    let output: zAnswer | undefined,
      planned: ReturnType<typeof plan.parse> | undefined,
      failure: string | undefined;
    try {
      const hash = t.sessionHash || undefined;
      const context = await this.db.$transaction(async (tx) => {
        await this.guard(tx, i, c.entityId, hash);
        const pref = await tx.assistantPreference.findFirst({
            where: {
              ...i,
              entityId: c.entityId,
              expiresAt: { gt: new Date() },
            },
          }),
          recent = await tx.assistantTurn.findMany({
            where: { conversationId: c.id, status: "completed" },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: 4,
          });
        return {
          preference: pref
            ? { detail: pref.detail, note: pref.note }
            : { detail: "concise", note: "" },
          recent: recent.reverse().map((r) => ({
            question: r.question,
            plan: r.plan,
            references: answer.safeParse(r.answer).success
              ? (r.answer as unknown as zAnswer).facts
                  .filter((f) => f.recordId)
                  .map((f) => ({
                    id: f.recordId,
                    kind: f.recordKind,
                    label: f.label,
                  }))
              : [],
          })),
        };
      });
      planned = plan.parse(
        await this.provider.plan(
          {
            scope: {
              entityId: c.entityId,
              month: c.month,
              currency: c.currency,
            },
            question: t.question,
            ...context,
            available: [
              "receivables",
              "invoices",
              "checklist",
              "subscriptions",
              "ledger_if_verified",
            ],
          },
          controller.signal,
        ),
      );
      await this.db.$transaction((tx) => this.guard(tx, i, c.entityId, hash));
      const references = context.recent.flatMap((r) => r.references || []);
      for (const op of planned.operations) {
        for (const [field, kind] of [
          ["customerId", "customer"],
          ["accountId", "account"],
        ] as const) {
          const id = op[field];
          if (
            id &&
            !t.question.includes(id) &&
            !references.some((r) => r.id === id && r.kind === kind)
          ) {
            op.kind = "clarify";
            op.reason = "ambiguous";
            op.customerId = null;
            op.accountId = null;
          }
        }
      }
      const evidence = await this.facts.retrieve(i, c, planned);
      await this.db.$transaction((tx) => this.guard(tx, i, c.entityId, hash));
      const selected = composition.parse(
        await this.provider.compose(
          {
            question: t.question,
            scope: { month: c.month, currency: c.currency },
            preference: context.preference,
            evidence,
          },
          controller.signal,
        ),
      );
      const ids = new Set(selected.factIds),
        noteIds = new Set(selected.noteIds),
        max = context.preference.detail === "detailed" ? 12 : 3;
      if (
        ids.size !== selected.factIds.length ||
        noteIds.size !== selected.noteIds.length ||
        ids.size > max ||
        selected.factIds.some(
          (id) => !evidence.facts.some((f) => f.id === id),
        ) ||
        selected.noteIds.some((id) => !Object.hasOwn(evidence.notes, id)) ||
        (!ids.size && !noteIds.size)
      )
        throw new ProviderFailure("GROUNDING_INVALID");
      const facts = selected.factIds.map((id) =>
        evidence.facts.find((f) => f.id === id)!,
      );
      const sourceIds = new Set(facts.map((f) => f.sourceId));
      // Caveats cannot be omitted by a model. Every retrieved source basis remains visible.
      output = answer.parse({
        facts,
        sources: evidence.sources.filter((s) => sourceIds.has(s.id)),
        notes: Object.values(evidence.notes).slice(0, 8),
        basis:
          "Exact facts and source references were computed and authorized by server tools. Model chose allowed reads and the relevant fact ordering; saved replies are historical.",
        detail: context.preference.detail,
      });
    } catch (e) {
      failure =
        e instanceof ProviderFailure
          ? e.code
          : e instanceof ApiError
            ? e.code
            : "ASSISTANT_UNAVAILABLE";
    }
    try {
      await this.db.$transaction(async (tx) => {
        await this.lock(tx, i);
        const current = await this.owned(
          tx,
          i,
          c.id,
          t.sessionHash || undefined,
        );
        const row = await tx.assistantTurn.findFirst({
          where: {
            id: t.id,
            conversationId: c.id,
            status: "pending",
            lease: t.lease,
            leaseUntil: { gt: new Date() },
          },
        });
        if (!row || controller.signal.aborted) return;
        await tx.assistantTurn.update({
          where: { id: t.id },
          data: output
            ? {
                status: "completed",
                sessionHash: null,
                answer: output,
                plan: planned,
                finishedAt: new Date(),
              }
            : {
                status: "failed",
                sessionHash: null,
                failureCode: failure || "ASSISTANT_UNAVAILABLE",
                finishedAt: new Date(),
              },
        });
        await recordAudit(
          tx,
          i,
          output ? "assistant.turn_completed" : "assistant.turn_failed",
          t.id,
          current.entityId,
          { reasonCode: output ? "grounded" : failure || "unavailable" },
        );
      });
    } catch {
      /* Permission loss/deletion/DB outage cannot publish. Lease expiry is recovered on read or by retention tooling. */
    }
  }
  async cancel(
    i: Identity,
    id: string,
    turnId: string,
    expectedVersion: number,
    hash?: string,
  ) {
    return this.db.$transaction(async (tx) => {
      await this.lock(tx, i);
      const c = await this.owned(tx, i, id, hash);
      if (c.version !== expectedVersion || c.version === 2147483647)
        throw conflict();
      const t = await tx.assistantTurn.findFirst({
        where: { id: turnId, conversationId: id, status: "pending" },
      });
      if (!t) throw conflict();
      await tx.assistantTurn.update({
        where: { id: turnId },
        data: {
          status: "cancelled",
          sessionHash: null,
          failureCode: "CANCELLED",
          finishedAt: new Date(),
        },
      });
      await tx.assistantConversation.update({
        where: { id },
        data: { version: { increment: 1 } },
      });
      await recordAudit(tx, i, "assistant.turn_cancelled", turnId, c.entityId, {
        reasonCode: "owner_cancelled",
      });
      this.running.get(turnId)?.abort();
      return { status: "cancelled" };
    });
  }
  onModuleDestroy() {
    for (const c of this.running.values()) c.abort();
  }
}
type zAnswer = ReturnType<typeof answer.parse>;
