// Synthetic provider evaluation only. Default does not make a paid request.
import { readFile } from "node:fs/promises";
import {
  OpenRouterProvider,
  ProviderFailure,
} from "../dist/src/assistant/provider.js";
import { validateLedger, calculateLedger } from "../dist/src/ledger/source.js";
const args = process.argv.slice(2),
  provider = new OpenRouterProvider();
if (args.some((x) => x !== "--live-synthetic")) {
  console.error(
    "Use evaluate-assistant.mts [--live-synthetic]. Only synthetic fixture data is eligible.",
  );
  process.exitCode = 1;
} else if (!provider.configured) {
  console.log(
    "BLOCKED: approved provider/model/key/privacy routing/price caps/daily token limit are not fully configured. No model request made.",
  );
  process.exitCode = 2;
} else if (!args.includes("--live-synthetic")) {
  console.log(
    "Configuration present. Dry run only: --live-synthetic explicitly permits up to two synthetic turns/four model calls (conservative allowance100000 tokens). Provider account spend cap and processing approval must already apply.",
  );
} else if (provider.dailyLimit < 100000) {
  console.log(
    "BLOCKED: the two-case evaluation requires a configured allowance of at least100000 tokens; no model request made.",
  );
  process.exitCode = 2;
} else
  try {
    const input = validateLedger(
        JSON.parse(
          await readFile(
            new URL(
              "../../contracts/examples/assistant-ledger.synthetic.json",
              import.meta.url,
            ),
            "utf8",
          ),
        ),
      ),
      metrics = calculateLedger(input, "2026-09").metrics;
    const facts = Object.entries(metrics).map(([key, value], i) => ({
      id: `f${i + 1}`,
      label: `2026-09 ${key}`,
      value,
      unit: "minor",
      currency: "USD",
      precision: 2,
      sourceId: "synthetic-ledger",
    }));
    for (const c of [
      {
        id: "closing_cash",
        question: "What is our closing cash balance?",
        metric: "cash",
        value: "105000",
      },
      {
        id: "period_revenue",
        question:
          "Did receiving the customer payment add to period revenue? Show the period revenue source amount.",
        metric: "revenue",
        value: "25000",
      },
    ]) {
      const signal = AbortSignal.timeout(30000),
        p = await provider.plan(
          {
            question: c.question,
            scope: { month: "2026-09", currency: "USD" },
            available: ["ledger"],
            synthetic: true,
            preference: { detail: "detailed", note: "" },
            recent: [],
          },
          signal,
        );
      if (
        p.operations.some(
          (o) =>
            o.kind !== "ledger" ||
            o.period !== "current" ||
            o.accountId ||
            o.customerId,
        )
      )
        throw new ProviderFailure("EVALUATION_PLAN_MISMATCH");
      const result = await provider.compose(
        {
          question: c.question,
          scope: { month: "2026-09", currency: "USD" },
          preference: { detail: "detailed", note: "" },
          evidence: {
            facts,
            notes: {
              basis:
                "Complete posted synthetic source. Opening equity is not revenue; receipt only reclassifies cash/receivables.",
            },
          },
        },
        signal,
      );
      const target = facts.find((f) => f.label.endsWith(c.metric))!;
      if (
        !result.factIds.includes(target.id) ||
        target.value !== c.value ||
        result.factIds.some((id) => !facts.some((f) => f.id === id))
      )
        throw new ProviderFailure("EVALUATION_FACT_MISMATCH");
      console.log(
        JSON.stringify({
          case: c.id,
          status: "passed",
          model: provider.model,
          policy: "grounded-facts-v1",
          synthetic: true,
        }),
      );
    }
  } catch (e) {
    console.error(
      JSON.stringify({
        status: "failed",
        code: e instanceof ProviderFailure ? e.code : "EVALUATION_UNAVAILABLE",
        synthetic: true,
      }),
    );
    process.exitCode = 1;
  }
