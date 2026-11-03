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
}: {
  value: string;
  onChange: (minor: string) => void;
}) {
  const [raw, setRaw] = useState(() =>
    /^\d+$/.test(value)
      ? `${BigInt(value) / 100n}.${(BigInt(value) % 100n).toString().padStart(2, "0")}`
      : "",
  );
  return (
    <input
      required
      inputMode="decimal"
      pattern="[0-9]+([.][0-9]{1,2})?"
      value={raw}
      onChange={(e) => {
        const v = e.target.value;
        if (!/^\d{0,8}(\.\d{0,2})?$/.test(v)) return;
        setRaw(v);
        if (!v) {
          onChange("");
          return;
        }
        const [whole, fraction = ""] = v.split(".");
        onChange(
          (
            BigInt(whole || 0) * 100n +
            BigInt(fraction.padEnd(2, "0"))
          ).toString(),
        );
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
  const [entityId, setEntityId] = useState(c.entities[0]?.id || "");
  return (
    <div className="ap-root" key={c.revision}>
      <div className="ap-top">
        <div>
          <span className="ap-eyebrow">PAYABLES</span>
          <h1>Invoices</h1>
          <p>From supplier document to a clear approval decision.</p>
        </div>
        <label>
          Company
          <select
            value={entityId}
            onChange={(e) => setEntityId(e.target.value)}
          >
            {c.entities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <nav className="ap-nav" aria-label="Payables">
        <Link to={basePath + "/invoices"}>Invoices</Link>
        <Link to={basePath + "/suppliers"}>Suppliers</Link>
        <Link to={basePath + "/export"}>Accounting export</Link>
        <Link to={basePath + "/settings/approvals"}>Approval settings</Link>
        {c.administrator && (
          <Link to={basePath + "/settings/access"}>Invoice access</Link>
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
  const [queue, setQueue] = useState(exportView ? "export" : "all"),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState(""),
    [due, setDue] = useState(""),
    [assignee, setAssignee] = useState(""),
    [offset, setOffset] = useState(0),
    [adding, setAdding] = useState(false);
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
            ...(due ? { dueBefore: due } : {}),
            ...(assignee ? { assignee } : {}),
          }),
        listSchema,
        { signal },
      ),
    [entityId, queue, search, status, due, assignee, offset, request],
  );
  const rows = useLoad(load),
    navigate = useNavigate();
  return (
    <>
      <div className="ap-toolbar">
        <h2>
          {exportView ? "Ready for accounting export" : "Supplier invoices"}
        </h2>
        {caps.capabilities.review && (
          <button className="primary" onClick={() => setAdding(true)}>
            <Plus size={16} />
            Add invoice
          </button>
        )}
      </div>
      {exportView && (
        <p>
          Approval and accounting export are separate from payment. An export
          does not confirm posting.
        </p>
      )}
      {!exportView && (
        <div className="ap-tabs" role="tablist" aria-label="Invoice queues">
          {["all", "review", "verify", "approve"].map((t) => (
            <button
              role="tab"
              aria-selected={queue === t}
              key={t}
              onClick={() => {
                setQueue(t);
                setOffset(0);
              }}
            >
              {t === "all"
                ? "All"
                : t === "review"
                  ? "Review"
                  : t === "verify"
                    ? "Verify"
                    : "Approve"}
              <span>
                {rows.value?.counts[t as keyof typeof rows.value.counts] ?? "—"}
              </span>
            </button>
          ))}
        </div>
      )}
      <div className="ap-filters">
        <label>
          Search
          <input
            placeholder="Supplier or invoice reference"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setOffset(0);
            }}
          />
        </label>
        <label>
          Status
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setOffset(0);
            }}
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
            onChange={(e) => {
              setDue(e.target.value);
              setOffset(0);
            }}
          />
        </label>
        <label>
          Assigned to
          <select
            value={assignee}
            onChange={(e) => {
              setAssignee(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">Anyone</option>
            {caps.members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <Notice error={rows.error} />
      {rows.error && <button onClick={rows.reload}>Retry</button>}
      {!rows.value && !rows.error ? (
        <p role="status">Loading invoices…</p>
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
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Responsible</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.value.items.map((n) => (
                    <tr key={n.id}>
                      <td>
                        <Link to={basePath + "/invoices/" + n.id}>
                          <strong>{n.supplier}</strong>
                          <small>{n.reference}</small>
                        </Link>
                      </td>
                      <td>{n.invoiceDate}</td>
                      <td>{n.dueDate}</td>
                      <td className="ap-money">
                        {amount(n.gross)} <small>GBP</small>
                      </td>
                      <td>
                        <span className={"ap-status " + n.state}>
                          {labels[n.state]}
                        </span>
                        {n.attention && (
                          <small className="ap-warning">Needs attention</small>
                        )}
                      </td>
                      <td>
                        {n.owner
                          ? memberName(caps, n.owner)
                          : n.state === "approved"
                            ? "Complete"
                            : n.state === "rejected"
                              ? "Closed"
                              : "Finance review"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!rows.value.total && (
                <div className="ap-empty">
                  <FileText size={30} />
                  <h3>
                    {search || status
                      ? "No matching invoices"
                      : "Your invoice queue is clear"}
                  </h3>
                  <p>
                    {caps.capabilities.review
                      ? "Add a supplier invoice to start a review."
                      : "Assigned invoices will appear here."}
                  </p>
                </div>
              )}
            </div>
            <div className="ap-pagination">
              <span>{rows.value.total} invoices · GBP</span>
              <button
                disabled={!offset}
                onClick={() => setOffset((v) => Math.max(0, v - 20))}
              >
                Previous
              </button>
              <button
                disabled={offset + 20 >= rows.value.total}
                onClick={() => setOffset((v) => v + 20)}
              >
                Next
              </button>
            </div>
          </>
        )
      )}
      {adding && (
        <InvoiceForm
          entityId={entityId}
          close={() => setAdding(false)}
          done={(id) => navigate(basePath + "/invoices/" + id)}
        />
      )}
    </>
  );
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
                required
                maxLength={200}
                value={data.reference}
                onChange={(e) => update("reference", e.target.value)}
              />
            </label>
            <label>
              Invoice date
              <input
                type="date"
                required
                value={data.invoiceDate}
                onChange={(e) => update("invoiceDate", e.target.value)}
              />
            </label>
            <label>
              Due date
              <input
                type="date"
                required
                value={data.dueDate}
                onChange={(e) => update("dueDate", e.target.value)}
              />
            </label>
            <label>
              Total on supplier document (GBP)
              <MoneyInput
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
            <fieldset key={index}>
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
                  onClick={() =>
                    update(
                      "lines",
                      data.lines.filter((_, i) => i !== index),
                    )
                  }
                >
                  Remove line
                </button>
              )}
            </fieldset>
          ))}
          <button
            type="button"
            disabled={data.lines.length >= 50}
            onClick={() => update("lines", [...data.lines, { ...blankLine }])}
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
  const [previewBlob, setPreviewBlob] = useState<Blob>();
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
      <Link className="ap-back" to={basePath + "/invoices"}>
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
                    setBusy(true);
                    binary(`/invoices/${id}/documents/${d.id}`, undefined, true)
                      .then((blob) => {
                        if (blob) setPreviewBlob(blob);
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
                  const file = e.target.files?.[0];
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
          {previewBlob && <PdfPreview blob={previewBlob} />}
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
            <input name="name" required maxLength={200} />
          </label>
          <label>
            Tax identifier
            <input name="taxId" maxLength={200} />
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
                maxLength={200}
                value={editing.taxId}
                onChange={(e) =>
                  setEditing({ ...editing, taxId: e.target.value })
                }
              />
            </label>
            <label className="ap-checkbox">
              <input
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
}: {
  value: Chain;
  onChange: (v: Chain) => void;
  caps: Caps;
  label: string;
}) {
  return (
    <div className="ap-form-grid">
      <label>
        {label} verifier
        <select
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
        <fieldset key={index}>
          <legend>Amount rule {index + 1}</legend>
          <div className="ap-form-grid">
            <label>
              Priority
              <input
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
            onClick={() =>
              setDefinition((d) => ({
                ...d,
                rules: d.rules.filter((_, i) => i !== index),
              }))
            }
          >
            Remove rule {index + 1}
          </button>
        </fieldset>
      ))}
      <button
        disabled={busy || definition.rules.length >= 10}
        onClick={() =>
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
          }))
        }
      >
        Add amount rule
      </button>
      <h3>Mandatory fallback</h3>
      <ChainFields
        label="Fallback"
        value={definition.fallback}
        caps={caps}
        onChange={(fallback) => setDefinition((d) => ({ ...d, fallback }))}
      />
      <div className="ap-preview">
        <label>
          Preview invoice total (GBP)
          <MoneyInput value={preview} onChange={setPreview} />
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
