import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDownLeft,
  ArrowUpRight,
  BookOpen,
  ChartNoAxesCombined,
  Check,
  CheckSquare,
  ChevronDown,
  LayoutDashboard,
  Receipt,
  Search,
  Sparkles,
} from "lucide-react";
import { useDemo } from "../../store";
import {
  inScope,
  ledger,
  metrics,
  money,
  shortMoney,
} from "../../demo/selectors";
import { periods } from "../../demo/seed";
import type { PreviewView } from "./content";
const views = [
  { key: "overview", name: "Overview", icon: LayoutDashboard },
  { key: "ledger", name: "General ledger", icon: BookOpen },
  { key: "receivables", name: "Receivables", icon: Receipt },
  { key: "close", name: "Month-end close", icon: CheckSquare },
  { key: "assistant", name: "FinAI Assistant", icon: Sparkles },
] as const;
export function ProductPreview({
  view,
  onViewChange,
}: {
  view: PreviewView;
  onViewChange: (v: PreviewView) => void;
}) {
  const s = useDemo(),
    m = metrics(s),
    [query, setQuery] = useState("");
  const tasks = s.tasks.filter(
    (t) =>
      t.entity === s.entity &&
      t.due.startsWith(s.period === "all" ? "2026-09" : s.period),
  );
  const change = (v: PreviewView) => {
    setQuery("");
    onViewChange(v);
  };
  const title = views.find((v) => v.key === view)?.name;
  const lines = ledger(s)
    .filter((l) =>
      `${l.journal} ${l.memo}`.toLowerCase().includes(query.toLowerCase()),
    )
    .slice(0, 5);
  const invoices = s.invoices
    .filter(
      (i) =>
        inScope(s, i) &&
        `${i.id} ${s.customers.find((c) => c.id === i.customer)?.name}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .slice(0, 5);
  return (
    <div className="product-window">
      <div className="window-chrome">
        <div>
          <i />
          <i />
          <i />
        </div>
        <span>finai / northstar-analytics</span>
        <span className="preview-demo-label">Demo workspace</span>
      </div>
      <div className="product-window-body">
        <aside className="preview-sidebar">
          <Link to="/" className="preview-brand">
            <span>F</span>FinAI
          </Link>
          <div className="preview-workspace">
            <b>N</b>
            <span>
              Northstar Analytics<small>Demo workspace</small>
            </span>
            <ChevronDown size={12} />
          </div>
          <div className="preview-nav-label">WORKSPACE</div>
          {views.map((v) => (
            <button
              key={v.key}
              className={view === v.key ? "selected" : ""}
              onClick={() => change(v.key)}
            >
              <v.icon size={15} />
              {v.name}
            </button>
          ))}
          <div className="preview-sidebar-bottom">
            <span className="preview-avatar">AM</span>
            <span>
              Alex Morgan<small>Demo administrator</small>
            </span>
          </div>
        </aside>
        <section
          className="preview-main"
          aria-label={`${title} product preview`}
        >
          <div className="preview-breadcrumb">
            Workspace <span>/</span>
            <b>{title}</b>
            <div>
              <span>USD</span>
              <span className="preview-avatar">AM</span>
            </div>
          </div>
          <div className="preview-page">
            <div className="preview-heading">
              <div>
                <span>YOUR FINANCES, CONNECTED</span>
                <h3>{title}</h3>
              </div>
              <Link
                to={
                  view === "ledger"
                    ? "/accounting/ledger"
                    : view === "receivables"
                      ? "/receivables/invoices"
                      : view === "close"
                        ? "/close"
                        : view === "assistant"
                          ? "/assistant"
                          : "/overview"
                }
              >
                Open workspace
                <ArrowUpRight size={12} />
              </Link>
            </div>
            {view === "overview" ? (
              <>
                <div className="preview-metrics">
                  {[
                    { label: "Cash balance", value: m.cash },
                    { label: "Revenue", value: m.revenue },
                    { label: "Net income", value: m.profit },
                  ].map((v) => (
                    <div key={v.label}>
                      <span>
                        {v.label}
                        <ArrowUpRight size={12} />
                      </span>
                      <strong>{money(v.value)}</strong>
                      <small>Selected entity · USD</small>
                    </div>
                  ))}
                </div>
                <div className="preview-analysis">
                  <div className="preview-chart">
                    <div className="preview-section-heading">
                      <strong>Revenue over time</strong>
                      <ChartNoAxesCombined size={14} />
                    </div>
                    <div
                      className="preview-bars"
                      role="img"
                      aria-label={`Revenue by month: ${periods.map((period) => `${period}: ${money(metrics({ ...s, period }).revenue)}`).join("; ")}`}
                    >
                      {periods.map((p) => {
                        const revenue = metrics({ ...s, period: p }).revenue;
                        return (
                          <div key={p}>
                            <span>{shortMoney(revenue)}</span>
                            <i
                              style={{
                                height: `${Math.max(6, Math.min(130, revenue / 60000))}px`,
                              }}
                            />
                            <small>
                              {new Date(`${p}-02`).toLocaleDateString("en-US", {
                                month: "short",
                              })}
                            </small>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="preview-close">
                    <strong>Month-end close</strong>
                    <div className="preview-close-number">
                      {tasks.filter((t) => t.status === "Approved").length}
                      <span>/{tasks.length}</span>
                    </div>
                    <span>tasks approved</span>
                    {tasks.slice(0, 3).map((t) => (
                      <div className="preview-task" key={t.id}>
                        <i className={t.status === "Approved" ? "done" : ""}>
                          {t.status === "Approved" && <Check size={9} />}
                        </i>
                        <span>{t.title}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="preview-cash-row">
                  <ArrowDownLeft size={18} />
                  <span>Accounts receivable</span>
                  <b>{money(m.receivables)}</b>
                  <Link to="/receivables/invoices">
                    View invoices
                    <ArrowUpRight size={12} />
                  </Link>
                </div>
              </>
            ) : view === "ledger" || view === "receivables" ? (
              <>
                <div className="preview-table-tools">
                  <label>
                    <Search size={13} />
                    <input
                      aria-label="Search product preview"
                      placeholder={
                        view === "ledger"
                          ? "Search journal entries…"
                          : "Search invoices…"
                      }
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </label>
                  <span>
                    {s.period === "all" ? "Apr – Sep 2026" : s.period}
                    <ChevronDown size={12} />
                  </span>
                </div>
                <div className="preview-table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>
                          {view === "ledger" ? "Journal entry" : "Invoice"}
                        </th>
                        <th>
                          {view === "ledger" ? "Description" : "Customer"}
                        </th>
                        <th>Status</th>
                        <th className="numeric">
                          {view === "ledger" ? "Debit" : "Amount"}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {view === "ledger"
                        ? lines.map((l) => (
                            <tr key={l.id}>
                              <td>
                                <Link to={`/accounting/journals/${l.journal}`}>
                                  {l.journal}
                                </Link>
                              </td>
                              <td>{l.memo}</td>
                              <td>
                                <span className="preview-status">Posted</span>
                              </td>
                              <td className="numeric">{money(l.debit)}</td>
                            </tr>
                          ))
                        : invoices.map((i) => (
                            <tr key={i.id}>
                              <td>
                                <Link to={`/receivables/invoices/${i.id}`}>
                                  {i.id}
                                </Link>
                              </td>
                              <td>
                                {
                                  s.customers.find((c) => c.id === i.customer)
                                    ?.name
                                }
                              </td>
                              <td>
                                <span className="preview-status">
                                  {i.status}
                                </span>
                              </td>
                              <td className="numeric">{money(i.amount)}</td>
                            </tr>
                          ))}
                    </tbody>
                  </table>
                  {(view === "ledger" ? !lines.length : !invoices.length) && (
                    <p className="preview-no-results">
                      No matching demo records. Try another search.
                    </p>
                  )}
                </div>
                <div className="preview-table-bottom">
                  <span>Connected to the local demo ledger</span>
                  <span>Amounts in USD</span>
                </div>
              </>
            ) : view === "close" ? (
              <div className="preview-close-list">
                {tasks.map((t) => (
                  <Link key={t.id} to="/close">
                    <i className={t.status === "Approved" ? "done" : ""}>
                      {t.status === "Approved" && <Check size={12} />}
                    </i>
                    <div>
                      <strong>{t.title}</strong>
                      <small>
                        {t.owner} · {t.due}
                      </small>
                    </div>
                    <span className="preview-status">{t.status}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="preview-assistant">
                <span>
                  <Sparkles size={19} />
                </span>
                <h4>A little clarity goes a long way.</h4>
                <p>
                  Closing cash is <b>{money(m.cash)}</b>. Explore the supporting
                  ledger entries to see the full picture.
                </p>
                <Link to="/accounting/ledger?account=1000">
                  Cash ledger
                  <ArrowUpRight size={12} />
                </Link>
                <div>Demo responses · No model connection</div>
                <Link className="preview-ask" to="/assistant">
                  Ask in the demo
                  <Sparkles size={14} />
                </Link>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
