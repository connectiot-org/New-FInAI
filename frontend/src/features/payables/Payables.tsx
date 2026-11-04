import { PdfPreview } from "./PdfPreview";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  Link,
  useNavigate,
  useParams,
  useLocation,
  useBlocker,
  useSearchParams,
} from "react-router-dom";
import { z } from "zod";
import {
  Plus,
  ArrowLeft,
  FileText,
  Download,
  ChevronRight,
  CheckCircle2,
  SlidersHorizontal,
  Search,
  Building2,
  Clock3,
  Files,
  ArrowUpRight,
  FilterX,
  AlertCircle,
} from "lucide-react";
import { useWorkspace } from "../workspace/context";
import {
  usePayablesClient,
  capabilitiesSchema,
  listSchema,
  detailSchema,
  suppliersSchema,
  saved,
  grant,
  amount,
  type InvoiceData,
} from "./api";
import "./payables.css";
const labels: Record<string, string> = {
  review: "Needs review",
  verify: "Awaiting verification",
  approve: "Awaiting approval",
  approved: "Approved",
  rejected: "Rejected",
};
const blankLine = {
  description: "",
  quantity: "1",
  unitMinor: "0",
  taxCode: "NONE" as "NONE" | "STANDARD",
  taxBps: 0 as 0 | 2000,
  recoverable: false,
  account: "",
  taxAccount: "",
  payableAccount: "",
  costCentre: "",
};
const fresh = (): InvoiceData => ({
  supplierId: "",
  reference: "",
  invoiceDate: new Date().toISOString().slice(0, 10),
  dueDate: new Date().toISOString().slice(0, 10),
  currency: "GBP",
  declaredGross: "0",
  lines: [{ ...blankLine }],
});
function useLoad<T>(load: (signal: AbortSignal) => Promise<T>) {
  const [value, setValue] = useState<T>(),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    const c = new AbortController();
    setValue(undefined);
    setError("");
    load(c.signal)
      .then((v) => {
        if (!c.signal.aborted) setValue(v);
      })
      .catch((e: Error) => {
        if (!c.signal.aborted) setError(e.message);
      });
    return () => c.abort();
  }, [load, revision]);
  return { value, error, reload: () => setRevision((v) => v + 1) };
}
function MoneyInput({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (minor: string) => void;
  disabled?: boolean;
}) {
  const display = (minor: string) =>
    /^\d+$/.test(minor)
      ? `${BigInt(minor) / 100n}.${(BigInt(minor) % 100n).toString().padStart(2, "0")}`
      : "";
  const [draft, setDraft] = useState(() => ({ value, raw: display(value) }));
  // Reused line/rule components must reflect a different controlled amount.
  // Keep the user's decimal draft when the parent echoes its canonical value.
  if (draft.value !== value) setDraft({ value, raw: display(value) });
  return (
    <input
      required
      disabled={disabled}
      inputMode="decimal"
      pattern="[0-9]+([.][0-9]{1,2})?"
      value={draft.value === value ? draft.raw : display(value)}
      onChange={(e) => {
        const v = e.target.value;
        if (!/^\d{0,8}(\.\d{0,2})?$/.test(v)) return;
        const [whole, fraction = ""] = v.split(".");
        const minor = v
          ? (
              BigInt(whole || 0) * 100n +
              BigInt(fraction.padEnd(2, "0"))
            ).toString()
          : "";
        setDraft({ value: minor, raw: v });
        onChange(minor);
      }}
    />
  );
}
function Notice({ error }: { error: string }) {
  return error ? (
    <p className="ap-error" role="alert">
      {error}
    </p>
  ) : null;
}
export function Payables() {
  const { basePath } = usePayablesClient();
  const c = useWorkspace(),
    location = useLocation();
  const [params, setParams] = useSearchParams();
  const requestedEntity = params.get("entityId");
  const entityId =
    requestedEntity === null
      ? c.entities[0]?.id || ""
      : c.entities.some((e) => e.id === requestedEntity)
        ? requestedEntity
        : "";
  const companyQuery = `?entityId=${entityId}`;
  return (
    <div className="ap-root" key={c.revision}>
      <div className="ap-top">
        <div>
          <span className="ap-eyebrow">PAYABLES</span>
          <h1>Invoices</h1>
          <p>A clear path from supplier invoice to approval and accounting.</p>
        </div>
        <label className="ap-company">
          <span>
            <Building2 size={13} aria-hidden="true" />
            Company
          </span>
          <select
            value={entityId}
            onChange={(e) => {
              const next = new URLSearchParams(params);
              next.set("entityId", e.target.value);
              // Paging and assignees belong to the previous company's queue.
              for (const key of [
                "queue",
                "status",
                "dueBefore",
                "assignee",
                "offset",
              ])
                next.delete(key);
              setParams(next);
            }}
          >
            {!entityId && <option value="">Choose a company</option>}
            {c.entities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <nav className="ap-nav" aria-label="Payables">
        <Link
          aria-current={
            location.pathname.includes("/invoices") ? "page" : undefined
          }
          to={basePath + "/invoices" + companyQuery}
        >
          Invoices
        </Link>
        <Link
          aria-current={
            location.pathname.endsWith("/suppliers") ? "page" : undefined
          }
          to={basePath + "/suppliers" + companyQuery}
        >
          Suppliers
        </Link>
        <Link
          aria-current={
            location.pathname.endsWith("/export") ? "page" : undefined
          }
          to={basePath + "/export" + companyQuery}
        >
          Accounting export
        </Link>
        <Link
          aria-current={
            location.pathname.endsWith("/approvals") ? "page" : undefined
          }
          to={basePath + "/settings/approvals" + companyQuery}
        >
          Approval settings
        </Link>
        {c.administrator && (
          <Link to={basePath + "/settings/access" + companyQuery}>
            Invoice access
          </Link>
        )}
      </nav>
      {!entityId ? (
        <p>No authorized company. Ask your administrator for access.</p>
      ) : (
        <Scoped key={entityId + location.pathname} entityId={entityId} />
      )}
    </div>
  );
}
function Scoped({ entityId }: { entityId: string }) {
  const { request } = usePayablesClient();
  const workspace = useWorkspace();
  const location = useLocation(),
    { id } = useParams();
  const load = useCallback(
    (signal: AbortSignal) =>
      request("/capabilities?entityId=" + entityId, capabilitiesSchema, {
        signal,
      }),
    [entityId, request],
  );
  const cap = useLoad(load);
  if (location.pathname.endsWith("/access"))
    return workspace.administrator ? (
      <InvoiceAccess entityId={entityId} />
    ) : (
      <p>Administrator permission is required.</p>
    );
  if (cap.error) return <Notice error={cap.error} />;
  if (!cap.value) return <p role="status">Loading invoice permissions…</p>;
  const caps = cap.value;
  return location.pathname.endsWith("/suppliers") ? (
    <Suppliers entityId={entityId} canReview={caps.capabilities.review} />
  ) : location.pathname.endsWith("/approvals") ? (
    <Policies entityId={entityId} caps={caps} />
  ) : id ? (
    <Detail id={id} entityId={entityId} caps={caps} />
  ) : (
    <Register
      entityId={entityId}
      caps={caps}
      exportView={location.pathname.endsWith("/export")}
    />
  );
}
type Caps = z.infer<typeof capabilitiesSchema>;
const memberName = (caps: Caps, id: string | null | undefined) =>
  caps.members.find((m) => m.id === id)?.name ||
  id?.slice(0, 8) ||
  "Unassigned";
// Filters live in the URL so refresh/back/forward preserve the user's view.
function Register({
  entityId,
  caps,
  exportView,
}: {
  entityId: string;
  caps: Caps;
  exportView: boolean;
}) {
  const { request, basePath } = usePayablesClient();
  const [params, setParams] = useSearchParams();
  const month = params.get("month") || "",
    search = params.get("search") || "",
    queue = exportView ? "export" : params.get("queue") || "all",
    status = params.get("status") || "",
    due = params.get("dueBefore") || "",
    assignee = params.get("assignee") || "";
  const pageOffset = params.get("offset") || "0";
  const offset = /^\d{1,9}$/.test(pageOffset) ? Number(pageOffset) : 0;
  const [adding, setAdding] = useState(false);
  const navigate = useNavigate();
  const changeView = (changes: Record<string, string>, replace = false) => {
    const next = new URLSearchParams(params);
    for (const [name, value] of Object.entries(changes)) {
      if (value && !(name === "offset" && value === "0")) next.set(name, value);
      else next.delete(name);
    }
    if (!("offset" in changes)) next.delete("offset");
    setParams(next, { replace });
  };
  const load = useCallback(
    (signal: AbortSignal) =>
      request(
        "/invoices?" +
          new URLSearchParams({
            entityId,
            queue,
            search,
            offset: String(offset),
            limit: "20",
            ...(status ? { status } : {}),
            ...(month ? { month } : {}),
            ...(due ? { dueBefore: due } : {}),
            ...(assignee ? { assignee } : {}),
          }),
        listSchema,
        { signal },
      ),
    [entityId, queue, search, status, due, assignee, offset, request, month],
  );
  const rows = useLoad(load);
  const filterCount = [search, status, month, due, assignee].filter(
    Boolean,
  ).length;
  const counts = rows.value?.counts;
  const invoicePath = (id: string) =>
    basePath + "/invoices/" + id + `?entityId=${entityId}`;
  return (
    <>
      <section className="ap-metrics" aria-label="Invoice overview">
        {[
          {
            label: "All invoices",
            value: counts?.all,
            hint: "Across your current filters",
            target: "all",
            Icon: Files,
          },
          {
            label: "Needs review",
            value: counts?.review,
            hint: "Check details and coding",
            target: "review",
            Icon: FileText,
          },
          {
            label: "Your approvals",
            value: counts?.approve,
            hint: "Assigned to you",
            target: "approve",
            Icon: Clock3,
          },
          {
            label: "Ready to export",
            value: counts?.export,
            hint: "Approved for accounting",
            target: "export",
            Icon: Download,
          },
        ].map(({ label, value, hint, target, Icon }) => (
          <button
            key={target}
            className={"ap-metric " + (queue === target ? "is-selected" : "")}
            onClick={() => {
              if (target === "export" && !exportView) {
                const next = new URLSearchParams(params);
                next.set("entityId", entityId);
                next.delete("queue");
                next.delete("offset");
                navigate(basePath + "/export?" + next);
              } else if (exportView && target !== "export") {
                const next = new URLSearchParams(params);
                next.set("entityId", entityId);
                next.set("queue", target);
                next.delete("offset");
                navigate(basePath + "/invoices?" + next);
              } else changeView({ queue: target });
            }}
          >
            <span className="ap-metric-top">
              <span>{label}</span>
              <Icon size={17} aria-hidden="true" />
            </span>
            <strong>{value ?? "—"}</strong>
            <span className="ap-metric-hint">{hint}</span>
          </button>
        ))}
      </section>
      <section
        className="ap-register"
        aria-label={
          exportView ? "Accounting export queue" : "Supplier invoice register"
        }
      >
        <div className="ap-toolbar ap-register-heading">
          <div>
            <h2>
              {exportView ? "Ready for accounting export" : "Supplier invoices"}
            </h2>
            <p>
              {exportView
                ? "Prepare an immutable accounting export for an approved invoice."
                : "Review the details. Keep the right people in the loop."}
            </p>
          </div>
          <div className="ap-register-actions">
            <label className="ap-month-field">
              Invoice month
              <input
                type="month"
                value={month}
                onChange={(e) => changeView({ month: e.target.value })}
              />
            </label>
            {caps.capabilities.review && (
              <button className="primary" onClick={() => setAdding(true)}>
                <Plus size={16} aria-hidden="true" />
                Add invoice
              </button>
            )}
          </div>
        </div>
        {exportView && (
          <p className="ap-export-notice">
            <ShieldNotice />
            Approval and accounting export are separate from payment. An export
            does not confirm posting.
          </p>
        )}
        {!exportView && (
          <div
            className="ap-tabs"
            role="tablist"
            aria-label="Invoice queues"
            onKeyDown={(e) => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key))
                return;
              e.preventDefault();
              const tabs = Array.from(
                e.currentTarget.querySelectorAll<HTMLButtonElement>(
                  'button[role="tab"]',
                ),
              );
              const current = tabs.indexOf(e.target as HTMLButtonElement);
              const next =
                e.key === "Home"
                  ? 0
                  : e.key === "End"
                    ? tabs.length - 1
                    : (current +
                        (e.key === "ArrowRight" ? 1 : -1) +
                        tabs.length) %
                      tabs.length;
              tabs[next]?.focus();
              changeView({
                queue: ["all", "review", "verify", "approve"][next],
              });
            }}
          >
            {["all", "review", "verify", "approve"].map((t) => (
              <button
                role="tab"
                tabIndex={queue === t ? 0 : -1}
                aria-selected={queue === t}
                key={t}
                onClick={() => changeView({ queue: t })}
              >
                {t === "all"
                  ? "All"
                  : t === "review"
                    ? "Review"
                    : t === "verify"
                      ? "Verify"
                      : "Approve"}
                <span>
                  {counts?.[t as keyof NonNullable<typeof counts>] ?? "—"}
                </span>
              </button>
            ))}
          </div>
        )}
        <div className="ap-filters">
          <label className="ap-search-field">
            Search
            <div className="ap-search-input">
              <Search size={17} aria-hidden="true" />
              <input
                placeholder="Supplier or invoice reference"
                value={search}
                onChange={(e) => changeView({ search: e.target.value }, true)}
              />
            </div>
          </label>
          <label>
            Status
            <select
              aria-label="Status"
              value={status}
              onChange={(e) => changeView({ status: e.target.value })}
            >
              <option value="">All statuses</option>
              {Object.entries(labels).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label>
            Due on or before
            <input
              type="date"
              value={due}
              onChange={(e) => changeView({ dueBefore: e.target.value })}
            />
          </label>
          <label>
            Assigned to
            <select
              aria-label="Assigned to"
              value={assignee}
              onChange={(e) => changeView({ assignee: e.target.value })}
            >
              <option value="">Anyone</option>
              {caps.members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name || m.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {filterCount > 0 && (
          <div className="ap-filter-summary">
            <span>
              {filterCount} active {filterCount === 1 ? "filter" : "filters"}
            </span>
            <button
              onClick={() =>
                changeView({
                  search: "",
                  status: "",
                  month: "",
                  dueBefore: "",
                  assignee: "",
                })
              }
            >
              <FilterX size={14} aria-hidden="true" />
              Clear filters
            </button>
          </div>
        )}
        <Notice error={rows.error} />
        {rows.error && <button onClick={rows.reload}>Retry</button>}
        {!rows.value && !rows.error ? (
          <p className="ap-register-loading" role="status">
            Loading invoices…
          </p>
        ) : (
          rows.value && (
            <>
              <div className="ap-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Supplier / reference</th>
                      <th>Invoice date</th>
                      <th>Due date</th>
                      <th className="ap-amount-column">Amount</th>
                      <th>Status</th>
                      <th>Responsible</th>
                      <th aria-label="Open invoice" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.value.items.map((n) => (
                      <tr key={n.id}>
                        <td>
                          <Link
                            className="ap-supplier-link"
                            to={invoicePath(n.id)}
                          >
                            <span
                              className="ap-supplier-avatar"
                              aria-hidden="true"
                            >
                              {n.supplier
                                .split(/\s+/)
                                .slice(0, 2)
                                .map((part) => part[0])
                                .join("")}
                            </span>
                            <span>
                              <strong>{n.supplier}</strong>
                              <small>{n.reference}</small>
                            </span>
                          </Link>
                        </td>
                        <td>
                          <time dateTime={n.invoiceDate}>{n.invoiceDate}</time>
                        </td>
                        <td>
                          <time dateTime={n.dueDate}>{n.dueDate}</time>
                        </td>
                        <td className="ap-money ap-amount-column">
                          {amount(n.gross)}
                          <small>GBP</small>
                        </td>
                        <td>
                          <span className={"ap-status " + n.state}>
                            {labels[n.state]}
                          </span>
                          {n.attention && (
                            <small className="ap-warning">
                              <AlertCircle size={12} aria-hidden="true" />
                              Needs attention
                            </small>
                          )}
                        </td>
                        <td>
                          <span className="ap-owner">
                            {n.owner
                              ? memberName(caps, n.owner)
                              : n.state === "approved"
                                ? "Complete"
                                : n.state === "rejected"
                                  ? "Closed"
                                  : "Finance review"}
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="ap-open-invoice"
                            aria-label={"Open invoice " + n.reference}
                            onClick={() => navigate(invoicePath(n.id))}
                          >
                            <ArrowUpRight size={17} aria-hidden="true" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!rows.value.items.length && (
                  <div className="ap-empty">
                    <FileText size={30} aria-hidden="true" />
                    <h3>
                      {rows.value.total
                        ? "No invoices on this page"
                        : filterCount
                          ? "No matching invoices"
                          : "Your invoice queue is clear"}
                    </h3>
                    <p>
                      {rows.value.total
                        ? "The register changed. Return to the first page to see the current invoices."
                        : filterCount
                          ? "Try changing or clearing your filters."
                          : caps.capabilities.review
                            ? "Add a supplier invoice to start a review."
                            : "Assigned invoices will appear here."}
                    </p>
                    {rows.value.total > 0 ? (
                      <button onClick={() => changeView({ offset: "0" })}>
                        Go to first page
                      </button>
                    ) : (
                      filterCount > 0 && (
                        <button
                          onClick={() =>
                            changeView({
                              search: "",
                              status: "",
                              month: "",
                              dueBefore: "",
                              assignee: "",
                            })
                          }
                        >
                          Show all in this queue
                        </button>
                      )
                    )}
                  </div>
                )}
              </div>
              <div className="ap-pagination">
                <span>
                  {rows.value.items.length
                    ? `${offset + 1}–${Math.min(offset + rows.value.items.length, rows.value.total)} of ${rows.value.total}`
                    : rows.value.total
                      ? `0 of ${rows.value.total}`
                      : "0"}{" "}
                  invoices · GBP
                </span>
                <button
                  disabled={!offset}
                  onClick={() =>
                    changeView({ offset: String(Math.max(0, offset - 20)) })
                  }
                >
                  Previous
                </button>
                <button
                  disabled={offset + 20 >= rows.value.total}
                  onClick={() => changeView({ offset: String(offset + 20) })}
                >
                  Next
                </button>
              </div>
            </>
          )
        )}
      </section>
      {adding && (
        <InvoiceForm
          entityId={entityId}
          close={() => setAdding(false)}
          done={(id) => navigate(invoicePath(id))}
        />
      )}
    </>
  );
}
function ShieldNotice() {
  return <CheckCircle2 size={16} aria-hidden="true" />;
}
function InvoiceForm({
  entityId,
  initial,
  expectedVersion,
  id,
  close,
  done,
}: {
  entityId: string;
  initial?: InvoiceData;
  expectedVersion?: number;
  id?: string;
  close: () => void;
  done: (id: string) => void;
}) {
  const { request } = usePayablesClient();
  const [data, setData] = useState(initial || fresh()),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  // Local row identity keeps decimal drafts with their line, including equal prices.
  // These IDs are never included in the financial payload or retry digest.
  const [lineKeys, setLineKeys] = useState(() =>
    (initial?.lines || [blankLine]).map(() => crypto.randomUUID()),
  );
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const operation = useRef(crypto.randomUUID()),
    pending = useRef<InvoiceData | undefined>(undefined);
  const load = useCallback(
    (signal: AbortSignal) =>
      request("/suppliers?entityId=" + entityId, suppliersSchema, { signal }),
    [entityId, request],
  );
  const suppliers = useLoad(load);
  const dirty = JSON.stringify(data) !== JSON.stringify(initial || fresh());
  const leaving = useRef(false);
  const blocker = useBlocker(() => !leaving.current && (dirty || busy));
  useEffect(() => {
    if (blocker.state === "blocked") {
      if (!busy && confirm("Discard unsaved invoice changes?"))
        blocker.proceed();
      else blocker.reset();
    }
  }, [blocker, busy]);
  useEffect(() => {
    if (!dirty) return;
    const prevent = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty]);
  const update = <K extends keyof InvoiceData>(k: K, v: InvoiceData[K]) =>
    setData((d) => ({ ...d, [k]: v }));
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (!id) {
        if (
          pending.current &&
          JSON.stringify(pending.current) !== JSON.stringify(data)
        )
          throw new Error(
            "Resolve the previous uncertain save before changing the payload. Retry the original fields or reload the register.",
          );
        pending.current = structuredClone(data);
      }
      const result = await request(
        id ? "/invoices/" + id : "/invoices",
        saved,
        {
          method: id ? "PATCH" : "POST",
          body: id
            ? { ...data, expectedVersion }
            : { ...data, id: operation.current, entityId },
        },
      );
      leaving.current = true;
      done(result.id);
    } catch (e) {
      if (!id && (e as { rejected?: boolean }).rejected === true)
        pending.current = undefined;
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="ap-overlay">
      <dialog
        ref={dialog}
        onCancel={(e) => {
          e.preventDefault();
          if (!busy && (!dirty || confirm("Discard unsaved invoice changes?")))
            close();
        }}
        className="ap-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={id ? "Edit invoice metadata" : "Add invoice"}
      >
        <form onSubmit={submit}>
          <div className="ap-toolbar">
            <h2>{id ? "Edit invoice metadata" : "Add invoice"}</h2>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (!dirty || confirm("Discard unsaved invoice changes?"))
                  close();
              }}
            >
              Close
            </button>
          </div>
          <p>
            Enter the supplier’s document details. Corrections update metadata
            and restart review; the original PDF remains unchanged.
          </p>
          <Notice error={error || suppliers.error} />
          {!suppliers.value && !suppliers.error && (
            <p role="status">Loading suppliers…</p>
          )}
          <div className="ap-form-grid">
            <label>
              Supplier
              <select
                disabled={busy}
                aria-label="Supplier"
                required
                value={data.supplierId}
                onChange={(e) => update("supplierId", e.target.value)}
              >
                <option value="">Select a supplier</option>
                {suppliers.value?.items
                  .filter((s) => s.active)
                  .map((s) => (
                    <option value={s.id} key={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Supplier reference
              <input
                disabled={busy}
                required
                maxLength={200}
                value={data.reference}
                onChange={(e) => update("reference", e.target.value)}
              />
            </label>
            <label>
              Invoice date
              <input
                disabled={busy}
                type="date"
                required
                value={data.invoiceDate}
                onChange={(e) => update("invoiceDate", e.target.value)}
              />
            </label>
            <label>
              Due date
              <input
                disabled={busy}
                type="date"
                required
                value={data.dueDate}
                onChange={(e) => update("dueDate", e.target.value)}
              />
            </label>
            <label>
              Total on supplier document (GBP)
              <MoneyInput
                disabled={busy}
                value={data.declaredGross}
                onChange={(v) => update("declaredGross", v)}
              />
              <small>Enter the total shown on the original invoice.</small>
            </label>
            <label>
              Currency
              <input value="GBP" readOnly />
            </label>
          </div>
          <h3>Accounting lines</h3>
          {data.lines.map((l, index) => (
            <fieldset key={lineKeys[index]}>
              <legend>Line {index + 1}</legend>
              <div className="ap-form-grid">
                {(
                  [
                    "description",
                    "quantity",
                    "account",
                    "taxAccount",
                    "payableAccount",
                    "costCentre",
                  ] as const
                ).map((k) => (
                  <label key={k}>
                    {
                      {
                        description: "Description",
                        quantity: "Quantity",
                        account: "Expense account",
                        taxAccount: "Tax account",
                        payableAccount: "Payable account",
                        costCentre: "Cost centre",
                      }[k]
                    }
                    <input
                      disabled={busy}
                      required
                      value={l[k]}
                      onChange={(e) =>
                        update(
                          "lines",
                          data.lines.map((v, i) =>
                            i === index ? { ...v, [k]: e.target.value } : v,
                          ),
                        )
                      }
                    />
                  </label>
                ))}
                <label>
                  Unit price (GBP)
                  <MoneyInput
                    disabled={busy}
                    value={l.unitMinor}
                    onChange={(v) =>
                      update(
                        "lines",
                        data.lines.map((line, i) =>
                          i === index ? { ...line, unitMinor: v } : line,
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  Tax treatment
                  <select
                    disabled={busy}
                    value={l.taxCode}
                    onChange={(e) =>
                      update(
                        "lines",
                        data.lines.map((v, i) =>
                          i === index
                            ? {
                                ...v,
                                taxCode: e.target.value as "NONE" | "STANDARD",
                                taxBps: e.target.value === "NONE" ? 0 : 2000,
                              }
                            : v,
                        ),
                      )
                    }
                  >
                    <option value="NONE">No tax — confirmed</option>
                    <option value="STANDARD">
                      20% standard — confirmed mapping
                    </option>
                  </select>
                </label>
                <label className="ap-checkbox">
                  <input
                    disabled={busy}
                    type="checkbox"
                    checked={l.recoverable}
                    onChange={(e) =>
                      update(
                        "lines",
                        data.lines.map((v, i) =>
                          i === index
                            ? { ...v, recoverable: e.target.checked }
                            : v,
                        ),
                      )
                    }
                  />
                  Tax recoverable — confirmed
                </label>
              </div>
              {data.lines.length > 1 && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setLineKeys((keys) => keys.filter((_, i) => i !== index));
                    update(
                      "lines",
                      data.lines.filter((_, i) => i !== index),
                    );
                  }}
                >
                  Remove line
                </button>
              )}
            </fieldset>
          ))}
          <button
            type="button"
            disabled={busy || data.lines.length >= 50}
            onClick={() => {
              setLineKeys((keys) => [...keys, crypto.randomUUID()]);
              update("lines", [...data.lines, { ...blankLine }]);
            }}
          >
            Add line
          </button>
          <div className="ap-actions">
            <button
              type="submit"
              className="primary"
              disabled={busy || !suppliers.value || !!suppliers.error}
            >
              {busy ? "Saving…" : "Save draft"}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
function Detail({
  id,
  entityId,
  caps,
}: {
  id: string;
  entityId: string;
  caps: Caps;
}) {
  const { request, binary, basePath, development } = usePayablesClient();
  // Preview bytes belong to this exact authorized detail snapshot, not just a document filename.
  const [preview, setPreview] = useState<{
    detail: z.infer<typeof detailSchema>;
    documentId: string;
    blob: Blob;
  }>();
  const previewGeneration = useRef({ generation: 0 });
  const current = useWorkspace(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [editing, setEditing] = useState(false),
    [history, setHistory] = useState(false),
    [reason, setReason] = useState("");
  const retry = useRef<{ key: string; operationId: string } | undefined>(
      undefined,
    ),
    upload = useRef<{ key: string; operationId: string } | undefined>(
      undefined,
    );
  const load = useCallback(
    (signal: AbortSignal) =>
      request("/invoices/" + id, detailSchema, { signal }),
    [id, request],
  );
  const state = useLoad(load),
    n = state.value;
  const firstDocument = n?.documents[0]?.id;
  useEffect(() => {
    const scope = previewGeneration.current;
    const generation = ++scope.generation;
    setPreview(undefined);
    if (development && firstDocument && n)
      void binary(`/invoices/${id}/documents/${firstDocument}`, undefined, true)
        .then((blob) => {
          if (generation === scope.generation && blob)
            setPreview({ detail: n, documentId: firstDocument, blob });
        })
        .catch((error: Error) => {
          if (generation === scope.generation) setError(error.message);
        });
    return () => {
      scope.generation++;
    };
  }, [development, firstDocument, n, id, binary]);
  const act = async (action: string) => {
    if (!n) return;
    setBusy(true);
    setError("");
    try {
      const key = JSON.stringify({
        id,
        expectedVersion: n.version,
        action,
        reason,
      });
      if (retry.current?.key !== key)
        retry.current = { key, operationId: crypto.randomUUID() };
      await request(
        "/invoices/" + id + "/actions",
        z.strictObject({
          id: z.uuid(),
          state: z.string(),
          version: z.number(),
        }),
        {
          method: "POST",
          body: {
            operationId: retry.current.operationId,
            expectedVersion: n.version,
            action,
            ...(reason ? { reason } : {}),
          },
        },
      );
      state.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const downloadExport = async () => {
    if (!n) return;
    setBusy(true);
    try {
      const key = `${id}:${n.version}:export`;
      if (retry.current?.key !== key)
        retry.current = { key, operationId: crypto.randomUUID() };
      const result = await request("/invoices/" + id + "/exports", saved, {
        method: "POST",
        body: {
          operationId: retry.current.operationId,
          expectedVersion: n.version,
        },
      });
      await binary("/exports/" + result.id + "/file");
      state.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (state.error)
    return (
      <>
        <Notice error={state.error} />
        <button onClick={state.reload}>Reload</button>
      </>
    );
  if (!n) return <p role="status">Loading supplier invoice…</p>;
  if (n.entityId !== entityId)
    return <p>Choose the invoice’s company to view this record.</p>;
  const assignedVerify =
      n.state === "verify" &&
      n.route?.verifierId === current.userId &&
      caps.capabilities.verify,
    assignedApprove =
      n.state === "approve" &&
      n.route?.approverIds[n.route.step] === current.userId &&
      caps.capabilities.approve;
  return (
    <>
      <Link
        className="ap-back"
        to={basePath + "/invoices" + `?entityId=${entityId}`}
      >
        <ArrowLeft size={16} />
        All invoices
      </Link>
      <div className="ap-toolbar">
        <div>
          <h2>{n.data.reference}</h2>
          <span className={"ap-status " + n.state}>{labels[n.state]}</span>
          <span className="ap-muted"> Revision {n.revision}</span>
        </div>
        <strong className="ap-total">{amount(n.totals.gross)}</strong>
      </div>
      {!development && (
        <Link
          className="ap-assistant-link"
          to={`/workspace/assistant/records?${new URLSearchParams({ entityId, month: n.data.invoiceDate.slice(0, 7), currency: "GBP", invoiceId: n.id })}`}
        >
          Ask FinAI about this invoice
        </Link>
      )}
      <Notice error={error} />
      {n.correctionReason && (
        <p className="ap-error" role="alert">
          Correction requested: {n.correctionReason}. Save corrected metadata
          before submitting.
        </p>
      )}
      {!n.totals.matches && (
        <p className="ap-error" role="alert">
          Declared total {amount(n.data.declaredGross)} differs from calculated
          total {amount(n.totals.gross)}. Correct the invoice before submission.
        </p>
      )}
      <div className="ap-split">
        <section className="ap-document">
          <div className="ap-toolbar">
            <h3>Original document</h3>
            <FileText size={18} />
          </div>
          {!n.documents.length ? (
            <div className="ap-empty">
              <FileText size={40} />
              <h3>Attach the supplier invoice</h3>
              <p>PDF · Up to 1 MiB · Original retained privately</p>
            </div>
          ) : (
            n.documents.map((d) => (
              <div className="ap-document-row" key={d.id}>
                <FileText />
                <div>
                  <strong>{d.filename}</strong>
                  <small>
                    {development
                      ? "Development file · unscanned"
                      : d.scanState === "synthetic"
                        ? "Synthetic test fixture"
                        : d.scanState === "clean"
                          ? "Scanned · ready for review"
                          : d.scanState === "infected"
                            ? "Blocked · scanner detected a threat"
                            : "Quarantined · awaiting document scan"}
                  </small>
                </div>
                {!development &&
                  caps.capabilities.review &&
                  d.scanState !== "synthetic" && (
                    <button
                      disabled={busy}
                      onClick={() => {
                        previewGeneration.current.generation++;
                        setPreview(undefined);
                        setBusy(true);
                        request(
                          `/invoices/${id}/documents/${d.id}/scan`,
                          z.strictObject({
                            id: z.uuid(),
                            scanState: z.string(),
                          }),
                          {
                            method: "POST",
                            body: {
                              operationId: crypto.randomUUID(),
                              expectedVersion: n.version,
                            },
                          },
                        )
                          .then(state.reload)
                          .catch((e) => setError(e.message))
                          .finally(() => setBusy(false));
                      }}
                    >
                      Rescan
                    </button>
                  )}
                <button
                  disabled={
                    busy ||
                    (!development &&
                      !["synthetic", "clean"].includes(d.scanState))
                  }
                  onClick={() => {
                    setBusy(true);
                    binary(`/invoices/${id}/documents/${d.id}`)
                      .catch((e) => setError(e.message))
                      .finally(() => setBusy(false));
                  }}
                >
                  Download
                </button>
                <button
                  disabled={
                    busy ||
                    (!development &&
                      !["synthetic", "clean"].includes(d.scanState))
                  }
                  onClick={() => {
                    const generation = ++previewGeneration.current.generation;
                    setPreview(undefined);
                    setBusy(true);
                    binary(`/invoices/${id}/documents/${d.id}`, undefined, true)
                      .then((blob) => {
                        if (
                          blob &&
                          generation === previewGeneration.current.generation
                        )
                          setPreview({ detail: n, documentId: d.id, blob });
                      })
                      .catch((e) => setError(e.message))
                      .finally(() => setBusy(false));
                  }}
                >
                  Preview
                </button>
              </div>
            ))
          )}
          {caps.capabilities.review && n.state !== "rejected" && (
            <label className="ap-upload">
              Add original PDF
              <input
                type="file"
                accept="application/pdf,.pdf"
                disabled={busy}
                onChange={async (e) => {
                  const input = e.currentTarget;
                  const file = input.files?.[0];
                  // Retain the File/operation ID, while allowing the same native
                  // selection to trigger a deliberate retry after a failed upload.
                  input.value = "";
                  if (!file) return;
                  if (file.size > 1048576) {
                    setError("PDF must be at most 1 MiB.");
                    return;
                  }
                  setBusy(true);
                  setError("");
                  try {
                    const key = `${id}:${n.version}:${file.name}:${file.size}:${file.lastModified}`;
                    if (upload.current?.key !== key)
                      upload.current = {
                        key,
                        operationId: crypto.randomUUID(),
                      };
                    await binary(
                      `/invoices/${id}/documents?` +
                        new URLSearchParams({
                          entityId,
                          expectedVersion: String(n.version),
                          operationId: upload.current.operationId,
                          filename: file.name,
                        }),
                      file,
                    );
                    state.reload();
                  } catch (err) {
                    setError((err as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </label>
          )}
          {preview?.detail === n &&
            n.documents.some(
              (d) =>
                d.id === preview.documentId &&
                (development || ["synthetic", "clean"].includes(d.scanState)),
            ) && <PdfPreview blob={preview.blob} />}
          <p className="ap-muted">
            {development
              ? "Development files stay in this browser and are not malware-scanned. Use sample PDFs."
              : "Original files are immutable. Unscanned documents remain quarantined and cannot be used for review."}
          </p>
        </section>
        <section className="ap-information">
          <details open>
            <summary>
              Supplier <ChevronRight size={16} />
            </summary>
            <p>
              Supplier <strong>{n.supplier.name}</strong>
            </p>
            <p>
              Tax identifier{" "}
              <strong>{n.supplier.taxId || "Not supplied"}</strong>
            </p>
            <p>
              Reference <strong>{n.data.reference}</strong>
            </p>
            <p>
              Invoice date <strong>{n.data.invoiceDate}</strong>
            </p>
            <p>
              Due date <strong>{n.data.dueDate}</strong>
            </p>
          </details>
          <details open>
            <summary>
              Accounting <ChevronRight size={16} />
            </summary>
            {n.data.lines.map((l, i) => (
              <div className="ap-line" key={i}>
                <strong>{l.description}</strong>
                <small>
                  {l.account} · {l.costCentre} ·{" "}
                  {l.taxCode === "NONE"
                    ? "No tax"
                    : l.recoverable
                      ? "20% recoverable"
                      : "20% nonrecoverable"}
                </small>
                <span>{amount(n.totals.lines[i].net)}</span>
              </div>
            ))}
            <p>
              Net <strong>{amount(n.totals.net)}</strong>
            </p>
            <p>
              Tax <strong>{amount(n.totals.tax)}</strong>
            </p>
            <p>
              Total <strong>{amount(n.totals.gross)}</strong>
            </p>
          </details>
          <details>
            <summary>
              Payment <ChevronRight size={16} />
            </summary>
            <p>Unpaid. No payment instruction or settlement is recorded.</p>
          </details>
          <details open>
            <summary>
              Approval <ChevronRight size={16} />
            </summary>
            {n.route ? (
              <>
                <p>{n.route.reason}</p>
                <small>Published policy revision {n.route.policyVersion}</small>
                {n.route.verifierId && (
                  <p>
                    Verification{" "}
                    <strong>
                      {n.route.verified
                        ? "Verified"
                        : memberName(caps, n.route.verifierId)}
                    </strong>
                  </p>
                )}
                {n.route.approverIds.map((a, i) => (
                  <p key={a}>
                    Step {i + 1}
                    <strong>
                      {i < n.route!.step ? <CheckCircle2 size={15} /> : null}
                      {memberName(caps, a)}
                      {i === n.route!.step ? " · current" : ""}
                    </strong>
                  </p>
                ))}
              </>
            ) : (
              <p>Confirm details to resolve the published approval route.</p>
            )}
          </details>
          <details>
            <summary>
              Accounting export <ChevronRight size={16} />
            </summary>
            {n.exports.length ? (
              n.exports.map((x) => (
                <p key={x.id}>
                  Revision {x.revision}
                  {x.revision === n.revision
                    ? " · current"
                    : " · superseded"}{" "}
                  <button
                    onClick={() =>
                      binary("/exports/" + x.id + "/file").catch((e) =>
                        setError(e.message),
                      )
                    }
                  >
                    Download CSV
                  </button>
                </p>
              ))
            ) : (
              <p>No export prepared.</p>
            )}
          </details>
        </section>
      </div>
      <div className="ap-actions">
        <button disabled={busy} onClick={() => setHistory(!history)}>
          Activity
        </button>
        <button disabled={busy} onClick={state.reload}>
          Reload
        </button>
        {caps.capabilities.review && n.state !== "rejected" && (
          <button disabled={busy} onClick={() => setEditing(true)}>
            Edit metadata
          </button>
        )}
        {(assignedVerify ||
          assignedApprove ||
          (caps.capabilities.review && n.state === "review")) && (
          <>
            <label>
              Reason for challenge or rejection
              <input
                maxLength={200}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <button
              disabled={busy || !reason.trim()}
              onClick={() =>
                act(n.state === "review" ? "correction" : "challenge")
              }
            >
              {n.state === "review" ? "Request correction" : "Challenge"}
            </button>
            {assignedApprove && (
              <button
                disabled={busy || !reason.trim()}
                onClick={() => {
                  if (
                    confirm(
                      "Reject this supplier invoice? Rejection cannot be reopened.",
                    )
                  )
                    void act("reject");
                }}
              >
                Reject
              </button>
            )}
          </>
        )}
        {caps.capabilities.review && n.state === "review" && (
          <button
            className="primary"
            disabled={busy || !n.totals.matches || !!n.correctionReason}
            onClick={() => act("review")}
          >
            Confirm details & submit
          </button>
        )}
        {assignedVerify && (
          <button
            className="primary"
            disabled={busy}
            onClick={() => act("verify")}
          >
            Verify delivery
          </button>
        )}
        {assignedApprove && (
          <button
            className="primary"
            disabled={busy}
            onClick={() => act("approve")}
          >
            Approve invoice
          </button>
        )}
        {caps.capabilities.review && n.state === "approved" && (
          <button className="primary" disabled={busy} onClick={downloadExport}>
            <Download size={16} />
            Prepare accounting export
          </button>
        )}
      </div>
      {history && (
        <aside className="ap-activity">
          <h3>Recent invoice activity</h3>
          {n.events.length === 500 && (
            <p>Showing the most recent 500 events.</p>
          )}
          {n.events.map((e) => (
            <p key={e.id}>
              <strong>{e.action}</strong> · Revision {e.revision} ·{" "}
              {e.actorId.slice(0, 8)}
              <small>
                {new Date(e.createdAt).toLocaleString()} {e.reason}
              </small>
            </p>
          ))}
        </aside>
      )}
      {editing && (
        <InvoiceForm
          id={id}
          entityId={entityId}
          expectedVersion={n.version}
          initial={n.data}
          close={() => setEditing(false)}
          done={() => {
            setEditing(false);
            state.reload();
          }}
        />
      )}
    </>
  );
}
function Suppliers({
  entityId,
  canReview,
}: {
  entityId: string;
  canReview: boolean;
}) {
  const { request } = usePayablesClient();
  const load = useCallback(
    (signal: AbortSignal) =>
      request("/suppliers?entityId=" + entityId, suppliersSchema, { signal }),
    [entityId, request],
  );
  const rows = useLoad(load),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const id = useRef(crypto.randomUUID());
  const [editing, setEditing] =
    useState<z.infer<typeof suppliersSchema>["items"][number]>();
  return (
    <section>
      <h2>Suppliers</h2>
      <p>Company-scoped supplier records for invoice review.</p>
      <Notice error={error || rows.error} />
      {canReview && (
        <form
          className="ap-filters"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const data = new FormData(form);
            setBusy(true);
            try {
              await request("/suppliers", saved, {
                method: "POST",
                body: {
                  id: id.current,
                  entityId,
                  name: data.get("name"),
                  taxId: data.get("taxId"),
                },
              });
              id.current = crypto.randomUUID();
              form.reset();
              rows.reload();
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Legal / display name
            <input disabled={busy} name="name" required maxLength={200} />
          </label>
          <label>
            Tax identifier
            <input disabled={busy} name="taxId" maxLength={200} />
          </label>
          <button className="primary" disabled={busy}>
            Add supplier
          </button>
        </form>
      )}
      {editing && (
        <form
          className="ap-policy"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await request("/suppliers/" + editing.id, saved, {
                method: "PATCH",
                body: {
                  name: editing.name,
                  taxId: editing.taxId,
                  active: editing.active,
                  expectedVersion: editing.version,
                },
              });
              setEditing(undefined);
              rows.reload();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <h3>Edit supplier</h3>
          <div className="ap-form-grid">
            <label>
              Supplier name
              <input
                disabled={busy}
                required
                maxLength={200}
                value={editing.name}
                onChange={(e) =>
                  setEditing({ ...editing, name: e.target.value })
                }
              />
            </label>
            <label>
              Supplier tax identifier
              <input
                disabled={busy}
                maxLength={200}
                value={editing.taxId}
                onChange={(e) =>
                  setEditing({ ...editing, taxId: e.target.value })
                }
              />
            </label>
            <label className="ap-checkbox">
              <input
                disabled={busy}
                type="checkbox"
                checked={editing.active}
                onChange={(e) =>
                  setEditing({ ...editing, active: e.target.checked })
                }
              />
              Active supplier
            </label>
          </div>
          <button disabled={busy} className="primary">
            Save supplier
          </button>
          <button
            disabled={busy}
            type="button"
            onClick={() => setEditing(undefined)}
          >
            Cancel
          </button>
        </form>
      )}
      <div className="ap-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Supplier</th>
              <th>Tax identifier</th>
              <th>Status</th>
              {canReview && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {rows.value?.items.map((s) => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td>{s.taxId || "Not supplied"}</td>
                <td>{s.active ? "Active" : "Inactive"}</td>
                {canReview && (
                  <td>
                    <button onClick={() => setEditing(s)}>Edit {s.name}</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
const chainSchema = z.strictObject({
  verifierId: z.uuid().nullable(),
  approverIds: z.array(z.uuid()),
});
const definitionSchema = z.strictObject({
  currency: z.literal("GBP"),
  rules: z.array(
    chainSchema.extend({ priority: z.number(), minimumGross: z.string() }),
  ),
  fallback: chainSchema,
});
const policyResponse = z.strictObject({
  item: z
    .strictObject({
      version: z.number(),
      draft: definitionSchema,
      published: definitionSchema.nullable(),
      publishedVersion: z.number().nullable(),
    })
    .nullable(),
});
function Policies({ entityId, caps }: { entityId: string; caps: Caps }) {
  const { request } = usePayablesClient();
  const load = useCallback(
    (signal: AbortSignal) =>
      request("/approval-policies?entityId=" + entityId, policyResponse, {
        signal,
      }),
    [entityId, request],
  );
  const state = useLoad(load);
  if (!caps.capabilities.manage)
    return <p>Approval policy management permission is required.</p>;
  if (state.error) return <Notice error={state.error} />;
  if (!state.value) return <p>Loading policy…</p>;
  return (
    <PolicyEditor
      key={state.value.item?.version || 0}
      entityId={entityId}
      caps={caps}
      item={state.value.item}
      reload={state.reload}
    />
  );
}
const accessSchema = z.strictObject({
  items: z.array(
    z.strictObject({ userId: z.uuid(), name: z.string(), capabilities: grant }),
  ),
});
function InvoiceAccess({ entityId }: { entityId: string }) {
  const { request } = usePayablesClient();
  const current = useWorkspace();
  const load = useCallback(
    (signal: AbortSignal) =>
      request("/grants?entityId=" + entityId, accessSchema, { signal }),
    [entityId, request],
  );
  const state = useLoad(load);
  return (
    <section>
      <h2>Invoice access</h2>
      <p>
        Grant access to existing company members. Review, verification, approval
        and policy management are separate responsibilities. Approval still
        requires a current assignment.
      </p>
      <Notice error={state.error} />
      {!state.value && !state.error && (
        <p role="status">Loading invoice grants…</p>
      )}
      {state.value?.items.map((member) => (
        <AccessRow
          key={member.userId}
          member={member}
          entityId={entityId}
          self={member.userId === current.userId}
        />
      ))}
    </section>
  );
}
function AccessRow({
  member,
  entityId,
  self,
}: {
  member: z.infer<typeof accessSchema>["items"][number];
  entityId: string;
  self: boolean;
}) {
  const { request } = usePayablesClient();
  const [capabilities, setCapabilities] = useState(member.capabilities),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  return (
    <form
      className="ap-policy"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMessage("");
        try {
          await request(
            "/grants",
            z.strictObject({ status: z.literal("saved") }),
            {
              method: "POST",
              body: { entityId, userId: member.userId, ...capabilities },
            },
          );
          setMessage("Invoice access saved.");
        } catch (e) {
          setMessage((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3>
        {member.name}
        {self ? " · Your access" : ""}
      </h3>
      <div className="ap-form-grid">
        {(["view", "review", "verify", "approve", "manage"] as const).map(
          (k) => (
            <label className="ap-checkbox" key={k}>
              <input
                type="checkbox"
                disabled={self || busy || (k !== "view" && !capabilities.view)}
                checked={capabilities[k]}
                onChange={(e) =>
                  setCapabilities((v) =>
                    k === "view" && !e.target.checked
                      ? {
                          view: false,
                          review: false,
                          verify: false,
                          approve: false,
                          manage: false,
                        }
                      : { ...v, [k]: e.target.checked },
                  )
                }
              />
              {
                {
                  view: "View invoices",
                  review: "Review and export",
                  verify: "Verify delivery",
                  approve: "Approve assigned invoices",
                  manage: "Manage policies",
                }[k]
              }
            </label>
          ),
        )}
      </div>
      {self ? (
        <p>
          Another administrator or trusted operator must provision your invoice
          permissions.
        </p>
      ) : (
        <button className="primary" disabled={busy}>
          Save access
        </button>
      )}
      {message && <p role="status">{message}</p>}
    </form>
  );
}
type Chain = z.infer<typeof chainSchema>;
function ChainFields({
  value,
  onChange,
  caps,
  label,
  disabled = false,
}: {
  value: Chain;
  onChange: (v: Chain) => void;
  caps: Caps;
  label: string;
  disabled?: boolean;
}) {
  return (
    <div className="ap-form-grid">
      <label>
        {label} verifier
        <select
          disabled={disabled}
          value={value.verifierId || ""}
          onChange={(e) =>
            onChange({ ...value, verifierId: e.target.value || null })
          }
        >
          <option value="">No factual verification</option>
          {caps.members
            .filter((m) => m.verify)
            .map((m) => (
              <option key={m.id} value={m.id}>
                {m.name || m.id.slice(0, 8)}
              </option>
            ))}
        </select>
      </label>
      {[0, 1].map((step) => (
        <label key={step}>
          {label} approver {step + 1}
          <select
            disabled={disabled}
            value={value.approverIds[step] || ""}
            onChange={(e) => {
              const ids = [...value.approverIds];
              if (!e.target.value && step === 1) ids.splice(1, 1);
              else ids[step] = e.target.value;
              onChange({ ...value, approverIds: ids });
            }}
          >
            <option value="">
              {step === 0 ? "Choose first approver" : "One approval step"}
            </option>
            {caps.members
              .filter((m) => m.approve && m.id !== value.approverIds[1 - step])
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name || m.id.slice(0, 8)}
                </option>
              ))}
          </select>
        </label>
      ))}
    </div>
  );
}
function PolicyEditor({
  entityId,
  caps,
  item,
  reload,
}: {
  entityId: string;
  caps: Caps;
  item: z.infer<typeof policyResponse>["item"];
  reload: () => void;
}) {
  const { request } = usePayablesClient();
  const [definition, setDefinition] = useState<
      z.infer<typeof definitionSchema>
    >(
      item?.draft || {
        currency: "GBP",
        rules: [],
        fallback: { verifierId: null, approverIds: [""] },
      },
    ),
    [preview, setPreview] = useState("12000"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [ruleKeys, setRuleKeys] = useState(() =>
    (item?.draft?.rules || []).map(() => crypto.randomUUID()),
  );
  const operation = useRef<{ key: string; id: string } | undefined>(undefined);
  const rule = definition.rules
    .slice()
    .sort((a, b) => a.priority - b.priority)
    .find(
      (r) =>
        /^\d+$/.test(r.minimumGross) &&
        BigInt(preview || 0) >= BigInt(r.minimumGross),
    );
  const selected = rule || definition.fallback;
  const save = async (publish: boolean) => {
    setBusy(true);
    setError("");
    try {
      const ordered = {
        ...definition,
        rules: definition.rules.slice().sort((a, b) => a.priority - b.priority),
      };
      if (
        [ordered.fallback, ...ordered.rules].some(
          (c) =>
            !c.approverIds[0] ||
            new Set(c.approverIds).size !== c.approverIds.length,
        )
      )
        throw new Error("Select distinct active approvers for every chain.");
      if (
        ordered.rules.some(
          (r, i) =>
            !/^\d+$/.test(r.minimumGross) ||
            (i > 0 &&
              (r.priority === ordered.rules[i - 1].priority ||
                BigInt(r.minimumGross) >=
                  BigInt(ordered.rules[i - 1].minimumGross))),
        )
      )
        throw new Error(
          "Use distinct priorities and decreasing amount thresholds in priority order.",
        );
      const body = {
        entityId,
        expectedVersion: item?.version || 0,
        publish,
        definition: ordered,
      };
      const key = JSON.stringify(body);
      if (operation.current?.key !== key)
        operation.current = { key, id: crypto.randomUUID() };
      await request(
        "/approval-policies",
        z.strictObject({ version: z.number() }),
        {
          method: "POST",
          body: { ...body, operationId: operation.current.id },
        },
      );
      reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="ap-policy">
      <SlidersHorizontal size={24} />
      <h2>Approval policy</h2>
      <p>
        Review always comes first. The first matching priority selects the
        chain; every other invoice uses the fallback. Publishing preserves
        routes already in progress.
      </p>
      <span className="ap-status">
        {item?.published
          ? `Published revision ${item.publishedVersion}`
          : "No published policy"}
      </span>
      <Notice error={error} />
      {definition.rules.map((r, index) => (
        <fieldset key={ruleKeys[index]}>
          <legend>Amount rule {index + 1}</legend>
          <div className="ap-form-grid">
            <label>
              Priority
              <input
                disabled={busy}
                type="number"
                min={1}
                max={100}
                value={r.priority}
                onChange={(e) =>
                  setDefinition((d) => ({
                    ...d,
                    rules: d.rules.map((v, i) =>
                      i === index
                        ? { ...v, priority: Number(e.target.value) }
                        : v,
                    ),
                  }))
                }
              />
            </label>
            <label>
              Gross amount at least (GBP)
              <MoneyInput
                disabled={busy}
                value={r.minimumGross}
                onChange={(v) =>
                  setDefinition((d) => ({
                    ...d,
                    rules: d.rules.map((r, i) =>
                      i === index ? { ...r, minimumGross: v } : r,
                    ),
                  }))
                }
              />
            </label>
          </div>
          <ChainFields
            disabled={busy}
            label={`Rule ${index + 1}`}
            value={r}
            caps={caps}
            onChange={(v) =>
              setDefinition((d) => ({
                ...d,
                rules: d.rules.map((r, i) =>
                  i === index ? { ...r, ...v } : r,
                ),
              }))
            }
          />
          <button
            disabled={busy}
            onClick={() => {
              setRuleKeys((keys) => keys.filter((_, i) => i !== index));
              setDefinition((d) => ({
                ...d,
                rules: d.rules.filter((_, i) => i !== index),
              }));
            }}
          >
            Remove rule {index + 1}
          </button>
        </fieldset>
      ))}
      <button
        disabled={busy || definition.rules.length >= 10}
        onClick={() => {
          setRuleKeys((keys) => [...keys, crypto.randomUUID()]);
          setDefinition((d) => ({
            ...d,
            rules: [
              ...d.rules,
              {
                priority: Math.min(
                  100,
                  Math.max(0, ...d.rules.map((r) => r.priority)) + 1,
                ),
                minimumGross: "500000",
                verifierId: null,
                approverIds: [""],
              },
            ],
          }));
        }}
      >
        Add amount rule
      </button>
      <h3>Mandatory fallback</h3>
      <ChainFields
        disabled={busy}
        label="Fallback"
        value={definition.fallback}
        caps={caps}
        onChange={(fallback) => setDefinition((d) => ({ ...d, fallback }))}
      />
      <div className="ap-preview">
        <label>
          Preview invoice total (GBP)
          <MoneyInput disabled={busy} value={preview} onChange={setPreview} />
        </label>
        <p>
          {rule ? `Priority ${rule.priority}` : "Mandatory fallback"} ·{" "}
          {selected.approverIds.length} sequential approval
          {selected.approverIds.length > 1 ? "s" : ""}
          {selected.verifierId ? " · Factual verification first" : ""}
        </p>
      </div>
      <div className="ap-actions">
        <button disabled={busy} onClick={() => save(false)}>
          Save draft
        </button>
        <button className="primary" disabled={busy} onClick={() => save(true)}>
          Publish policy
        </button>
      </div>
    </section>
  );
}
