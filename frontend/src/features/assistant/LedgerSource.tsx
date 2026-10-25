import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { z } from "zod";
import { apiRequest } from "../../lib/api";
import { useWorkspace } from "../workspace/context";
const minor = z.string().regex(/^-?\d{1,16}$/),
  account = z.object({
    id: z.string(),
    name: z.string(),
    classification: z.string(),
    normal: z.string(),
    openingDebit: minor,
    openingCredit: minor,
    closing: minor.optional(),
    movement: minor.optional(),
  }),
  source = z.object({
    snapshotId: z.uuid(),
    version: z.number().int(),
    sourceName: z.string(),
    capturedAt: z.iso.datetime(),
    importedAt: z.iso.datetime(),
    actorId: z.uuid(),
    digest: z.string(),
    mappingId: z.string(),
    mappingDigest: z.string(),
    periodStart: z.string(),
    periodEnd: z.string(),
  });
const schema = z.discriminatedUnion("dataState", [
  z.object({
    dataState: z.literal("no_snapshot"),
    entityId: z.uuid(),
    month: z.string(),
  }),
  z.object({
    dataState: z.literal("ready"),
    entityId: z.uuid(),
    month: z.string(),
    currency: z.string(),
    precision: z.number().int(),
    mappingVerified: z.boolean(),
    source,
    basis: z.string(),
    metrics: z.record(z.string(), minor).nullable(),
    accounts: z.array(account).max(500),
    offset: z.number().int(),
    limit: z.number().int(),
    total: z.number().int(),
    nextOffset: z.number().int().nullable(),
    journals: z
      .array(
        z.object({
          id: z.string(),
          date: z.string(),
          status: z.literal("Posted"),
          lines: z
            .array(
              z.object({
                id: z.string(),
                accountId: z.string(),
                debit: minor,
                credit: minor,
              }),
            )
            .max(1000),
        }),
      )
      .max(100),
  }),
]);
export function LedgerSource() {
  const ctx = useWorkspace(),
    [params, setParams] = useSearchParams(),
    entityId = params.get("entityId") || ctx.entities[0]?.id || "",
    month = params.get("month") || new Date().toISOString().slice(0, 7),
    snapshotId = params.get("snapshotId") || "",
    offset = params.get("offset") || "0",
    [result, setResult] = useState<{
      key: string;
      value?: z.infer<typeof schema>;
      error?: string;
    }>(),
    [refresh, setRefresh] = useState(0);
  const key = JSON.stringify([entityId, month, snapshotId, offset, refresh]);
  const current = result?.key === key ? result : undefined;
  useEffect(() => {
    const c = new AbortController();
    if (!ctx.entities.some((e) => e.id === entityId)) {
      setResult({ key, error: "Choose an authorized entity." });
      return;
    }
    const q = new URLSearchParams({
      entityId,
      month,
      offset,
      limit: "20",
      ...(snapshotId ? { snapshotId } : {}),
    });
    apiRequest(`/ledger?${q}`, schema, { signal: c.signal })
      .then((value) => {
        if (c.signal.aborted) return;
        if (
          value.entityId !== entityId ||
          value.month !== month ||
          (snapshotId &&
            value.dataState === "ready" &&
            value.source.snapshotId !== snapshotId)
        )
          throw new Error("Ledger source scope mismatch.");
        setResult({ key, value });
        if (!snapshotId && value.dataState === "ready") {
          q.set("snapshotId", value.source.snapshotId);
          q.delete("limit");
          setParams(q, { replace: true });
        }
      })
      .catch((e: Error) => {
        if (!c.signal.aborted) setResult({ key, error: e.message });
      });
    return () => c.abort();
  }, [entityId, month, snapshotId, offset, key, ctx.entities, setParams]);
  const v = current?.value;
  return (
    <section className="workspace-register">
      <h1>Imported ledger source</h1>
      <p>
        Read-only external books. No posting, payments, FX or cash-flow
        statements. Amount columns are exact source minor units with the
        displayed currency precision.
      </p>
      <div className="register-filters">
        <label>
          Ledger entity
          <select
            aria-label="Ledger entity"
            value={entityId}
            onChange={(e) => setParams({ entityId: e.target.value, month })}
          >
            {ctx.entities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Ledger month
          <input
            type="month"
            value={month}
            onChange={(e) =>
              setParams({
                entityId,
                month: e.target.value,
                ...(snapshotId ? { snapshotId } : {}),
              })
            }
          />
        </label>
        <button onClick={() => setParams({ entityId, month })}>
          Use latest ledger source
        </button>
        <button onClick={() => setRefresh((n) => n + 1)}>Refresh source</button>
      </div>
      {current?.error ? (
        <p role="alert">{current.error}</p>
      ) : !v ? (
        <p role="status">Loading imported ledger…</p>
      ) : v.dataState === "no_snapshot" ? (
        <p>
          No complete ledger source has been imported. A missing source is not a
          zero balance.
        </p>
      ) : (
        <>
          <h2>
            {v.source.sourceName} · version {v.source.version}
          </h2>
          <p>
            {v.currency} · precision {v.precision} · snapshot{" "}
            {v.source.snapshotId}
          </p>
          <p>
            Captured {v.source.capturedAt} · imported {v.source.importedAt} ·
            coverage {v.source.periodStart} through {v.source.periodEnd}
          </p>
          <p>{v.basis}</p>
          <p>
            Mapping {v.source.mappingId}@{v.source.mappingDigest} · actor{" "}
            {v.source.actorId} · content digest {v.source.digest}
          </p>
          {v.mappingVerified ? (
            <>
              <h2>Verified mapping calculations</h2>
              <dl>
                {Object.entries(v.metrics || {}).map(([k, n]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>
                      {n} {v.currency} minor units
                    </dd>
                  </div>
                ))}
              </dl>
            </>
          ) : (
            <p role="status">
              Mapping is not approved in server configuration. These are
              imported source records; no production financial statement is
              asserted.
            </p>
          )}
          <h2>Source accounts</h2>
          <div className="register-scroll">
            <table>
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Class / normal</th>
                  <th>Opening debit</th>
                  <th>Opening credit</th>
                  {v.mappingVerified && (
                    <>
                      <th>Closing (normal sign)</th>
                      <th>Period movement</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {v.accounts.map((a) => (
                  <tr key={a.id}>
                    <td>
                      {a.name} [{a.id}]
                    </td>
                    <td>
                      {a.classification} / {a.normal}
                    </td>
                    <td>{a.openingDebit}</td>
                    <td>{a.openingCredit}</td>
                    {v.mappingVerified && (
                      <>
                        <td>{a.closing}</td>
                        <td>{a.movement}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h2>Posted source journals through selected month</h2>
          <p>
            Showing {v.journals.length} of {v.total} posted source journals,
            offset {v.offset}. Drafts excluded.
          </p>
          {v.journals.map((j) => (
            <details key={j.id}>
              <summary>
                {j.id} · {j.date}
              </summary>
              <ul>
                {j.lines.map((l) => (
                  <li key={l.id}>
                    {l.id} · {l.accountId}: debit {l.debit}, credit {l.credit}
                  </li>
                ))}
              </ul>
            </details>
          ))}
          <button
            disabled={v.offset === 0}
            onClick={() =>
              setParams({
                entityId,
                month,
                snapshotId,
                offset: String(Math.max(0, v.offset - 20)),
              })
            }
          >
            Previous journals
          </button>
          <button
            disabled={v.nextOffset === null}
            onClick={() =>
              setParams({
                entityId,
                month,
                snapshotId,
                offset: String(v.nextOffset),
              })
            }
          >
            More journals
          </button>
        </>
      )}
    </section>
  );
}
