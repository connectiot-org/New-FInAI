import {
  BookOpen,
  ChartNoAxesCombined,
  CheckSquare,
  Receipt,
  Sparkles,
  Wallet,
} from "lucide-react";
export type PreviewView =
  "overview" | "ledger" | "receivables" | "close" | "assistant";
export const products = [
  {
    slug: "automated-general-ledger",
    name: "General ledger",
    short: "Books that tell the whole story.",
    icon: BookOpen,
    view: "ledger" as PreviewView,
    title: "Your source of truth. Without the second guessing.",
    description:
      "Follow every number from the financial statement to the journal that created it. Keep entries, reviews, and the full story together.",
    benefits: [
      [
        "A ledger with context",
        "Open a transaction, inspect its source, and follow a complete audit trail.",
      ],
      [
        "A review before every post",
        "Create balanced drafts, request approval, and keep posted history intact.",
      ],
      [
        "Clarity at every level",
        "Switch entity and period without losing sight of the details.",
      ],
    ],
    to: "/accounting/ledger",
  },
  {
    slug: "accounts-receivable",
    name: "Accounts receivable",
    short: "From invoice to insight.",
    icon: Receipt,
    view: "receivables" as PreviewView,
    title: "Keep your revenue moving. And your records connected.",
    description:
      "Bring customers, invoices, receipts, and the ledger into one considered workflow. Understand what is owed and what comes next.",
    benefits: [
      [
        "A clear view of what is owed",
        "Explore open, partially paid, and settled invoices with connected customer records.",
      ],
      [
        "From draft to receipt",
        "Build invoice lines, issue locally, and apply a demo receipt to see balances update.",
      ],
      [
        "Every receipt has a source",
        "Follow the connection from an invoice to cash and receivable journal entries.",
      ],
    ],
    to: "/receivables/invoices",
  },
  {
    slug: "accounts-payable",
    name: "Accounts payable",
    short: "A little order for every outflow.",
    icon: Wallet,
    view: "ledger" as PreviewView,
    title: "Less chasing paperwork. More knowing where things stand.",
    description:
      "Give every bill a place, an account, and a clear path to approval. See your spend with the context that matters.",
    benefits: [
      [
        "Documents beside decisions",
        "Preview a local document while reviewing a bill and its expense account.",
      ],
      [
        "Review, then approve",
        "Move from the inbox through review with clear local roles.",
      ],
      [
        "Nothing gets lost in the handoff",
        "Inspect approval history, source journals, and outstanding balances.",
      ],
    ],
    to: "/payables/bills",
  },
  {
    slug: "financial-reporting",
    name: "Financial reporting",
    short: "The big picture, down to the entry.",
    icon: ChartNoAxesCombined,
    view: "overview" as PreviewView,
    title: "A clearer answer to “how are we doing?”",
    description:
      "Bring your profit and loss, balance sheet, and cash flow together. Make the numbers easier to explore, explain, and share.",
    benefits: [
      [
        "Built from the same books",
        "Financial statements use the same posted entries as the general ledger.",
      ],
      [
        "Context makes the difference",
        "Change period and entity, compare periods, and expand account groups.",
      ],
      [
        "Follow the number",
        "Drill into an account or export a real CSV for your own analysis.",
      ],
    ],
    to: "/reports",
  },
  {
    slug: "month-end-close",
    name: "Month-end close",
    short: "Finish the month on the same page.",
    icon: CheckSquare,
    view: "close" as PreviewView,
    title: "A close with fewer loose ends.",
    description:
      "Keep owners, evidence, and reviews in one shared checklist. Make the next step visible, from the first reconciliation to the final review.",
    benefits: [
      [
        "Everyone knows the next step",
        "See tasks, due dates, owners, and status in one place.",
      ],
      [
        "Evidence stays with the work",
        "Add a note or a session-local attachment to support a completed task.",
      ],
      [
        "Confidence before the lock",
        "Request a review, approve the work, and use a local period lock.",
      ],
    ],
    to: "/close",
  },
  {
    slug: "assistant",
    name: "FinAI Assistant",
    short: "Questions, with the evidence attached.",
    icon: Sparkles,
    view: "assistant" as PreviewView,
    title: "Get to the answer. Stay close to the evidence.",
    description:
      "Explore a demonstration of conversational finance with local answers, source links, and actions that require your explicit approval.",
    benefits: [
      [
        "Your numbers, in context",
        "Ask supported questions about cash, revenue, open invoices, and close tasks.",
      ],
      [
        "Show the work",
        "Every supported answer points back to records in the demo workspace.",
      ],
      [
        "You make the final call",
        "Inspect a proposed local action and choose whether to approve it.",
      ],
    ],
    to: "/assistant",
  },
];
export const questions = [
  {
    q: "What can I explore in this demo?",
    a: "A complete local accounting workspace: journal entries, invoices, bills, bank matching, close tasks, financial statements, entities, and more. The fictional Northstar Analytics dataset covers six months.",
  },
  {
    q: "Will this connect to my bank or move real money?",
    a: "No. Bank connections, receipts, and payments are explicitly simulated. You can explore their workflows without entering credentials or moving money.",
  },
  {
    q: "Is the assistant connected to an AI model?",
    a: "This demo uses deterministic answers from local records. It shows source evidence and an explicit approval flow, but makes no model or external service calls.",
  },
  {
    q: "Where do my changes go?",
    a: "Demo business records are saved in this browser. You can reset them in Settings → Preferences. Local document previews are session-only and are never uploaded.",
  },
];
