import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowDownToLine,
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  FileBarChart,
  Printer,
} from "lucide-react";
import { useDemo, useAppDispatch, command } from "../store";
import {
  balances,
  downloadCsv,
  inScope,
  ledger,
  metrics,
  money,
} from "../demo/selectors";
import { PageHeader, Back, MoneyCell } from "../components/shared/Common";
import { DataTable } from "../components/shared/Table";
import { Badge } from "../components/ui";
import type { DemoState } from "../types/domain";
export function Reports() {
  const [saved, setSaved] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("finai-saved-reports") || "[]");
    } catch {
      return [];
    }
  });
  const reports = [
    {
      path: "profit-and-loss",
      name: "Profit & loss",
      description: "Revenue, operating expenses, and net income.",
    },
    {
      path: "balance-sheet",
      name: "Balance sheet",
      description: "Assets, liabilities, and equity at a point in time.",
    },
    {
      path: "cash-flow",
      name: "Cash flow",
      description: "Operating, investing, and financing cash movements.",
    },
  ];
  return (
    <>
      <PageHeader
        title="Reports"
        description="Financial clarity, built from your posted ledger."
      />
      <h2 className="section-title">Financial statements</h2>
      <div className="report-catalog">
        {reports.map((r) => (
          <section className="panel report-card" key={r.path}>
            <FileBarChart size={25} />
            <h2>{r.name}</h2>
            <p>{r.description}</p>
            <div>
              <Link className="button primary" to={`/reports/${r.path}`}>
                Open report
                <ArrowUpRight size={14} />
              </Link>
              <button
                onClick={() => {
                  const next = saved.includes(r.path)
                    ? saved.filter((p) => p !== r.path)
                    : [...saved, r.path];
                  setSaved(next);
                  localStorage.setItem(
                    "finai-saved-reports",
                    JSON.stringify(next),
                  );
                }}
              >
                {saved.includes(r.path) ? "Unsave" : "Save view"}
              </button>
            </div>
          </section>
        ))}
      </div>
      <h2 className="section-title">Saved demo views</h2>
      {saved.length ? (
        saved.map((p) => (
          <Link className="list-link panel" key={p} to={`/reports/${p}`}>
            {reports.find((r) => r.path === p)?.name}
          </Link>
        ))
      ) : (
        <p className="muted">Save a report above to keep it here.</p>
      )}
    </>
  );
}
interface ReportRow {
  id: string;
  name: string;
  value: number;
  account?: string;
}
interface ReportGroup {
  name: string;
  rows: ReportRow[];
}
const previous = (period: string) =>
  period === "all"
    ? "2026-03"
    : `2026-${String(Number(period.slice(5)) - 1).padStart(2, "0")}`;
