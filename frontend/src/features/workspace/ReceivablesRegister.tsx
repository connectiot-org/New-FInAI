import { useEffect, useState, useRef, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { receivablesApi, validPeriod } from "../receivables/api";
import {
  receivablesDetailApi as api,
  detailStatus,
  type DetailPage,
  type DetailScope,
} from "../receivables/detail-api";
import { usdCents, downloadInvoiceCsv } from "../receivables/format";
export function ReceivablesRegister({ view }: { view: DetailPage["view"] }) {
  const [historyOffset, setHistoryOffset] = useState(0),
    [showHistory, setShowHistory] = useState(false),
    [history, setHistory] = useState<Awaited<ReturnType<typeof api.history>>>(),
    [historyError, setHistoryError] = useState("");
  const [params, setParams] = useSearchParams(),
    [entities, setEntities] = useState<{ id: string; name: string }[]>([]),
    [entityError, setEntityError] = useState(""),
    [empty, setEmpty] = useState(false),
    [revision, setRevision] = useState(0),
    [searchText, setSearchText] = useState(params.get("search") || ""),
    [exporting, setExporting] = useState(false),
    [exportError, setExportError] = useState("");
  const entityId = params.get("entityId") || entities[0]?.id || "",
    snapshotId = params.get("snapshotId") || "",
    period = params.get("period") || "all",
    status = detailStatus.safeParse(params.get("status") || "outstanding"),
    offset = Number(params.get("offset") || 0),
    customerId = params.get("customerId") || undefined,
    search = params.get("search") || "";
  const validEntity = entities.some((e) => e.id === entityId),
    valid =
      validEntity &&
      validPeriod(period) &&
      status.success &&
      Number.isInteger(offset) &&
      offset >= 0 &&
      offset <= 10000 &&
      search.length <= 100 &&
      (customerId?.length || 0) <= 200;
  const statusValue = status.success ? status.data : "outstanding";
  const scope = useMemo<DetailScope>(
    () => ({
      entityId,
      snapshotId,
      period,
      status: statusValue,
      offset,
      limit: 20,
      customerId,
      search,
    }),
    [entityId, snapshotId, period, statusValue, offset, customerId, search],
  );
  const key = JSON.stringify([view, scope, revision]),
    [result, setResult] = useState<{
      key: string;
      data?: DetailPage;
      error?: string;
    }>();
  const current = result?.key === key ? result : undefined;
  const activeKey = useRef(key),
    exportRequest = useRef<AbortController | undefined>(undefined);
  activeKey.current = key;
  useEffect(() => () => exportRequest.current?.abort(), [key]);
  useEffect(() => {
    const c = new AbortController();
    let active = true;
    receivablesApi
      .entities(c.signal)
      .then((v) => {
        if (active) setEntities(v.items);
      })
      .catch((e) => {
        if (active)
          setEntityError(
            e instanceof Error ? e.message : "Entities unavailable.",
          );
      });
    return () => {
      active = false;
      c.abort();
    };
  }, []);
  useEffect(() => {
    if (!valid || snapshotId) return;
    const c = new AbortController();
    let active = true;
    api
      .history(entityId, c.signal)
      .then((v) => {
        if (!active) return;
        if (!v.items.length) {
          setEmpty(true);
          return;
        }
        const q = new URLSearchParams(params);
        q.set("entityId", entityId);
        q.set("snapshotId", v.items[0].snapshotId);
        q.set("offset", "0");
        setParams(q, { replace: true });
        setEmpty(false);
      })
      .catch((e) => {
        if (active)
          setResult({
            key,
            error: e instanceof Error ? e.message : "Snapshot unavailable.",
          });
      });
    return () => {
      active = false;
      c.abort();
    };
  }, [valid, entityId, snapshotId, key, params, setParams]);
  useEffect(() => {
    if (!valid || !snapshotId) return;
    const c = new AbortController();
    let active = true;
    api
      .page(view, scope, c.signal)
      .then((data) => {
        if (active) setResult({ key, data });
      })
      .catch((e) => {
        if (active)
          setResult({
            key,
            error: e instanceof Error ? e.message : "Register unavailable.",
          });
      });
    return () => {
      active = false;
      c.abort();
    };
  }, [key, valid, snapshotId, scope, view]);
  useEffect(() => {
    setHistory(undefined);
    setHistoryError("");
    if (!validEntity || !showHistory) return;
    const c = new AbortController();
    api
      .history(entityId, c.signal, historyOffset)
      .then((v) => {
        if (!c.signal.aborted) setHistory(v);
      })
      .catch((e: Error) => {
        if (!c.signal.aborted) setHistoryError(e.message);
      });
    return () => c.abort();
  }, [entityId, validEntity, historyOffset, showHistory]);
  function select(values: Record<string, string | undefined>) {
    const q = new URLSearchParams(params);
    q.set("entityId", entityId);
    q.set("offset", "0");
    for (const [k, v] of Object.entries(values)) {
      if (v) q.set(k, v);
      else q.delete(k);
    }
    setEmpty(false);
    setExportError("");
    setParams(q);
  }
  const data = current?.data,
    title =
      view === "invoice"
        ? "Imported invoices"
        : view === "customer"
          ? "Customer balances"
          : "Balances by invoice issue month";
  const query = (extra: Record<string, string> = {}) => {
    const q = new URLSearchParams(params);
    q.set("entityId", entityId);
    if (snapshotId) q.set("snapshotId", snapshotId);
    q.set("period", period);
    q.set("offset", "0");
    for (const [k, v] of Object.entries(extra)) q.set(k, v);
    return q.toString();
  };
  return (
    <>
      <h1>{title}</h1>
      <p>
        Read-only analysis of one imported invoice register. Issue periods use
        cumulative paid values at the source cutoff; these are not overdue aging
        or month-end accounting statements.
      </p>
      <nav aria-label="Receivables views">
        <Link to={"/workspace/receivables/invoices?" + query()}>Invoices</Link>
        <Link to={"/workspace/receivables/customers?" + query()}>
          Customers
        </Link>
        <Link to={"/workspace/receivables/periods?" + query()}>
          Issue periods
        </Link>
      </nav>
      <button
        onClick={() => {
          setShowHistory((v) => !v);
          setHistoryOffset(0);
        }}
      >
        Browse source history
      </button>
      {showHistory && (
        <section className="panel">
          <h2>Source history</h2>
          {historyError && <p role="alert">{historyError}</p>}
          {history ? (
            <>
              <ul>
                {history.items.map((h) => (
                  <li key={h.snapshotId}>
                    <button
                      onClick={() => select({ snapshotId: h.snapshotId })}
                    >
                      Use version {h.version}
                    </button>{" "}
                    {h.sourceName} · captured {h.sourceCapturedAt} · imported{" "}
                    {h.importedAt} · actor {h.importingActorId} · digest{" "}
                    {h.digest}
                  </li>
                ))}
              </ul>
              <button
                disabled={historyOffset === 0}
                onClick={() => setHistoryOffset((n) => Math.max(0, n - 20))}
              >
                Previous sources
              </button>
              <button
                disabled={history.nextOffset === null}
                onClick={() => setHistoryOffset(history.nextOffset!)}
              >
                Older sources
              </button>
            </>
          ) : (
            <p>Loading sources…</p>
          )}
        </section>
      )}
      <div className="panel register-filters">
        <label>
          Receivables entity
          <select
            aria-label="Receivables entity"
            value={entityId}
            onChange={(e) =>
              select({
                entityId: e.target.value,
                snapshotId: undefined,
                customerId: undefined,
              })
            }
          >
            {!entities.length && <option value="">No entity selected</option>}
            {entities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Invoice issue period
          <input
            aria-label="Invoice issue period"
            value={period}
            maxLength={7}
            onChange={(e) => select({ period: e.target.value })}
          />
        </label>
        <label>
          Source status
          <select
            aria-label="Source status"
            value={scope.status}
            onChange={(e) => select({ status: e.target.value })}
          >
            <option value="outstanding">Outstanding</option>
            <option value="all">All source rows</option>
            {["Draft", "Issued", "Partial", "Paid"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            select({ search: searchText.trim() || undefined });
          }}
        >
          <label>
            Search register
            <input
              aria-label="Search register"
              value={searchText}
              maxLength={100}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </label>
          <button>Search</button>
        </form>
        <button onClick={() => select({ snapshotId: undefined })}>
          Use latest snapshot
        </button>
        <button
          disabled={!data || exporting}
          onClick={async () => {
            setExporting(true);
            setExportError("");
            const startedKey = key;
            const c = new AbortController();
            exportRequest.current = c;
            try {
              const v = await api.page("invoice", scope, c.signal, true);
              if (activeKey.current === startedKey && v.view === "invoice")
                downloadInvoiceCsv(v);
            } catch (e) {
              if (!c.signal.aborted && activeKey.current === startedKey)
                setExportError(
                  e instanceof Error ? e.message : "Export failed.",
                );
            } finally {
              setExporting(false);
            }
          }}
        >
          {exporting ? "Preparing export…" : "Export filtered invoices CSV"}
        </button>
      </div>
      {entityError ? (
        <p role="alert">{entityError}</p>
      ) : !entities.length ? (
        <p role="status">Loading authorized entities…</p>
      ) : !valid ? (
        <p role="alert">
          Entity or register filters are unavailable. Select an authorized
          entity and valid issue period.
        </p>
      ) : current?.error ? (
        <p role="alert">
          {current.error}{" "}
          <button onClick={() => setRevision((v) => v + 1)}>
            Retry register
          </button>
        </p>
      ) : !snapshotId && empty ? (
        <p role="status">No invoice snapshot imported for this entity.</p>
      ) : !data ? (
        <p role="status">Loading imported register…</p>
      ) : null}
      {exportError && <p role="alert">{exportError}</p>}
      {data && (
        <section className="panel">
          <p className="register-provenance">
            {entities.find((e) => e.id === entityId)?.name} · {data.currency} ·{" "}
            {data.source.sourceName} · version {data.source.version}
            <br />
            Snapshot: {data.source.snapshotId}
            <br />
            Source captured:{" "}
            <time dateTime={data.source.sourceCapturedAt}>
              {data.source.sourceCapturedAt}
            </time>
            <br />
            Imported:{" "}
            <time dateTime={data.source.importedAt}>
              {data.source.importedAt}
            </time>
          </p>
          <p>
            Filtered balance: <strong>{usdCents(data.remainingCents)}</strong> ·{" "}
            {data.invoiceCount} invoices · {data.customerCount} customers.
            Showing {data.items.length} of {data.total}{" "}
            {view === "invoice"
              ? "invoices"
              : view === "customer"
                ? "customers"
                : "issue months"}
            .
          </p>
          {data.items.length ? (
            <div
              className="register-scroll"
              role="region"
              aria-label="Imported register table"
              tabIndex={0}
            >
              <table className={view === "invoice" ? "register-invoices" : ""}>
                <caption>
                  Pinned snapshot; newer imports do not change these pages.
                </caption>
                <thead>
                  <tr>
                    {(view === "invoice"
                      ? [
                          "Invoice ID",
                          "Customer",
                          "Issued on",
                          "Status",
                          "Amount",
                          "Cumulative paid",
                          "Remaining",
                        ]
                      : view === "customer"
                        ? ["Customer", "Outstanding invoices", "Remaining"]
                        : ["Issue month", "Invoices", "Customers", "Remaining"]
                    ).map((h) => (
                      <th key={h} scope="col">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.view === "invoice"
                    ? data.items.map((r) => (
                        <tr key={r.invoiceId}>
                          <td>{r.invoiceId}</td>
                          <td>{r.customerName ?? "Customer unavailable"}</td>
                          <td>{r.issuedOn}</td>
                          <td>{r.status}</td>
                          <td>{usdCents(r.amountCents)}</td>
                          <td>{usdCents(r.paidCents)}</td>
                          <td>{usdCents(r.remainingCents)}</td>
                        </tr>
                      ))
                    : data.view === "customer"
                      ? data.items.map((r) => (
                          <tr key={r.customerId}>
                            <td>
                              {r.customerName ? (
                                <Link
                                  to={
                                    "/workspace/receivables/invoices?" +
                                    query({ customerId: r.customerId })
                                  }
                                >
                                  {r.customerName}
                                </Link>
                              ) : (
                                "Customer unavailable"
                              )}
                            </td>
                            <td>{r.invoiceCount}</td>
                            <td>{usdCents(r.remainingCents)}</td>
                          </tr>
                        ))
                      : data.items.map((r) => (
                          <tr key={r.period}>
                            <td>
                              <Link
                                to={
                                  "/workspace/receivables/customers?" +
                                  query({ period: r.period })
                                }
                              >
                                {r.period}
                              </Link>
                            </td>
                            <td>{r.invoiceCount}</td>
                            <td>{r.customerCount}</td>
                            <td>{usdCents(r.remainingCents)}</td>
                          </tr>
                        ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>No invoices match this snapshot and filter selection.</p>
          )}
          <div className="register-pagination">
            <button
              disabled={offset === 0}
              onClick={() =>
                select({ offset: String(Math.max(0, offset - 20)) })
              }
            >
              Previous register page
            </button>
            <span>
              Offset {data.offset} · {data.total} records
            </span>
            <button
              disabled={data.nextOffset === null}
              onClick={() => select({ offset: String(data.nextOffset) })}
            >
              Next register page
            </button>
          </div>
        </section>
      )}
    </>
  );
}
