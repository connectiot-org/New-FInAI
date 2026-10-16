import {
  configureStore,
  createSlice,
  type PayloadAction,
} from "@reduxjs/toolkit";
import { useDispatch, useSelector } from "react-redux";
import { z } from "zod";
import { seed } from "../demo/seed";
import { balanced } from "../demo/selectors";
import type {
  Account,
  Automation,
  DemoService,
  DemoState,
  Invoice,
  Journal,
  Role,
} from "../types/domain";
const cents = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const line = z.object({ account: z.string(), debit: cents, credit: cents });
const schema = z.object({
  version: z.literal(1),
  entered: z.boolean(),
  profile: z.string(),
  entity: z.enum(["us", "uk"]),
  period: z.string().regex(/^(all|2026-0[4-9])$/),
  role: z.enum(["Admin", "Accountant", "Reviewer"]),
  accounts: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        type: z.enum(["Asset", "Liability", "Equity", "Revenue", "Expense"]),
        active: z.boolean(),
      }),
    )
    .min(1),
  entities: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        currency: z.literal("USD"),
        country: z.string(),
      }),
    )
    .min(1),
  customers: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      email: z.string(),
      contact: z.string(),
      entity: z.string(),
    }),
  ),
  vendors: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      email: z.string(),
      contact: z.string(),
      entity: z.string(),
    }),
  ),
  journals: z.array(
    z.object({
      id: z.string(),
      entity: z.string(),
      date: z.string(),
      memo: z.string(),
      status: z.enum(["Draft", "In review", "Approved", "Posted"]),
      lines: z.array(line),
      source: z.string().optional(),
      reversalOf: z.string().optional(),
      attachment: z.string().optional(),
    }),
  ),
  invoices: z.array(
    z.object({
      id: z.string(),
      entity: z.string(),
      customer: z.string(),
      date: z.string(),
      due: z.string(),
      description: z.string(),
      amount: cents,
      paid: cents,
      status: z.enum(["Draft", "Issued", "Partial", "Paid"]),
      department: z.string(),
      lineItems: z
        .array(
          z.object({
            description: z.string(),
            quantity: z.number().int().positive(),
            rate: cents,
          }),
        )
        .optional(),
    }),
  ),
  bills: z.array(
    z.object({
      id: z.string(),
      entity: z.string(),
      vendor: z.string(),
      date: z.string(),
      due: z.string(),
      amount: cents,
      account: z.string(),
      status: z.enum(["Inbox", "In review", "Approved", "Paid"]),
      department: z.string(),
    }),
  ),
  contracts: z.array(
    z.object({
      id: z.string(),
      entity: z.string(),
      customer: z.string(),
      name: z.string(),
      start: z.string(),
      end: z.string(),
      monthly: cents,
      months: z.number().int().positive(),
    }),
  ),
  bank: z.array(
    z.object({
      id: z.string(),
      entity: z.string(),
      date: z.string(),
      description: z.string(),
      amount: z.number().int(),
      candidate: z.string(),
      matched: z.boolean(),
    }),
  ),
  tasks: z.array(
    z.object({
      id: z.string(),
      entity: z.string(),
      title: z.string(),
      owner: z.string(),
      due: z.string(),
      status: z.enum(["To do", "Complete", "In review", "Approved"]),
      evidence: z.string(),
    }),
  ),
  automations: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      trigger: z.string(),
      threshold: cents,
      action: z.string(),
      enabled: z.boolean(),
      runs: z.array(
        z.object({
          date: z.string(),
          count: z.number().int(),
          action: z.string().optional(),
        }),
      ),
    }),
  ),
  integrations: z.array(z.string()),
  syncLog: z.array(z.string()),
  audit: z.array(
    z.object({
      id: z.string(),
      date: z.string(),
      actor: z.string(),
      action: z.string(),
      object: z.string(),
      before: z.string(),
      after: z.string(),
    }),
  ),
  locked: z.array(z.string()),
  notifications: z.boolean(),
  compact: z.boolean(),
  workspace: z.string(),
  approvalThreshold: cents,
  dimensions: z.array(z.string()),
});
const KEY = "finai-demo-v1";
export let recoveredStorage = false;
function load(): DemoState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return seed();
    const result = schema.safeParse(JSON.parse(raw));
    if (
      result.success &&
      result.data.journals.every((j) => j.status !== "Posted" || balanced(j)) &&
      result.data.invoices.every((i) => i.paid <= i.amount)
    )
      return result.data;
    recoveredStorage = true;
  } catch {
    recoveredStorage = true;
  }
  return seed();
}
export const localDemoService: DemoService = {
  async load() {
    return load();
  },
  async save(state) {
    localStorage.setItem(KEY, JSON.stringify(state));
  },
  async reset() {
    const state = seed();
    localStorage.setItem(KEY, JSON.stringify(state));
    return state;
  },
};
export type Command =
  | { kind: "enter"; profile: string }
  | { kind: "scope"; entity?: string; period?: string; role?: Role }
  | { kind: "journalSave"; journal: Journal }
  | {
      kind: "journalStep";
      id: string;
      step: "submit" | "approve" | "post" | "reverse";
    }
  | { kind: "invoiceSave"; invoice: Invoice }
  | {
      kind: "invoiceStep";
      id: string;
      step: "issue" | "receipt";
      amount?: number;
    }
  | { kind: "accountSave"; account: Account }
  | { kind: "billCode"; id: string; account: string }
  | { kind: "billStep"; id: string; step: "submit" | "approve" | "pay" }
  | { kind: "bankMatch"; id: string; matched: boolean }
  | {
      kind: "taskStep";
      id: string;
      step: "complete" | "submit" | "approve";
      evidence?: string;
    }
  | { kind: "lock"; period: string }
  | { kind: "automationSave"; automation: Automation }
  | { kind: "automationRun"; id: string }
  | { kind: "integration"; name: string; connected: boolean }
  | {
      kind: "settings";
      workspace?: string;
      notifications?: boolean;
      compact?: boolean;
      approvalThreshold?: number;
      dimensions?: string[];
    }
  | { kind: "reset" };