function reportData(
  s: DemoState,
  kind: string,
): {
  groups: ReportGroup[];
  total: number;
  totalLabel: string;
  check?: number;
  extra?: ReportRow[];
} {
  const b = balances(s, kind === "balance-sheet");
  const rows = (type: string, sign = 1): ReportRow[] =>
    s.accounts
      .filter((a) => a.type === type)
      .map((a) => ({
        id: a.id,
        name: a.name,
        value: (b[a.id] ?? 0) * sign,
        account: a.id,
      }));
  if (kind === "profit-and-loss") {
    const revenue = rows("Revenue", -1),
      expenses = rows("Expense");
    return {
      groups: [
        { name: "Revenue", rows: revenue },
        { name: "Operating expenses", rows: expenses },
      ],
      total:
        revenue.reduce((v, a) => v + a.value, 0) -
        expenses.reduce((v, a) => v + a.value, 0),
      totalLabel: "Net income",
    };
  }
  if (kind === "balance-sheet") {
    const assets = rows("Asset"),
      liabilities = rows("Liability", -1),
      equity = rows("Equity", -1),
      earnings = s.accounts.reduce(
        (v, a) =>
          v + (["Revenue", "Expense"].includes(a.type) ? -(b[a.id] ?? 0) : 0),
        0,
      );
    equity.push({
      id: "earnings",
      name: "Current earnings · cumulative",
      value: earnings,
      account: undefined,
    });
    const sum = (r: ReportRow[]) => r.reduce((v, a) => v + a.value, 0);
    return {
      groups: [
        { name: "Assets", rows: assets },
        { name: "Liabilities", rows: liabilities },
        { name: "Equity", rows: equity },
      ],
      total: sum(liabilities) + sum(equity),
      totalLabel: "Total liabilities & equity",
      check: sum(assets) - sum(liabilities) - sum(equity),
    };
  }
  const cash = ledger(s).filter(
    (l) => l.account === "1000" || l.account === "1010",
  );
  const grouped: Record<string, number> = {
    Operating: 0,
    Investing: 0,
    Financing: 0,
  };
  for (const l of cash) {
    const j = s.journals.find((j) => j.id === l.journal)!;
    const other = j.lines.filter((x) => !["1000", "1010"].includes(x.account));
    const group = other.some(
      (x) =>
        s.accounts.find((a) => a.id === x.account)?.type === "Equity" ||
        x.account === "2300",
    )
      ? "Financing"
      : other.some((x) => ["1300", "1500"].includes(x.account))
        ? "Investing"
        : "Operating";
    grouped[group] += l.debit - l.credit;
  }
  const prior = balances({ ...s, period: previous(s.period) }, true),
    end = balances(s, true);
  const opening =
      s.period === "all" ? 0 : (prior["1000"] ?? 0) + (prior["1010"] ?? 0),
    closing = (end["1000"] ?? 0) + (end["1010"] ?? 0),
    net = Object.values(grouped).reduce((a, b) => a + b, 0);
  return {
    groups: Object.entries(grouped).map(([name, value]) => ({
      name: `${name} activities`,
      rows: [
        {
          id: name,
          name: `Net cash from ${name.toLowerCase()} activities`,
          value,
          account: "1000",
        },
      ],
    })),
    total: net,
    totalLabel: "Net change in cash",
    check: closing - opening - net,
    extra: [
      { id: "opening", name: "Beginning cash balance", value: opening },
      { id: "closing", name: "Ending cash balance", value: closing },
    ],
  };
}
export function Statement({
  kind,
}: {
  kind: "profit-and-loss" | "balance-sheet" | "cash-flow";
}) {
  const s = useDemo(),
    [collapsed, setCollapsed] = useState<string[]>([]),
    [compare, setCompare] = useState(true);
  const result = reportData(s, kind),
    prior = reportData({ ...s, period: previous(s.period) }, kind),
    titles = {
      "profit-and-loss": "Profit & loss",
      "balance-sheet": "Balance sheet",
      "cash-flow": "Cash flow",
    };
  const priorRow = (id: string) =>
    prior.groups.flatMap((g) => g.rows).find((r) => r.id === id)?.value ?? 0;
  return (
    <>
      <Back to="/reports" label="Reports" />
      <PageHeader
        title={titles[kind]}
        description={`${s.entities.find((e) => e.id === s.entity)?.name} · USD · Posted entries only`}
        action={
          <>
            <button
              onClick={() =>
                downloadCsv(`${kind}.csv`, [
                  ["Account", "Current USD", "Prior USD"],
                  ...result.groups
                    .flatMap((g) => g.rows)
                    .map((r) => [r.name, r.value / 100, priorRow(r.id) / 100]),
                  [result.totalLabel, result.total / 100, prior.total / 100],
                ])
              }
            >
              <ArrowDownToLine size={15} />
              Export CSV
            </button>
            <button onClick={() => window.print()}>
              <Printer size={15} />
              Print
            </button>
          </>
        }
      />
      <div className="report-options">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={compare}
            onChange={(e) => setCompare(e.target.checked)}
          />
          Compare with previous{" "}
          {s.period === "all" ? "unseeded six months" : "month"}
        </label>
        <span className="muted">Change period in the top selector</span>
      </div>
      <section className="panel statement">
        <div className="statement-title">
          <h2>{s.workspace}</h2>
          <p>{titles[kind]}</p>
          <span>
            {s.period === "all" ? "April – September 2026" : s.period}
            {kind === "balance-sheet" ? " · closing balances" : ""}
          </span>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Account</th>
                <th className="numeric">Current period</th>
                {compare && <th className="numeric">Previous period</th>}
              </tr>
            </thead>
            <tbody>
              {result.groups.map((group) => (
                <ReportSection
                  key={group.name}
                  group={group}
                  collapsed={collapsed.includes(group.name)}
                  toggle={() =>
                    setCollapsed((v) =>
                      v.includes(group.name)
                        ? v.filter((n) => n !== group.name)
                        : [...v, group.name],
                    )
                  }
                  compare={compare}
                  priorRow={priorRow}
                />
              ))}
              <tr className="grand-total">
                <td>{result.totalLabel}</td>
                <td className="numeric" data-testid="report-total">
                  {money(result.total)}
                </td>
                {compare && <td className="numeric">{money(prior.total)}</td>}
              </tr>
              {result.extra?.map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td className="numeric">{money(r.value)}</td>
                  {compare && (
                    <td className="numeric">
                      {money(
                        prior.extra?.find((p) => p.id === r.id)?.value ?? 0,
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {result.check !== undefined && (
          <p className="notice success">
            Control difference: {money(result.check)} ·{" "}
            {result.check === 0
              ? "Reconciled to the ledger"
              : "Review required"}
          </p>
        )}
        <p className="statement-note">
          Opening equity and retained earnings are explicitly seeded. Current
          earnings are calculated from posted revenue and expense accounts.
          Click an account to inspect its source entries.
        </p>
      </section>
    </>
  );
}
function ReportSection({
  group,
  collapsed,
  toggle,
  compare,
  priorRow,
}: {
  group: ReportGroup;
  collapsed: boolean;
  toggle: () => void;
  compare: boolean;
  priorRow: (id: string) => number;
}) {
  return (
    <>
      <tr className="group-row">
        <td>
          <button onClick={toggle} aria-expanded={!collapsed}>
            {collapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}{" "}
            {group.name}
          </button>
        </td>
        <td className="numeric">
          {money(group.rows.reduce((v, r) => v + r.value, 0))}
        </td>
        {compare && (
          <td className="numeric">
            {money(group.rows.reduce((v, r) => v + priorRow(r.id), 0))}
          </td>
        )}
      </tr>
      {!collapsed &&
        group.rows.map((r) => (
          <tr key={r.id}>
            <td className="indented">
              {r.account ? (
                <Link to={`/accounting/ledger?account=${r.account}`}>
                  {r.account} · {r.name}
                </Link>
              ) : (
                <Link to="/reports/profit-and-loss">{r.name}</Link>
              )}
            </td>
            <td className="numeric">{money(r.value)}</td>
            {compare && <td className="numeric">{money(priorRow(r.id))}</td>}
          </tr>
        ))}
    </>
  );
}
export function Entities() {
  const s = useDemo(),
    dispatch = useAppDispatch(),
    navigate = useNavigate();
  return (
    <>
      <PageHeader
        title="Entities"
        description="One workspace, distinct books. Both demo entities use USD functional currency."
        action={
          <Link className="button primary" to="/entities/consolidation">
            Consolidated overview
          </Link>
        }
      />
      <div className="bank-grid">
        {s.entities.map((e) => {
          const m = metrics({ ...s, entity: e.id });
          return (
            <section className="panel" key={e.id}>
              <div className="section-heading">
                <span className="workspace-avatar">N</span>
                <Badge>
                  {s.entity === e.id ? "Active entity" : "Available"}
                </Badge>
              </div>
              <h2>{e.name}</h2>
              <p>{e.country}</p>
              <div className="detail-row">
                <span>Revenue · selected period</span>
                <MoneyCell value={m.revenue} />
              </div>
              <div className="detail-row">
                <span>Cash · closing</span>
                <MoneyCell value={m.cash} />
              </div>
              <button
                onClick={() => {
                  dispatch(command({ kind: "scope", entity: e.id }));
                  navigate("/overview");
                }}
              >
                Open entity
                <ArrowUpRight size={14} />
              </button>
            </section>
          );
        })}
      </div>
    </>
  );
}
export function Consolidation() {
  const s = useDemo();
  const data = s.entities.map((e) => ({
    ...e,
    ...metrics({ ...s, entity: e.id }),
  }));
  return (
    <>
      <Back to="/entities" label="Entities" />
      <PageHeader
        title="Consolidation"
        description="Simulated group overview · same-currency addition only."
      />
      <div className="notice">
        Both entities use USD. Simulated FX rate is 1.00 USD/USD. No
        intercompany fixture transactions exist; simulated eliminations are
        $0.00. This is a demo, not a consolidation engine.
      </div>
      <DataTable
        name="entity results"
        data={data}
        columns={[
          { key: "name", label: "Entity" },
          { key: "currency", label: "Currency" },
          {
            key: "revenue",
            label: "Revenue",
            numeric: true,
            render: (e) => <MoneyCell value={e.revenue} />,
          },
          {
            key: "expenses",
            label: "Expenses",
            numeric: true,
            render: (e) => <MoneyCell value={e.expenses} />,
          },
          {
            key: "profit",
            label: "Net income",
            numeric: true,
            render: (e) => <MoneyCell value={e.profit} />,
          },
          {
            key: "cash",
            label: "Closing cash",
            numeric: true,
            render: (e) => <MoneyCell value={e.cash} />,
          },
        ]}
      />
      <div className="mini-metrics">
        <div>
          <small>Group revenue</small>
          <strong>{money(data.reduce((v, e) => v + e.revenue, 0))}</strong>
        </div>
        <div>
          <small>Group net income</small>
          <strong>{money(data.reduce((v, e) => v + e.profit, 0))}</strong>
        </div>
        <div>
          <small>Group cash</small>
          <strong>{money(data.reduce((v, e) => v + e.cash, 0))}</strong>
        </div>
      </div>
      <Link className="inline-link" to="/reports/balance-sheet">
        Return to active entity statements
      </Link>
    </>
  );
}
export function OperationalSnapshot() {
  const s = useDemo();
  return <p>{s.invoices.filter((i) => inScope(s, i)).length}</p>;
}
