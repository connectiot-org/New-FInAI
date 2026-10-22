import { Inject, Injectable } from "@nestjs/common";
import type { SubscriptionRenewal } from "@prisma/client";
import type { Identity } from "./config";
import { SubscriptionRepository } from "./subscription.repository";
import type {
  SubscriptionCreate,
  SubscriptionUpdate,
  SubscriptionArchive,
  SubscriptionList,
} from "./subscription.validation";
export function organisationTimezones(
  raw: string | undefined,
): Record<string, string> {
  if (!raw) return {};
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(
      "ORGANISATION_TIMEZONES must be an organisation UUID to IANA zone map.",
    );
  for (const [id, zone] of Object.entries(value)) {
    if (
      !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id) ||
      typeof zone !== "string"
    )
      throw new Error("Invalid organisation timezone map.");
    new Intl.DateTimeFormat("en", { timeZone: zone }).format();
  }
  return Object.fromEntries(
    Object.entries(value).map(([id, zone]) => [
      id.toLowerCase(),
      zone as string,
    ]),
  );
}
export function dateContext(timezone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((v) => v.type === type)!.value;
  return {
    timezone,
    today: `${part("year").padStart(4, "0")}-${part("month")}-${part("day")}`,
  };
}
const day = (value: string) =>
  new Date(`${value}T00:00:00Z`).getTime() / 86400000;
export function subscriptionIndicators(
  renewalDate: string,
  cancellationDeadline: string | null,
  archived: boolean,
  today: string,
) {
  const renewalDays = day(renewalDate) - day(today),
    cancelDays = cancellationDeadline
      ? day(cancellationDeadline) - day(today)
      : null;
  return {
    renewalIndicator: archived
      ? null
      : renewalDays < 0
        ? "Renewal date passed."
        : renewalDays <= 30
          ? "Renewing soon."
          : null,
    cancellationIndicator:
      archived || cancelDays === null
        ? null
        : cancelDays < 0
          ? "Cancellation deadline passed."
          : cancelDays <= 7
            ? "Cancellation deadline approaching."
            : null,
  };
}
const iso = (v: Date) => v.toISOString().slice(0, 10);
@Injectable()
export class SubscriptionService {
  timezones: Record<string, string> = {};
  constructor(
    @Inject(SubscriptionRepository) private repo: SubscriptionRepository,
  ) {}
  context(identity: Identity) {
    return dateContext(this.timezones[identity.organisationId] || "UTC");
  }
  serialize(row: SubscriptionRenewal, today: string) {
    return {
      id: row.id,
      entityId: row.entityId,
      supplierName: row.supplierName,
      subscriptionName: row.subscriptionName,
      notes: row.notes,
      archived: row.archived,
      version: row.version,
      renewalDate: iso(row.renewalDate),
      cancellationDeadline: row.cancellationDeadline
        ? iso(row.cancellationDeadline)
        : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      ...subscriptionIndicators(
        iso(row.renewalDate),
        row.cancellationDeadline ? iso(row.cancellationDeadline) : null,
        row.archived,
        today,
      ),
    };
  }

  async list(identity: Identity, input: SubscriptionList) {
    const context = this.context(identity),
      result = await this.repo.list(identity, input);
    return {
      ...result,
      ...context,
      items: result.items.map((row) => this.serialize(row, context.today)),
    };
  }
  async create(identity: Identity, input: SubscriptionCreate) {
    const result = await this.repo.create(identity, input);
    return {
      record: this.serialize(result.row, this.context(identity).today),
      created: result.created,
    };
  }
  async change(
    identity: Identity,
    id: string,
    input: SubscriptionUpdate | SubscriptionArchive,
  ) {
    return this.serialize(
      await this.repo.change(identity, id, input),
      this.context(identity).today,
    );
  }
}