function apply(s: DemoState, c: Command): string | false {
  const reviewer = s.role === "Admin" || s.role === "Reviewer",
    writer = s.role !== "Reviewer";
  const today = "2026-09-30";
  const locked = (date: string) =>
    s.locked.includes(`${s.entity}:${date.slice(0, 7)}`);
  if (c.kind === "enter") {
    s.entered = true;
    s.profile = c.profile || "Alex Morgan";
    return "Entered demo workspace";
  }
  if (c.kind === "scope") {
    if (c.entity) s.entity = c.entity;
    if (c.period) s.period = c.period;
    if (c.role) s.role = c.role;
    return false;
  }
  if (c.kind === "accountSave" && writer) {
    const old = s.accounts.find((a) => a.id === c.account.id);
    if (old) Object.assign(old, c.account);
    else s.accounts.push(c.account);
    return "Account saved";
  }
  if (c.kind === "journalSave" && writer) {
    if (
      !balanced(c.journal) ||
      locked(c.journal.date) ||
      !c.journal.lines.every((l) =>
        s.accounts.some((a) => a.id === l.account && a.active),
      )
    )
      return false;
    const old = s.journals.find((j) => j.id === c.journal.id);
    if (old && old.status !== "Draft") return false;
    if (old) Object.assign(old, c.journal);
    else s.journals.unshift(c.journal);
    return "Draft journal saved";
  }
  if (c.kind === "journalStep") {
    const j = s.journals.find((j) => j.id === c.id && j.entity === s.entity);
    if (!j || locked(j.date)) return false;
    if (c.step === "submit" && j.status === "Draft" && writer && balanced(j)) {
      j.status = "In review";
      return "Journal submitted";
    }
    if (c.step === "approve" && j.status === "In review" && reviewer) {
      j.status = "Approved";
      return "Journal approved";
    }
    if (c.step === "post" && j.status === "Approved" && writer && balanced(j)) {
      j.status = "Posted";
      return "Journal posted";
    }
    if (
      c.step === "reverse" &&
      !locked(today) &&
      j.status === "Posted" &&
      writer &&
      !j.reversalOf &&
      !j.source &&
      !s.journals.some((r) => r.reversalOf === j.id)
    ) {
      s.journals.unshift({
        ...j,
        id: `REV-${j.id}`,
        date: today,
        memo: `Reversal of ${j.id} · ${j.memo}`,
        reversalOf: j.id,
        lines: j.lines.map((l) => ({
          account: l.account,
          debit: l.credit,
          credit: l.debit,
        })),
      });
      return "Journal reversed";
    }
  }
  if (c.kind === "invoiceSave" && writer) {
    if (c.invoice.amount <= 0 || locked(c.invoice.date)) return false;
    const old = s.invoices.find((i) => i.id === c.invoice.id);
    if (old && old.status !== "Draft") return false;
    if (old) Object.assign(old, c.invoice);
    else s.invoices.unshift(c.invoice);
    return "Invoice draft saved";
  }
  if (c.kind === "invoiceStep" && writer) {
    const i = s.invoices.find((i) => i.id === c.id && i.entity === s.entity);
    if (!i || locked(i.date)) return false;
    if (c.step === "issue" && i.status === "Draft") {
      i.status = "Issued";
      s.journals.unshift({
        id: `J-${i.id}`,
        entity: i.entity,
        date: i.date,
        memo: i.description,
        status: "Posted",
        source: i.id,
        lines: [
          { account: "1100", debit: i.amount, credit: 0 },
          { account: "4000", debit: 0, credit: i.amount },
        ],
      });
      return "Invoice issued locally";
    }
    if (
      c.step === "receipt" &&
      i.status !== "Draft" &&
      i.status !== "Paid" &&
      c.amount &&
      Number.isSafeInteger(c.amount) &&
      c.amount > 0 &&
      c.amount <= i.amount - i.paid
    ) {
      i.paid += c.amount;
      i.status = i.paid === i.amount ? "Paid" : "Partial";
      s.journals.unshift({
        id: `RCPT-${crypto.randomUUID().slice(0, 8)}`,
        entity: i.entity,
        date: i.date,
        memo: `Demo receipt · ${i.id}`,
        status: "Posted",
        source: i.id,
        lines: [
          { account: "1000", debit: c.amount, credit: 0 },
          { account: "1100", debit: 0, credit: c.amount },
        ],
      });
      return "Demo receipt applied";
    }
  }
  if (c.kind === "billCode" && writer) {
    const b = s.bills.find((b) => b.id === c.id && b.entity === s.entity);
    if (
      b &&
      b.status === "Inbox" &&
      s.accounts.some((a) => a.id === c.account && a.active)
    ) {
      b.account = c.account;
      return "Bill coding changed";
    }
  }
  if (c.kind === "billStep") {
    const b = s.bills.find((b) => b.id === c.id && b.entity === s.entity);
    if (!b || locked(b.date)) return false;
    if (c.step === "submit" && writer && b.status === "Inbox") {
      b.status = "In review";
      return "Bill submitted";
    }
    if (c.step === "approve" && reviewer && b.status === "In review") {
      b.status = "Approved";
      s.journals.unshift({
        id: `J-${b.id}`,
        entity: b.entity,
        date: b.date,
        memo: `Approved bill · ${b.id}`,
        source: b.id,
        status: "Posted",
        lines: [
          { account: b.account, debit: b.amount, credit: 0 },
          { account: "2000", debit: 0, credit: b.amount },
        ],
      });
      return "Bill approved";
    }
    if (c.step === "pay" && writer && b.status === "Approved") {
      b.status = "Paid";
      s.journals.unshift({
        id: `PAY-${b.id}`,
        entity: b.entity,
        date: b.date,
        memo: `Demo payment · ${b.id}`,
        source: b.id,
        status: "Posted",
        lines: [
          { account: "2000", debit: b.amount, credit: 0 },
          { account: "1000", debit: 0, credit: b.amount },
        ],
      });
      return "Demo bill payment recorded";
    }
  }
  if (c.kind === "bankMatch" && writer) {
    const item = s.bank.find((b) => b.id === c.id && b.entity === s.entity),
      j = s.journals.find(
        (j) =>
          j.id === item?.candidate &&
          j.entity === s.entity &&
          j.status === "Posted",
      );
    if (
      item &&
      j &&
      j.lines
        .filter((l) => l.account === "1000")
        .reduce((a, l) => a + l.debit - l.credit, 0) === item.amount
    ) {
      item.matched = c.matched;
      return c.matched ? "Bank item matched" : "Bank item unmatched";
    }
  }
  if (c.kind === "taskStep") {
    const t = s.tasks.find((t) => t.id === c.id && t.entity === s.entity);
    if (!t || locked(t.due)) return false;
    if (c.step === "complete" && writer && t.status === "To do") {
      t.evidence = c.evidence || "Completed in local demo";
      t.status = "Complete";
      return "Close task completed";
    }
    if (c.step === "submit" && writer && t.status === "Complete") {
      t.status = "In review";
      return "Close review requested";
    }
    if (c.step === "approve" && reviewer && t.status === "In review") {
      t.status = "Approved";
      return "Close task approved";
    }
  }
  if (c.kind === "lock" && s.role === "Admin") {
    const key = `${s.entity}:${c.period}`;
    if (s.locked.includes(key)) s.locked = s.locked.filter((k) => k !== key);
    else s.locked.push(key);
    return "Period lock changed";
  }
  if (c.kind === "automationSave" && s.role === "Admin") {
    const old = s.automations.find((a) => a.id === c.automation.id);
    if (old) Object.assign(old, c.automation);
    else s.automations.push(c.automation);
    return "Automation saved";
  }
  if (c.kind === "automationRun" && s.role === "Admin") {
    const a = s.automations.find((a) => a.id === c.id);
    if (!a || !a.enabled) return false;
    const count =
      a.trigger === "Invoice issued"
        ? s.invoices.filter(
            (i) =>
              i.entity === s.entity &&
              i.status !== "Draft" &&
              i.amount >= a.threshold,
          ).length
        : s.bills.filter(
            (b) => b.entity === s.entity && b.amount >= a.threshold,
          ).length;
    a.runs.unshift({ date: new Date().toISOString(), count, action: a.action });
    s.syncLog.unshift(
      `${a.name} · ${a.action === "Flag for review" ? "flagged" : "prepared summary for"} ${count} records in this local demo`,
    );
    return `Automation ran · ${count} records · ${a.action}`;
  }
  if (c.kind === "integration" && s.role === "Admin") {
    s.integrations = s.integrations.filter((n) => n !== c.name);
    if (c.connected) s.integrations.push(c.name);
    s.syncLog.unshift(
      `${c.name} · ${c.connected ? "simulated connection completed" : "demo disconnected"} · ${new Date().toISOString()}`,
    );
    return "Demo integration updated";
  }
  if (c.kind === "settings" && s.role === "Admin") {
    const { kind: _, ...settings } = c;
    void _;
    Object.assign(s, settings);
    return "Workspace settings saved";
  }
  return false;
}
function recordSnapshot(s: DemoState, c: Command): string {
  const id =
    "id" in c
      ? c.id
      : "journal" in c
        ? c.journal.id
        : "invoice" in c
          ? c.invoice.id
          : "account" in c
            ? c.account.id
            : "automation" in c
              ? c.automation.id
              : "";
  const record = c.kind.startsWith("journal")
    ? s.journals.find((j) => j.id === id)
    : c.kind.startsWith("invoice")
      ? s.invoices.find((i) => i.id === id)
      : c.kind.startsWith("bill")
        ? s.bills.find((b) => b.id === id)
        : c.kind === "accountSave"
          ? s.accounts.find((a) => a.id === id)
          : c.kind === "bankMatch"
            ? s.bank.find((b) => b.id === id)
            : c.kind === "taskStep"
              ? s.tasks.find((t) => t.id === id)
              : c.kind.startsWith("automation")
                ? s.automations.find((a) => a.id === id)
                : c.kind === "integration"
                  ? s.integrations
                  : c.kind === "lock"
                    ? s.locked
                    : {
                        workspace: s.workspace,
                        notifications: s.notifications,
                        compact: s.compact,
                        approvalThreshold: s.approvalThreshold,
                        dimensions: s.dimensions,
                      };
  return JSON.stringify(record ?? null);
}
const slice = createSlice({
  name: "demo",
  initialState: load(),
  reducers: {
    command(s, action: PayloadAction<Command>) {
      const c = action.payload;
      if (c.kind === "reset") {
        const fresh = seed();
        fresh.entered = true;
        return fresh;
      }
      const before = recordSnapshot(s as DemoState, c);
      const result = apply(s as DemoState, c);
      if (result && c.kind !== "enter") {
        const object =
          "id" in c
            ? c.id
            : "journal" in c
              ? c.journal.id
              : "invoice" in c
                ? c.invoice.id
                : "account" in c
                  ? c.account.id
                  : "automation" in c
                    ? c.automation.id
                    : c.kind;
        s.audit.unshift({
          id: crypto.randomUUID(),
          date: new Date().toISOString(),
          actor: `${s.profile} (${s.role})`,
          action: result,
          object,
          before,
          after: recordSnapshot(s as DemoState, c),
        });
      }
    },
  },
});
export const { command } = slice.actions;
export const store = configureStore({ reducer: { demo: slice.reducer } });
store.subscribe(() => {
  try {
    localStorage.setItem(KEY, JSON.stringify(store.getState().demo));
  } catch {
    window.dispatchEvent(new Event("finai-storage-error"));
  }
});
export const useAppDispatch = useDispatch.withTypes<typeof store.dispatch>();
export const useDemo = () =>
  useSelector((state: ReturnType<typeof store.getState>) => state.demo);
