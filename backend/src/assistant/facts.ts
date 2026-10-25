import { Inject, Injectable } from "@nestjs/common";
import { Database } from "../database";
import { ChecklistRepository } from "../checklist.repository";
import { ReceivablesDetailRepository } from "../receivables/detail.repository";
import { LedgerService } from "../ledger/source";
import type { Identity } from "../config";
import type { Plan, Fact, Source } from "./validation";
import { ApiError } from "../errors";
export function previousMonth(month: string) {
  const y = Number(month.slice(0, 4)),
    m = Number(month.slice(5));
  if (y === 1 && m === 1) return null;
  return m === 1
    ? `${String(y - 1).padStart(4, "0")}-12`
    : `${String(y).padStart(4, "0")}-${String(m - 1).padStart(2, "0")}`;
}
@Injectable()
export class AssistantFacts {
  constructor(
    @Inject(Database) private db: Database,
    @Inject(ChecklistRepository) private permissions: ChecklistRepository,
    @Inject(ReceivablesDetailRepository)
    private receivables: ReceivablesDetailRepository,
    @Inject(LedgerService) private ledger: LedgerService,
  ) {}
  capabilities() {
    return { ledgerMappingsEnabled: this.ledger.approved.size > 0 };
  }
  async retrieve(
    identity: Identity,
    scope: { entityId: string; month: string; currency: string },
    plan: Plan,
  ) {
    const facts: Fact[] = [],
      sources: Source[] = [],
      notes: Record<string, string> = {},
      now = new Date().toISOString();
    let recvId: string | undefined;
    let ledgerId: string | undefined;
    const note = (id: string, text: string) => {
      notes[id] = text;
    };
    note(
      "resolved_scope",
      `Authorized entity ${scope.entityId}; currency ${scope.currency}; resolved source month(s): ${[...new Set(plan.operations.map((op) => (op.period === "previous" ? previousMonth(scope.month) || "unavailable" : scope.month)))].join(", ")}.`,
    );
    const add = (
      source: Source,
      label: string,
      value: string,
      unit: Fact["unit"] = "text",
      currency: string | null = null,
      precision = 2,
    ) =>
      facts.push({
        id: `f${facts.length + 1}`,
        label,
        value,
        unit,
        currency,
        precision,
        sourceId: source.id,
      });
    for (const [index, op] of plan.operations.entries()) {
      const period =
        op.period === "previous" ? previousMonth(scope.month) : scope.month;
      if (!period) {
        note("coverage", "No earlier Gregorian month exists for this scope.");
        continue;
      }
      if (op.kind === "clarify") {
        note(
          "clarify",
          "Please specify the customer or question more precisely. To change entity, currency or reporting month, start a new conversation with that explicit scope.",
        );
        continue;
      }
      if (op.kind === "unsupported") {
        note(
          "unsupported",
          "This assistant only reads authorized imported sources, saved checklist tasks and subscriptions. It cannot post, pay, approve, forecast, disclose secrets or access another user's records. Choose a supported read question or supply an approved complete source.",
        );
        continue;
      }
      if (op.kind === "receivables" || op.kind === "invoices") {
        if (scope.currency !== "USD") {
          note(
            "currency",
            "The receivables register supports USD only. No currency conversion is inferred.",
          );
          continue;
        }
        if (!recvId) {
          const h = await this.receivables.history(identity, {
            entityId: scope.entityId,
            offset: 0,
            limit: 1,
          });
          recvId = h.items[0]?.snapshotId;
        }
        if (!recvId) {
          note(
            "missing_receivables",
            "No imported receivables snapshot exists. An authorized importer must review a complete source; missing data is not zero.",
          );
          continue;
        }
        if (
          op.customerId &&
          !(await this.db.receivableSnapshotInvoice.findFirst({
            where: {
              organisationId: identity.organisationId,
              entityId: scope.entityId,
              snapshotId: recvId,
              customerId: op.customerId,
            },
          }))
        ) {
          note(
            "unknown_customer",
            "That source customer ID is not present in the current snapshot. Select an exact source customer or clarify the question.",
          );
          continue;
        }
        const view = op.kind === "invoices" ? "invoice" : "customer",
          page = await this.receivables.page(
            identity,
            {
              entityId: scope.entityId,
              snapshotId: recvId,
              period,
              status: "outstanding",
              offset: 0,
              limit: 20,
              search: "",
              ...(op.customerId ? { customerId: op.customerId } : {}),
            },
            view,
          );
        const s: Source = {
          id: `s${index}`,
          label: `${page.source.sourceName} · version ${page.source.version}`,
          href: `/workspace/receivables/invoices?${new URLSearchParams({ entityId: scope.entityId, snapshotId: recvId, period, ...(op.customerId ? { customerId: op.customerId } : {}) })}`,
          basis: `${period} invoice issue dates; cumulative paid at source cutoff; not overdue aging or historical month-end balance.`,
          capturedAt: page.source.sourceCapturedAt,
          importedAt: page.source.importedAt,
          retrievedAt: now,
          version: page.source.version,
          snapshotId: recvId,
        };
        sources.push(s);
        add(
          s,
          `${period} outstanding balance`,
          String(page.remainingCents),
          "minor",
          "USD",
        );
        add(s, "Outstanding invoices", String(page.invoiceCount), "count");
        for (const r of page.items as any[]) {
          if (view === "customer") {
            add(
              s,
              `${r.customerName || "Customer unavailable"} [${r.customerId}]`,
              String(r.remainingCents),
              "minor",
              "USD",
            );
          } else {
            add(
              s,
              `Invoice ${r.invoiceId} · customer ${r.customerId} · issued ${r.issuedOn}`,
              String(r.remainingCents),
              "minor",
              "USD",
            );
          }
        }
        for (const f of facts.filter((f) => f.sourceId === s.id).slice(2)) {
          const record = (page.items as { customerId: string }[])[
            facts.filter((g) => g.sourceId === s.id).indexOf(f) - 2
          ];
          if (record) {
            f.recordId = record.customerId;
            f.recordKind = "customer";
          }
        }
        note(
          `records${index}`,
          `Showing at most20 of ${page.total} matching ${view} records. The aggregate includes the complete filtered source. Follow the source link to inspect additional records.`,
        );
        continue;
      }
      if (op.kind === "ledger") {
        let read;
        try {
          read = await this.ledger.read(
            identity,
            scope.entityId,
            period,
            ledgerId,
          );
        } catch (e) {
          if (e instanceof ApiError && e.code === "SOURCE_COVERAGE") {
            note(
              "ledger_coverage",
              "The complete imported ledger does not cover that month. Import a reconciled source covering both periods before comparing.",
            );
            continue;
          }
          throw e;
        }
        if (read.dataState !== "ready") {
          note(
            "missing_ledger",
            "No complete imported ledger source exists. Invoice balances alone cannot establish cash, revenue, expenses or profit.",
          );
          continue;
        }
        ledgerId = read.source.snapshotId;
        if (!read.mappingVerified || !read.metrics) {
          note(
            "unapproved_mapping",
            "Ledger source is imported but its statement mapping is not finance-approved in server configuration. Inspect the source or obtain approval; no financial statement is asserted.",
          );
          continue;
        }
        if (read.currency !== scope.currency) {
          note(
            "ledger_currency",
            "Ledger currency differs from this conversation. Start a new conversation in the source currency; no FX is assumed.",
          );
          continue;
        }
        const s: Source = {
          id: `s${index}`,
          label: `${read.source.sourceName} · version ${read.source.version}`,
          href: `/workspace/ledger?${new URLSearchParams({ entityId: scope.entityId, month: period, snapshotId: ledgerId })}`,
          basis: read.basis,
          capturedAt: read.source.capturedAt,
          importedAt: read.source.importedAt,
          retrievedAt: now,
          version: read.source.version,
          snapshotId: ledgerId,
        };
        sources.push(s);
        if (op.accountId) {
          const a = read.accounts.find((a) => a.id === op.accountId);
          if (!a || !("closing" in a) || !("movement" in a)) {
            note(
              "unknown_account",
              "That exact account ID is not in this source. Inspect the source account list and clarify.",
            );
            continue;
          }
          for (const [label, value] of [
            ["closing", a.closing],
            ["period movement", a.movement],
          ]) {
            add(
              s,
              `${period} ${a.name} [${a.id}] ${label}, ${a.normal}-normal`,
              value,
              "minor",
              read.currency,
              read.precision,
            );
            facts.at(-1)!.recordId = a.id;
            facts.at(-1)!.recordKind = "account";
          }
          continue;
        }
        for (const [key, value] of Object.entries(read.metrics)) {
          if (op.metric !== "all" && key !== op.metric) continue;
          add(
            s,
            `${period} ${["revenue", "expense", "profit"].includes(key) ? "period movement" : "closing balance"}: ${key}`,
            value,
            "minor",
            read.currency,
            read.precision,
          );
        }
        note(
          "ledger_basis",
          "Computed from balanced openings and complete posted journals. Drafts excluded; revenue follows posted revenue-account movements. Settling a receivable does not itself add revenue. See source accounts/journals for the arithmetic trail.",
        );
        continue;
      }
      await this.db.$transaction(
        async (tx) => {
          await this.permissions.authorize(tx, identity, scope.entityId);
          const s: Source = {
            id: `s${index}`,
            label:
              op.kind === "checklist"
                ? "Saved monthly checklist"
                : "Saved subscriptions",
            href:
              "/workspace/assistant/source?" +
              new URLSearchParams({
                kind: op.kind,
                entityId: scope.entityId,
                month: period,
              }),
            basis: `Saved database records retrieved ${now}, not accounting approvals or automatic billing. Selected month ${period}.`,
            capturedAt: null,
            importedAt: null,
            retrievedAt: now,
            version: null,
            snapshotId: null,
          };
          sources.push(s);
          if (op.kind === "checklist") {
            const rows = await tx.checklistTask.findMany({
              where: {
                organisationId: identity.organisationId,
                entityId: scope.entityId,
                month: new Date(period + "-01T00:00:00Z"),
              },
              orderBy: [{ createdAt: "asc" }, { id: "asc" }],
              take: 201,
            });
            if (rows.length > 200)
              throw new ApiError(
                503,
                "SOURCE_LIMIT",
                "Checklist exceeds source limits.",
              );
            const pending = rows.filter((r) => !r.completed);
            add(
              s,
              `${period} incomplete saved tasks`,
              String(pending.length),
              "count",
            );
            for (const r of pending.slice(0, 20))
              add(s, `Task ${r.id}`, r.title);
            note(
              `records${index}`,
              `${pending.length} of ${rows.length} saved tasks are incomplete; showing at most20. Completion is not accounting approval.`,
            );
          } else {
            const start = new Date(period + "-01T00:00:00Z"),
              end = new Date(start);
            end.setUTCMonth(end.getUTCMonth() + 1);
            const where = {
                organisationId: identity.organisationId,
                entityId: scope.entityId,
                archived: false,
                renewalDate: { gte: start, lt: end },
              },
              total = await tx.subscriptionRenewal.count({ where }),
              rows = await tx.subscriptionRenewal.findMany({
                where,
                orderBy: [{ renewalDate: "asc" }, { id: "asc" }],
                take: 20,
              });
            add(s, `${period} active saved renewals`, String(total), "count");
            for (const r of rows)
              add(
                s,
                `${r.supplierName} · ${r.subscriptionName} [${r.id}]`,
                r.renewalDate.toISOString().slice(0, 10),
              );
            note(
              `records${index}`,
              `Showing at most20 of ${total} saved renewals; dates are records, not proof of payment or renewal.`,
            );
          }
        },
        { isolationLevel: "RepeatableRead" },
      );
    }
    const currentSources = sources.filter((s) =>
      s.href.startsWith("/workspace/ledger?"),
    );
    if (
      currentSources.length === 2 &&
      currentSources[0].snapshotId === currentSources[1].snapshotId &&
      plan.operations.some(
        (o) => o.kind === "ledger" && o.period === "current",
      ) &&
      plan.operations.some(
        (o) => o.kind === "ledger" && o.period === "previous",
      )
    ) {
      const previous = previousMonth(scope.month);
      for (const metric of [
        "cash",
        "receivable",
        "revenue",
        "expense",
        "profit",
        "assets",
        "equity",
        "liabilities",
      ]) {
        const a = facts.find(
            (f) =>
              f.label.startsWith(scope.month + " ") &&
              f.label.endsWith(": " + metric),
          ),
          b = facts.find(
            (f) =>
              f.label.startsWith(previous + " ") &&
              f.label.endsWith(": " + metric),
          );
        if (a && b) {
          const delta = BigInt(a.value) - BigInt(b.value);
          if (delta > 9007199254740991n || delta < -9007199254740991n)
            throw new ApiError(
              503,
              "UNSUPPORTED_RANGE",
              "Comparison exceeds exact range.",
            );
          add(
            sources.find((s) => s.id === a.sourceId)!,
            `${scope.month} change in ${metric} from ${previous}`,
            delta.toString(),
            "minor",
            a.currency,
            a.precision,
          );
        }
      }
      note(
        "comparison_basis",
        "Comparison uses the same complete immutable ledger snapshot, source cutoff and approved mapping for both months. Change is selected month minus previous month.",
      );
    }
    if (new Set(sources.map((s) => s.snapshotId || s.id)).size > 1)
      note(
        "independent_sources",
        "Each module has its own source basis and cutoff. No automatic cross-source reconciliation or currency conversion is assumed.",
      );
    return { facts, sources, notes };
  }
}
