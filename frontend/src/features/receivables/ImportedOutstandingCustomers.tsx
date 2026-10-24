import { useEffect, useId, useState } from "react";
import { SessionGate } from "../../components/SessionGate";
import { ApiError, sessionEnabled } from "../../lib/api";
import { money } from "../../demo/selectors";
import {
  receivablesApi as api,
  validPeriod,
  type ImportedSummary,
} from "./api";
const expired = () => window.dispatchEvent(new Event("finai-session-expired"));
function message(e: unknown) {
  if (e instanceof ApiError) {
    if (e.status === 401) {
      expired();
      return "Session expired. Sign in again.";
    }
    if (e.status === 403 || e.status === 404)
      return "Permission denied for this receivables selection.";
    if (e.status >= 500 || e.status === 0)
      return "Receivables backend/proxy unavailable or response invalid. Retry.";
  }
  return e instanceof Error ? e.message : "Receivables unavailable. Retry.";
}
function ImportedBody({ workspace = false }: { workspace?: boolean }) {
  const [entities, setEntities] = useState<{ id: string; name: string }[]>([]),
    [entity, setEntity] = useState(""),
    [period, setPeriod] = useState("all"),
    [reload, setReload] = useState(0),
    [entityRetry, setEntityRetry] = useState(0),
    [entityError, setEntityError] = useState("");
  const [result, setResult] = useState<{
    key: string;
    data?: ImportedSummary;
    error?: string;
  }>();
  const entityId =
      entities.find((v) => v.id === entity)?.id || entities[0]?.id || "",
    key = JSON.stringify([entityId, period, reload]);
  const current = result?.key === key ? result : undefined;
  useEffect(() => {
    const c = new AbortController();
    let active = true;
    api
      .entities(c.signal)
      .then((v) => {
        if (active) {
          setEntities(v.items);
          setEntityError(
            v.items.length ? "" : "No authorized receivables entities.",
          );
        }
      })
      .catch((e) => {
        if (active) {
          setEntities([]);
          setEntityError(message(e));
        }
      });
    return () => {
      active = false;
      c.abort();
    };
  }, [entityRetry]);
  useEffect(() => {
    if (!entityId || !validPeriod(period)) return;
    const c = new AbortController();
    let active = true;
    api
      .summary(entityId, period, c.signal)
      .then((data) => {
        if (active) setResult({ key, data });
      })
      .catch((e) => {
        if (active) setResult({ key, error: message(e) });
      });
    return () => {
      active = false;
      c.abort();
    };
  }, [entityId, period, key]);
  // Revalidate after returning to the tab; no polling or persisted production cache.
  useEffect(() => {
    const refresh = () => setReload((v) => v + 1);
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);
  const data = current?.data;
  return (
    <>
      <p className="outstanding-customers-note">
        {workspace
          ? "Select an authorized entity and invoice issue period. These balances come from its imported accounting register."
          : "Imported balances use their own selection below. Surrounding financial panels and their entity/period controls remain demo data."}
      </p>
      <div className="receivables-controls">
        <label>
          Receivables entity
          <select
            aria-label="Receivables entity"
            value={entityId}
            onChange={(e) => setEntity(e.target.value)}
          >
            {!entities.length && <option value="">No entity selected</option>}
            {entities.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
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
            placeholder="all or YYYY-MM"
            onChange={(e) => setPeriod(e.target.value)}
          />
        </label>
        <button
          onClick={() => {
            if (entityError) {
              setEntityError("");
              setEntityRetry((v) => v + 1);
            }
            setReload((v) => v + 1);
          }}
        >
          Refresh stored snapshot
        </button>
      </div>
      <p className="outstanding-customers-basis">
        USD · Imported snapshot · Issue date period: {period}. Current
        cumulative payments; not an as-of month-end report. Refresh rereads
        stored data; source updates require an operator import.
      </p>
      {entityError ? (
        <p role="alert">{entityError}</p>
      ) : !entities.length ? (
        <p role="status">Loading authorized receivables entities…</p>
      ) : !validPeriod(period) ? (
        <p role="alert">
          Use all or a valid YYYY-MM issue period (years 0001–9999).
        </p>
      ) : !current ? (
        <p role="status">Loading imported receivables…</p>
      ) : current.error ? (
        <p role="alert">{current.error}</p>
      ) : null}
      {data?.dataState === "no_snapshot" && (
        <p role="status">
          No invoice snapshot imported for this entity. An authorized operator
          must import a complete source register.
        </p>
      )}
      {data?.dataState === "ready" && (
        <>
          <p className="receivables-source">
            Source: {data.source.sourceName} ·{" "}
            {entities.find((v) => v.id === entityId)?.name} · version{" "}
            {data.source.version}
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
          <dl className="outstanding-customers-totals">
            <div>
              <dt>Total current outstanding</dt>
              <dd>{money(data.totalCents)}</dd>
            </div>
            <div>
              <dt>Outstanding invoices</dt>
              <dd>{data.invoiceCount}</dd>
            </div>
            <div>
              <dt>Customers</dt>
              <dd>{data.customerCount}</dd>
            </div>
          </dl>
          {data.rows.length ? (
            <table>
              <caption>
                Largest balances · showing {data.rows.length} of{" "}
                {data.customerCount} customers
              </caption>
              <thead>
                <tr>
                  <th scope="col">Customer</th>
                  <th scope="col">Outstanding invoices</th>
                  <th scope="col">Amount due</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.customerId}>
                    <td>{row.customerName ?? "Customer unavailable"}</td>
                    <td>{row.invoiceCount}</td>
                    <td>{money(row.remainingCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>No outstanding invoices in this imported selection.</p>
          )}
        </>
      )}
      <p className="outstanding-customers-note">
        Imported invoice balances may differ from ledger-based receivables. No
        production record links are available in this demo workspace.
      </p>
    </>
  );
}
export function ImportedOutstandingCustomers({
  workspace = false,
}: {
  workspace?: boolean;
}) {
  const id = useId();
  const configured =
    sessionEnabled && import.meta.env.VITE_API_BASE_URL === "/api/v1";
  return (
    <section className="panel outstanding-customers" aria-labelledby={id}>
      <div className="section-heading">
        <h2 id={id}>Outstanding by customer</h2>
      </div>
      {configured ? (
        <SessionGate title="Sign in for imported receivables" headingLevel={2}>
          <ImportedBody workspace={workspace} />
        </SessionGate>
      ) : (
        <p role="alert">
          Imported receivables is not configured for authenticated access.
          Contact your administrator. Demo data will not be substituted.
        </p>
      )}
    </section>
  );
}
