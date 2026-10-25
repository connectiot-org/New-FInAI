import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  ChartNoAxesCombined,
  Check,
  CheckCircle2,
  Circle,
  Grip,
  Landmark,
  Mic,
  Paperclip,
  Pin,
  Plus,
  Receipt,
  Sparkles,
} from "lucide-react";
import { Line, LineChart } from "recharts";
import { useDemo } from "../../store";
import { inScope, metrics, money } from "../../demo/selectors";
import { periods } from "../../demo/seed";
/** Public-reference dashboard composition, backed by the same canonical books as the app. */
export function FinanceSnapshot({ compact = false }: { compact?: boolean }) {
  const s = useDemo(),
    m = metrics(s),
    month = s.period === "all" ? "2026-09" : s.period;
  const tasks = s.tasks.filter(
    (t) => t.entity === s.entity && t.due.startsWith(month),
  );
  const done = tasks.filter((t) => t.status === "Approved").length;
  const chart = periods.map((period) => ({
    period,
    revenue: metrics({ ...s, period }).revenue,
  }));
  const attention = [
    {
      label: "Bank items to be reconciled",
      count: s.bank.filter((b) => inScope(s, b) && !b.matched).length,
      to: "/banking/reconciliation",
    },
    {
      label: "Invoices with a balance due",
      count: s.invoices.filter(
        (i) => inScope(s, i) && i.status !== "Draft" && i.amount > i.paid,
      ).length,
      to: "/receivables/invoices?status=Outstanding",
    },
    {
      label: "Bills waiting for review",
      count: s.bills.filter(
        (b) => inScope(s, b) && ["Inbox", "In review"].includes(b.status),
      ).length,
      to: "/payables/bills?status=Inbox",
    },
    {
      label: "Journal entries in review",
      count: s.journals.filter((j) => inScope(s, j) && j.status === "In review")
        .length,
      to: "/accounting/journals?status=In+review",
    },
    {
      label: "Approved bills to be paid",
      count: s.bills.filter((b) => inScope(s, b) && b.status === "Approved")
        .length,
      to: "/payables/bills?status=Approved",
    },
  ];
  return (
    <div className={`finance-snapshot ${compact ? "is-compact" : ""}`}>
      <div className="finance-snapshot-intro">
        <h2>Rise and reconcile.</h2>
        <Link to="/demo/assistant" className="finance-ask">
          <span>
            <Sparkles size={15} />
          </span>
          <span>Ask FinAI a question or explore a local workflow</span>
          <Paperclip size={12} />
          <Mic size={12} />
        </Link>
        <div className="finance-prompts">
          <Link to="/close">What’s left on my close?</Link>
          <Link to="/reports/cash-flow">Explore the cash flow statement</Link>
          <Link to="/payables/bills">What needs a review?</Link>
          <Link to="/demo/assistant">Ask a demo question</Link>
        </div>
      </div>
      <div className="finance-section-label">
        <ChartNoAxesCombined size={12} />
        SNAPSHOT{" "}
        <span>
          {s.period === "all" ? "APR – SEP 2026" : s.period} · USD · DEMO
        </span>
      </div>
      <div className="finance-metrics metrics-grid">
        <Link
          to="/accounting/ledger?account=1000"
          className="finance-metric large"
        >
          <span>
            <Grip size={10} />
            CASH BALANCE
          </span>
          <strong>
            {compact ? money(m.cash) : money(m.cash)}
            <span>≈</span>
          </strong>
          <small>
            Closing book balance
            <br />
            From posted demo journals
          </small>
        </Link>
        <Link to="/reports/profit-and-loss" className="finance-metric large">
          <span>
            <Grip size={10} />
            REVENUE
          </span>
          <div className="finance-revenue-value">
            <strong>
              {money(m.revenue)}
              <ArrowUpRight size={17} />
            </strong>
            <span
              className="finance-sparkline"
              role="img"
              aria-label={`Monthly revenue: ${chart.map((p) => `${p.period} ${money(p.revenue)}`).join("; ")}`}
            >
              <LineChart width={105} height={45} data={chart}>
                <Line
                  type="monotone"
                  dataKey="revenue"
                  stroke="#2aaa85"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </span>
          </div>
          <small>
            Selected entity and period
            <br />
            Posted revenue accounts
          </small>
        </Link>
        <div className="finance-metric-column">
          <Link to="/payables/bills" className="finance-metric">
            <span>
              <Grip size={10} />
              EXPENSES
            </span>
            <strong>
              {money(m.expenses)}
              <ArrowUpRight size={13} />
            </strong>
          </Link>
          <Link to="/payables/bills?status=Approved" className="finance-metric">
            <span>
              <Grip size={10} />
              OUTSTANDING AP
            </span>
            <strong>
              {money(m.payables)}
              <span>≈</span>
            </strong>
          </Link>
        </div>
        <div className="finance-metric-column">
          <Link to="/reports/profit-and-loss" className="finance-metric">
            <span>
              <Grip size={10} />
              NET INCOME
            </span>
            <strong>{money(m.profit)}</strong>
          </Link>
          <Link
            to="/receivables/invoices?status=Outstanding"
            className="finance-metric"
          >
            <span>
              <Grip size={10} />
              RECEIVABLES
            </span>
            <strong>
              {money(m.receivables)}
              <span>≈</span>
            </strong>
          </Link>
        </div>
      </div>
      <div className="finance-work-grid">
        <section>
          <div className="finance-section-label">
            <ChartNoAxesCombined size={12} />
            NEEDS ACTION
          </div>
          <div className="finance-attention">
            {attention.map((a) => (
              <Link to={a.to} key={a.label}>
                <i />
                <span>{a.label}</span>
                <b>{a.count}</b>
              </Link>
            ))}
          </div>
        </section>
        <section>
          <div className="finance-section-label">
            <CheckCircle2 size={12} />
            CLOSE CHECKLIST
          </div>
          <div className="finance-close-progress">
            <strong>
              {tasks.length ? Math.round((done / tasks.length) * 100) : 0}%
            </strong>
            <span>
              {done} / {tasks.length} complete
            </span>
          </div>
          <div className="finance-close-track">
            <i
              style={{
                width: `${tasks.length ? (done / tasks.length) * 100 : 0}%`,
              }}
            />
          </div>
          <div className="finance-task-list">
            {tasks
              .filter((t) => t.status !== "Approved")
              .slice(0, 3)
              .map((t) => (
                <Link to="/close" key={t.id}>
                  <Circle size={12} />
                  <span>{t.title}</span>
                  <b>{t.status.toUpperCase()}</b>
                </Link>
              ))}
            {done === tasks.length && (
              <Link to="/close">
                <Check size={12} />
                All tasks approved
              </Link>
            )}
          </div>
        </section>
        <section>
          <div className="finance-section-label">
            <Pin size={12} />
            PINNED REPORTS
          </div>
          <div className="finance-pinned">
            {[
              {
                label: "Income statement",
                to: "/reports/profit-and-loss",
                icon: Receipt,
              },
              {
                label: "Balance sheet",
                to: "/reports/balance-sheet",
                icon: Landmark,
              },
              {
                label: "General ledger",
                to: "/accounting/ledger",
                icon: BookOpen,
              },
              {
                label: "Cash flow statement",
                to: "/reports/cash-flow",
                icon: ChartNoAxesCombined,
              },
            ].map((r) => (
              <Link to={r.to} key={r.to}>
                <r.icon size={12} />
                <span>{r.label}</span>
                <ArrowRight size={12} />
              </Link>
            ))}
            <Link to="/reports">
              <Plus size={12} />
              <span>Explore all reports</span>
            </Link>
          </div>
        </section>
      </div>
      {!compact && (
        <details className="finance-chart-alternative">
          <summary>Monthly revenue data</summary>
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th className="numeric">Revenue · USD</th>
              </tr>
            </thead>
            <tbody>
              {chart.map((p) => (
                <tr key={p.period}>
                  <td>{p.period}</td>
                  <td className="numeric">{money(p.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </div>
  );
}
