import { Link } from "react-router-dom";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  CircleAlert,
  Plus,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useDemo } from "../store";
import { metrics, money, shortMoney, inScope } from "../demo/selectors";
import { periods } from "../demo/seed";
import { Metric, PageHeader } from "../components/shared/Common";
import { Badge } from "../components/ui";
export function Overview() {
  const s = useDemo(),
    m = metrics(s),
    tasks = s.tasks.filter(
      (t) =>
        t.entity === s.entity &&
        t.due.startsWith(s.period === "all" ? "2026-09" : s.period),
    ),
    done = tasks.filter((t) => t.status === "Approved").length;
  const chart = periods
    .filter((p) => s.period === "all" || p === s.period)
    .map((period) => {
      const v = metrics({ ...s, period });
      return {
        month: new Date(`${period}-02`).toLocaleDateString("en-US", {
          month: "short",
        }),
        revenue: v.revenue,
        expenses: v.expenses,
      };
    });
  const invoices = s.invoices.filter(
    (i) => inScope(s, i) && i.amount > i.paid && i.status !== "Draft",
  );
  return (
    <>
      <PageHeader
        eyebrow="YOUR FINANCES, IN FOCUS"
        title="Overview"
        description="A clear picture of your business, all in one place."
        action={
          <Link className="button primary" to="/accounting/journals?new=1">
            <Plus size={16} />
            New journal entry
          </Link>
        }
      />
      <div className="overview-greeting">
        <div>
          <span className="live-dot" />
          Your books are up to date
          <span className="muted"> · Based on local demo transactions</span>
        </div>
        <Link to="/audit-log">
          View activity
          <ArrowUpRight size={13} />
        </Link>
      </div>
      <div className="metrics-grid">
        <Metric
          label="Cash balance"
          value={m.cash}
          note="Closing balance"
          to="/accounting/ledger?account=1000"
        />
        <Metric
          label="Revenue"
          value={m.revenue}
          note="Selected period"
          to="/reports/profit-and-loss"
        />
        <Metric
          label="Operating expenses"
          value={m.expenses}
          note="Selected period"
          to="/payables/bills"
        />
        <Metric
          label="Net income"
          value={m.profit}
          note="Revenue less expenses"
          to="/reports/profit-and-loss"
        />
      </div>
      <div className="overview-main">
        <section className="panel chart-panel">
          <div className="section-heading">
            <div>
              <h2>Revenue & expenses</h2>
              <p className="muted">Your business performance over time</p>
            </div>
            <span className="tag">USD</span>
          </div>
          <div className="chart-legend">
            <span>
              <i />
              Revenue
            </span>
            <span>
              <i />
              Expenses
            </span>
          </div>
          <div className="chart">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={chart}
                margin={{ top: 12, right: 12, bottom: 0, left: 5 }}
              >
                <defs>
                  <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#457d6b" stopOpacity={0.14} />
                    <stop offset="100%" stopColor="#457d6b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  vertical={false}
                  stroke="#e9eeeb"
                  strokeDasharray="3 3"
                />
                <XAxis
                  dataKey="month"
                  axisLine={false}
                  tickLine={false}
                  tickMargin={12}
                  fontSize={12}
                />
                <YAxis
                  tickFormatter={(v) => shortMoney(Number(v))}
                  axisLine={false}
                  tickLine={false}
                  width={65}
                  fontSize={11}
                />
                <Tooltip formatter={(v) => money(Number(v))} />
                <Area
                  isAnimationActive={false}
                  type="monotone"
                  dataKey="revenue"
                  stroke="#39745f"
                  strokeWidth={2.5}
                  fill="url(#revenueFill)"
                />
                <Area
                  isAnimationActive={false}
                  type="monotone"
                  dataKey="expenses"
                  stroke="#b5bea8"
                  strokeWidth={2}
                  fill="transparent"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <details className="chart-alternative">
            <summary>View chart data</summary>
            <table>
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Revenue</th>
                  <th>Expenses</th>
                </tr>
              </thead>
              <tbody>
                {chart.map((r) => (
                  <tr key={r.month}>
                    <td>{r.month}</td>
                    <td>{money(r.revenue)}</td>
                    <td>{money(r.expenses)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </section>
        <section className="panel close-card">
          <div className="section-heading">
            <h2>
              {s.period === "all"
                ? "September"
                : new Date(`${s.period}-02`).toLocaleDateString("en-US", {
                    month: "long",
                  })}{" "}
              close
            </h2>
            <span className="tag">
              {done}/{tasks.length}
            </span>
          </div>
          <div className="close-number">
            {Math.round((done / tasks.length) * 100)}
            <span>%</span>
          </div>
          <p className="muted">of close tasks approved</p>
          <div className="progress-track">
            <div style={{ width: `${(done / tasks.length) * 100}%` }} />
          </div>
          <div className="close-checklist">
            {tasks.slice(0, 4).map((t) => (
              <Link to="/close" key={t.id}>
                <span
                  className={
                    t.status === "Approved"
                      ? "check-circle done"
                      : "check-circle"
                  }
                >
                  {t.status === "Approved" && <Check size={12} />}
                </span>
                {t.title}
              </Link>
            ))}
          </div>
          <Link className="inline-link" to="/close">
            Go to month-end close
            <ArrowRight size={15} />
          </Link>
        </section>
      </div>
      <div className="overview-secondary">
        <section className="panel">
          <div className="section-heading">
            <h2>Money in & out</h2>
            <span className="muted">Outstanding balances</span>
          </div>
          <Link
            className="balance-row"
            to="/receivables/invoices?status=Outstanding"
          >
            <div className="balance-icon">
              <ArrowDownLeft size={18} />
            </div>
            <div>
              <strong>Accounts receivable</strong>
              <p>{invoices.length} open invoices · selected period</p>
            </div>
            <strong>{money(m.receivables)}</strong>
            <ArrowUpRight size={16} />
          </Link>
          <Link className="balance-row" to="/payables/bills?status=Approved">
            <div className="balance-icon outgoing">
              <ArrowUpRight size={18} />
            </div>
            <div>
              <strong>Accounts payable</strong>
              <p>Approved, unpaid bills</p>
            </div>
            <strong>{money(m.payables)}</strong>
            <ArrowUpRight size={16} />
          </Link>
        </section>
        <section className="panel">
          <div className="section-heading">
            <h2>Needs your attention</h2>
            <CircleAlert size={17} />
          </div>
          <Link className="attention-row" to="/payables/bills?status=Inbox">
            <div>
              <strong>Review incoming bills</strong>
              <p>Code and submit expenses for approval</p>
            </div>
            <Badge>
              {
                s.bills.filter((b) => inScope(s, b) && b.status === "Inbox")
                  .length
              }{" "}
              pending
            </Badge>
          </Link>
          <Link className="attention-row" to="/banking/reconciliation">
            <div>
              <strong>Finish bank reconciliation</strong>
              <p>Confirm suggested transaction matches</p>
            </div>
            <Badge>
              {s.bank.filter((b) => inScope(s, b) && !b.matched).length}{" "}
              unmatched
            </Badge>
          </Link>
        </section>
      </div>
      <section className="panel activity-panel">
        <div className="section-heading">
          <h2>Recent activity</h2>
          <Link className="inline-link" to="/audit-log">
            View all
            <ArrowRight size={14} />
          </Link>
        </div>
        {s.audit.slice(0, 4).map((a) => (
          <div className="activity-item" key={a.id}>
            <span className="activity-dot" />
            <div>
              <strong>{a.action}</strong>
              <p>
                {a.actor} · {a.object}
              </p>
            </div>
            <time>{new Date(a.date).toLocaleDateString()}</time>
          </div>
        ))}
      </section>
    </>
  );
}
