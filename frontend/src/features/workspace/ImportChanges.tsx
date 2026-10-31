import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { useWorkspace } from "./context";
import {
  receivablesDetailApi as historyApi,
  sourceSchema,
} from "../receivables/detail-api";
import {
  receivablesChangesApi as api,
  usdChangeCents as usd,
  type ChangesPage,
  type ChangeRecord,
} from "../receivables/changes-api";
type Source = z.infer<typeof sourceSchema>;
const fieldNames = {
  customerId: "Customer ID",
  customerName: "Customer name",
  issuedOn: "Issued date",
  status: "Status",
  amountCents: "Amount",
  paidCents: "Cumulative paid",
};
const flagNames = {
  new_in_later: "New in later import",
  absent_from_later: "Absent from later import",
  outstanding_increased: "Outstanding increased",
  outstanding_decreased: "Outstanding decreased",
};
function SourceLabel({ source }: { source: Source }) {
  return (
    <p className="register-provenance">
      Version {source.version} · {source.sourceName}
      <br />
      Snapshot: {source.snapshotId}
      <br />
      Source captured:{" "}
      <time dateTime={source.sourceCapturedAt}>{source.sourceCapturedAt}</time>
      <br />
      Imported: <time dateTime={source.importedAt}>{source.importedAt}</time>
    </p>
  );
}
function RecordValues({ record }: { record: ChangeRecord | null }) {
  return record ? (
    <dl className="change-record">
      <dt>Customer</dt>
      <dd>
        {record.customerName ?? "Name unavailable"} · ID {record.customerId}
      </dd>
      <dt>Issued date</dt>
      <dd>{record.issuedOn}</dd>
      <dt>Status</dt>
      <dd>{record.status}</dd>
      <dt>Amount</dt>
      <dd>{usd(record.amountCents)}</dd>
      <dt>Cumulative paid</dt>
      <dd>{usd(record.paidCents)}</dd>
    </dl>
  ) : (
    <p>Not present in this import.</p>
  );
}
function Comparison({ data }: { data: ChangesPage }) {
  const link = (source: Source) =>
    "/workspace/receivables/invoices?" +
    new URLSearchParams({
      entityId: data.entityId,
      snapshotId: source.snapshotId,
      period: "all",
      status: "all",
    });
  const delta = BigInt(data.deltaCents);
  return (
    <section aria-label="Import comparison" className="panel import-comparison">
      <h2>
        {delta < 0n
          ? `Outstanding decreased by ${usd((-delta).toString())}.`
          : delta > 0n
            ? `Outstanding increased by ${usd(data.deltaCents)}.`
            : "Outstanding is unchanged."}
      </h2>
      <p>
        {data.changedInvoiceCount} changed{" "}
        {data.changedInvoiceCount === 1 ? "invoice" : "invoices"} ·{" "}
        {data.unionInvoiceCount} distinct invoice IDs across both imports.
      </p>
      <dl className="change-summary">
        <div>
          <dt>Earlier outstanding</dt>
          <dd>{usd(data.earlierOutstandingCents)}</dd>
        </div>
        <div>
          <dt>Later outstanding</dt>
          <dd>{usd(data.laterOutstandingCents)}</dd>
        </div>
        <div>
          <dt>Signed change</dt>
          <dd>{usd(data.deltaCents, true)}</dd>
        </div>
      </dl>
      <div className="change-sources">
        <section aria-label="Earlier source">
          <h3>Earlier import</h3>
          <SourceLabel source={data.fromSource} />
          <Link to={link(data.fromSource)}>Open earlier source register</Link>
        </section>
        <section aria-label="Later source">
          <h3>Later import</h3>
          <SourceLabel source={data.toSource} />
          <Link to={link(data.toSource)}>Open later source register</Link>
        </section>
      </div>
      {data.sourceCutoffReversed && (
        <p role="note" className="notice">
          Source cutoffs run backward: the later imported version has an earlier
          source-capture time. This comparison is not a forward time trend.
        </p>
      )}
      {data.fromSource.snapshotId === data.toSource.snapshotId && (
        <p role="status">
          The same source is selected on both sides. There are no changes.
        </p>
      )}
      <details>
        <summary>How the balance change reconciles</summary>
        <dl className="change-summary">
          <div>
            <dt>Newly present IDs</dt>
            <dd>{usd(data.bridge.newInLaterCents, true)}</dd>
          </div>
          <div>
            <dt>Absent IDs</dt>
            <dd>{usd(data.bridge.absentFromLaterCents, true)}</dd>
          </div>
          <div>
            <dt>Increases in matched IDs</dt>
            <dd>{usd(data.bridge.increasedCents, true)}</dd>
          </div>
          <div>
            <dt>Decreases in matched IDs</dt>
            <dd>{usd(data.bridge.decreasedCents, true)}</dd>
          </div>
        </dl>
        <p>
          These four contributions add to the signed change across the complete
          sources, including rows on other pages. Change labels can overlap; the
          changed-invoice count counts each ID once.
        </p>
      </details>
      <p>
        Reported cumulative paid amounts are source facts, not dated cash
        receipts. Absence does not prove deletion, payment or write-off. Draft
        and fully paid rows contribute zero to outstanding.
      </p>
      {!data.changedInvoiceCount ? (
        <p role="status">No invoice changes between these sources.</p>
      ) : (
        <div
          className="register-scroll"
          role="region"
          aria-label="Changed invoices table"
          tabIndex={0}
        >
          <table className="change-table">
            <caption>
              Changed rows only. Full-source totals do not change across pages.
            </caption>
            <thead>
              <tr>
                <th scope="col">Invoice ID and changes</th>
                <th scope="col">Earlier values</th>
                <th scope="col">Later values</th>
                <th scope="col">Outstanding change</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((r) => (
                <tr key={r.invoiceId}>
                  <th scope="row">
                    {r.invoiceId}
                    <ul>
                      {r.flags.map((f) => (
                        <li key={f}>{flagNames[f]}</li>
                      ))}
                    </ul>
                    {!!r.changedFields.length && (
                      <p>
                        Changed fields:{" "}
                        {r.changedFields.map((f) => fieldNames[f]).join(", ")}
                      </p>
                    )}
                  </th>
                  <td>
                    <RecordValues record={r.earlier} />
                    <p>Contribution: {usd(r.earlierOutstandingCents)}</p>
                  </td>
                  <td>
                    <RecordValues record={r.later} />
                    <p>Contribution: {usd(r.laterOutstandingCents)}</p>
                  </td>
                  <td>{usd(r.deltaCents, true)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
function ChangesBody({ entityId }: { entityId: string }) {
  const [params, setParams] = useSearchParams();
  const from = params.get("fromSnapshotId") || "",
    to = params.get("toSnapshotId") || "",
    rawOffset = params.get("offset") || "0",
    offset = Number(rawOffset);
  const valid =
    z.uuid().safeParse(from).success &&
    z.uuid().safeParse(to).success &&
    /^\d{1,5}$/.test(rawOffset) &&
    offset <= 20000;
  const [fromDraft, setFromDraft] = useState(from),
    [toDraft, setToDraft] = useState(to);
  const [historyOffset, setHistoryOffset] = useState(0),
    [historyRevision, setHistoryRevision] = useState(0),
    [revision, setRevision] = useState(0);
  const historyKey = JSON.stringify([historyOffset, historyRevision]),
    [history, setHistory] = useState<{
      key: string;
      data?: Awaited<ReturnType<typeof historyApi.history>>;
      error?: string;
    }>(),
    [known, setKnown] = useState<Source[]>([]);
  const h = history?.key === historyKey ? history : undefined;
  const scope = useMemo(
    () => ({
      entityId,
      fromSnapshotId: from,
      toSnapshotId: to,
      offset,
      limit: 20,
    }),
    [entityId, from, to, offset],
  );
  const key = JSON.stringify([scope, revision]),
    [result, setResult] = useState<{
      key: string;
      data?: ChangesPage;
      error?: string;
    }>();
  const current = result?.key === key ? result : undefined,
    data = current?.data;
  const selectionDirty = fromDraft !== from || toDraft !== to;
  useEffect(() => {
    setFromDraft(from);
    setToDraft(to);
  }, [from, to]);
  useEffect(() => {
    const c = new AbortController();
    historyApi
      .history(entityId, c.signal, historyOffset)
      .then((v) => {
        if (c.signal.aborted) return;
        setHistory({ key: historyKey, data: v });
        setKnown((old) =>
          Array.from(
            new Map(
              [...old, ...v.items].map((s) => [s.snapshotId, s]),
            ).values(),
          ),
        );
      })
      .catch((e: Error) => {
        if (!c.signal.aborted)
          setHistory({ key: historyKey, error: e.message });
      });
    return () => c.abort();
  }, [entityId, historyOffset, historyKey]);
  useEffect(() => {
    if (from || to || !h?.data?.items.length || historyOffset !== 0) return;
    const q = new URLSearchParams({
      entityId,
      fromSnapshotId: (h.data.items[1] || h.data.items[0]).snapshotId,
      toSnapshotId: h.data.items[0].snapshotId,
      offset: "0",
    });
    setParams(q, { replace: true });
  }, [from, to, h, historyOffset, entityId, setParams]);
  useEffect(() => {
    if (!valid) return;
    const c = new AbortController();
    api
      .compare(scope, c.signal)
      .then((v) => {
        if (!c.signal.aborted) setResult({ key, data: v });
      })
      .catch((e: Error) => {
        if (!c.signal.aborted) setResult({ key, error: e.message });
      });
    return () => c.abort();
  }, [key, scope, valid]);
  const options = Array.from(
    new Map(
      [...known, ...(data ? [data.fromSource, data.toSource] : [])].map((s) => [
        s.snapshotId,
        s,
      ]),
    ).values(),
  );
  function select(fromSnapshotId: string, toSnapshotId: string, offset = 0) {
    setParams({
      entityId,
      fromSnapshotId,
      toSnapshotId,
      offset: String(offset),
    });
  }
  return (
    <>
      <form
        className="panel change-selectors"
        onSubmit={(e) => {
          e.preventDefault();
          select(fromDraft, toDraft);
        }}
      >
        {(
          [
            ["Earlier import", fromDraft, setFromDraft],
            ["Later import", toDraft, setToDraft],
          ] as const
        ).map(([label, value, set]) => (
          <label key={label}>
            {label}
            <select
              aria-label={label}
              value={value}
              onChange={(e) => set(e.target.value)}
            >
              {!value && <option value="">Select a saved import</option>}
              {!!value && !options.some((s) => s.snapshotId === value) && (
                <option value={value}>Selected import {value}</option>
              )}
              {options.map((s) => (
                <option key={s.snapshotId} value={s.snapshotId}>
                  Version {s.version} · {s.sourceName} · captured{" "}
                  {s.sourceCapturedAt} · imported {s.importedAt}
                </option>
              ))}
            </select>
          </label>
        ))}
        <button className="primary" disabled={!fromDraft || !toDraft}>
          Compare selected imports
        </button>
      </form>
      <div className="register-pagination" aria-label="Saved source history">
        <button
          disabled={historyOffset === 0}
          onClick={() => setHistoryOffset((n) => Math.max(0, n - 20))}
        >
          Newer source choices
        </button>
        <button
          disabled={!h?.data || h.data.nextOffset === null}
          onClick={() => setHistoryOffset(h!.data!.nextOffset!)}
        >
          Older source choices
        </button>
        <button
          onClick={() => {
            setHistoryOffset(0);
            setHistoryRevision((n) => n + 1);
          }}
        >
          Reload source choices
        </button>
        <span>
          Browse saved sources to select older versions. Selected comparison
          stays pinned.
        </span>
      </div>
      {h?.error ? (
        <p role="alert">
          {h.error}{" "}
          <button onClick={() => setHistoryRevision((n) => n + 1)}>
            Retry sources
          </button>
        </p>
      ) : !h ? (
        <p role="status">Loading saved imports…</p>
      ) : h.data?.total === 0 ? (
        <p role="status">No invoice imports saved for this entity.</p>
      ) : h.data?.total === 1 ? (
        <p role="note">
          Only one import is available. Select it on both sides for a
          zero-change review, or import another register separately.
        </p>
      ) : null}
      {(from || to) && !valid ? (
        <p role="alert">
          Choose valid saved import IDs and a supported comparison page.
        </p>
      ) : current?.error ? (
        <p role="alert">
          {current.error}{" "}
          <button onClick={() => setRevision((n) => n + 1)}>
            Retry comparison
          </button>
        </p>
      ) : valid && !data ? (
        <p role="status">Loading import comparison…</p>
      ) : null}
      {selectionDirty && (
        <p role="status">
          Selection changed. Compare selected imports to load their changes.
        </p>
      )}
      {data && !selectionDirty && (
        <>
          <Comparison data={data} />
          <div className="register-pagination">
            <button
              disabled={offset === 0}
              onClick={() => select(from, to, Math.max(0, offset - 20))}
            >
              Previous changes
            </button>
            <span>
              {data.items.length
                ? `Showing ${offset + 1}–${offset + data.items.length}`
                : "Showing 0"}{" "}
              of {data.changedInvoiceCount} changed invoices
            </span>
            <button
              disabled={data.nextOffset === null}
              onClick={() => select(from, to, data.nextOffset!)}
            >
              Next changes
            </button>
          </div>
        </>
      )}
    </>
  );
}
export function ImportChanges() {
  const { entities } = useWorkspace(),
    [params, setParams] = useSearchParams();
  const entityId = params.get("entityId") || entities[0]?.id || "";
  return (
    <>
      <h1>What changed between imports?</h1>
      <p>
        Compare saved invoice registers. All invoice issue dates and all source
        statuses are included; figures use reported cumulative paid amounts.
      </p>
      <label>
        Comparison entity
        <select
          aria-label="Comparison entity"
          value={entityId}
          onChange={(e) => setParams({ entityId: e.target.value })}
        >
          {!entities.length && <option value="">No authorized entities</option>}
          {entities.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </label>
      {entities.some((e) => e.id === entityId) ? (
        <ChangesBody key={entityId} entityId={entityId} />
      ) : (
        <p role="alert">
          Select an authorized entity to compare its saved sources.
        </p>
      )}
    </>
  );
}
