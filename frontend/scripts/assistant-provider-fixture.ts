// Controlled model fixture for full-path tests only. Never wired in production.
import {
  plan,
  composition,
} from "../../backend/dist/src/assistant/validation.js";
export const controlledAssistantProvider = {
  configured: true,
  model: "controlled-provider-fixture",
  dailyLimit: 10000000,
  async plan(input: unknown) {
    const x = input as {
      question: string;
      recent: { plan: { operations: unknown[] } }[];
    };
    const q = x.question.toLowerCase();
    let kind = "receivables",
      period = "current",
      reason = "none";
    if (/last month|previous month/.test(q)) period = "previous";
    if (/cash|revenue|profit|expense|ledger/.test(q)) kind = "ledger";
    else if (/checklist|close|task/.test(q)) kind = "checklist";
    else if (/subscription|renew/.test(q)) kind = "subscriptions";
    else if (/behind|invoice|records/.test(q)) kind = "invoices";
    else if (/secret|other tenant|delete all|pay /.test(q)) {
      kind = "unsupported";
      reason = "unsupported";
    }
    return plan.parse({
      operations: [
        {
          kind,
          period,
          customerId: null,
          accountId: null,
          metric: "all",
          reason,
        },
      ],
    });
  },
  async compose(input: unknown) {
    const x = input as {
      preference: { detail: string };
      evidence: { facts: { id: string }[]; notes: Record<string, string> };
    };
    return composition.parse({
      factIds: x.evidence.facts
        .slice(0, x.preference.detail === "detailed" ? 12 : 3)
        .map((f) => f.id),
      noteIds: Object.keys(x.evidence.notes).slice(0, 8),
    });
  },
};
