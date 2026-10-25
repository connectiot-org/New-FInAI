import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { apiRequest, ApiError } from "../../lib/api";
import { expireSession, readSession, sessionEpoch } from "../../lib/session";
import { usdCents } from "../receivables/format";
import { useWorkspace } from "./context";
const previewSchema = z.strictObject({
  stageId: z.uuid(),
  entityId: z.uuid(),
  expectedVersion: z.number().int().min(0),
  nextVersion: z.number().int().min(1),
  digest: z.string().regex(/^[a-f0-9]{64}$/),
  sourceName: z.string(),
  sourceCapturedAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  rowCount: z.number().int().min(0).max(10000),
  invoiceCount: z.number().int().min(0).max(10000),
  customerCount: z.number().int().min(0).max(10000),
  totalCents: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
});
type Preview = z.infer<typeof previewSchema>;
const historySchema = z.object({
  items: z.array(
    z.object({
      version: z.number().int().positive(),
      sourceName: z.string(),
      sourceCapturedAt: z.iso.datetime(),
      importedAt: z.iso.datetime(),
      importingActorId: z.uuid(),
      digest: z.string().regex(/^[a-f0-9]{64}$/),
    }),
  ),
  total: z.number().int().min(0),
});
export function Imports() {
  const entities = useWorkspace().entities.filter((e) => e.canImport);
  const [entityId, setEntity] = useState(entities[0]?.id || ""),
    [history, setHistory] = useState<z.infer<typeof historySchema>>(),
    [preview, setPreview] = useState<Preview>(),
    [file, setFile] = useState<File>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [refresh, setRefresh] = useState(0);
  const controller = useRef<AbortController | null>(null),
    key = useRef(entityId);
  key.current = entityId;
  useEffect(() => {
    const c = new AbortController();
    controller.current?.abort();
    controller.current = c;
    setHistory(undefined);
    setPreview(undefined);
    setFile(undefined);
    setError("");
    setBusy(false);
    if (entityId)
      apiRequest(
        `/receivables/snapshots?${new URLSearchParams({ entityId, offset: "0", limit: "50" })}`,
        historySchema,
        { signal: c.signal },
      )
        .then((v) => {
          if (!c.signal.aborted) setHistory(v);
        })
        .catch((e: Error) => {
          if (!c.signal.aborted) setError(e.message);
        });
    return () => c.abort();
  }, [entityId, refresh]);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      if (!controller.current?.signal.aborted)
        setError(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }
  async function upload() {
    if (!file || !history) return;
    const scope = entityId,
      c = controller.current!,
      epoch = sessionEpoch();
    await run(async () => {
      if (file.size > 1048576)
        throw new Error(
          "Files must be at most 1 MiB; use the trusted CLI for larger imports.",
        );
      const s = await readSession(c.signal);
      const r = await fetch(
        `/api/v1/receivables/imports/preview?${new URLSearchParams({ entityId: scope, expectedVersion: String(history.items[0]?.version || 0) })}`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/octet-stream",
            "X-CSRF-Token": s.csrfToken,
          },
          body: file,
          signal: AbortSignal.any([c.signal, AbortSignal.timeout(20000)]),
        },
      );
      if (r.status === 401 && !c.signal.aborted) expireSession(epoch);
      const data: unknown = await r.json();
      if (!r.ok) {
        const v = z
          .object({
            message: z.string(),
            fieldErrors: z
              .array(z.object({ field: z.string(), message: z.string() }))
              .optional(),
          })
          .safeParse(data);
        throw new ApiError(
          v.success
            ? [
                v.data.message,
                ...(v.data.fieldErrors || []).map(
                  (x) => `${x.field}: ${x.message}`,
                ),
              ].join(" ")
            : "Preview failed.",
          r.status,
        );
      }
      const p = previewSchema.parse(data);
      if (p.entityId !== scope) throw new Error("Preview scope mismatch.");
      if (key.current === scope && !c.signal.aborted) setPreview(p);
    });
  }
  async function apply() {
    if (!preview) return;
    const p = preview,
      c = controller.current!,
      scope = entityId;
    await run(async () => {
      const result = await apiRequest(
        `/receivables/imports/${p.stageId}/apply`,
        z.strictObject({
          status: z.enum(["imported", "unchanged"]),
          version: z.number().int().positive(),
          rowCount: z.number().int().min(0),
        }),
        {
          method: "POST",
          body: { expectedVersion: p.expectedVersion, confirmDigest: p.digest },
          signal: c.signal,
        },
      );
      if (key.current === scope && !c.signal.aborted) {
        setRefresh((n) => n + 1);
        setNotice(
          `Snapshot version ${result.version} confirmed (${result.status}).`,
        );
      }
    });
  }
  async function discard() {
    if (!preview) return;
    const p = preview;
    await run(async () => {
      await apiRequest(
        `/receivables/imports/${p.stageId}`,
        z.strictObject({ status: z.literal("discarded") }),
        { method: "DELETE", body: {}, signal: controller.current!.signal },
      );
      setPreview(undefined);
    });
  }
  if (!entities.length)
    return (
      <section>
        <h1>Imports</h1>
        <p>No import grants are assigned to your account.</p>
      </section>
    );
  return (
    <section className="workspace-register">
      <h1>Reviewed receivables import</h1>
      <p>
        Complete normalized USD invoice register, JSON schemaVersion 1. This
        replaces the current source for the entity; earlier snapshots remain
        available. No trial balance or profit-and-loss report is inferred.
      </p>
      <label>
        Import entity
        <select
          aria-label="Import entity"
          value={entityId}
          disabled={busy}
          onChange={(e) => setEntity(e.target.value)}
        >
          {entities.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </label>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {!preview ? (
        <>
          <label>
            Register JSON file (maximum 1 MiB)
            <input
              key={`${entityId}:${refresh}`}
              type="file"
              accept=".json,application/json"
              disabled={busy}
              onChange={(e) => setFile(e.target.files?.[0])}
            />
          </label>
          <button
            disabled={busy || !file || !history}
            onClick={() => void upload()}
          >
            {busy ? "Preparing…" : "Preview import"}
          </button>
        </>
      ) : (
        <div className="panel">
          <h2>Review before applying</h2>
          <dl>
            <dt>Source</dt>
            <dd>{preview.sourceName}</dd>
            <dt>Source captured</dt>
            <dd>{preview.sourceCapturedAt}</dd>
            <dt>Snapshot version</dt>
            <dd>
              {preview.expectedVersion} → {preview.nextVersion}
            </dd>
            <dt>Rows / outstanding invoices / customers</dt>
            <dd>
              {preview.rowCount} / {preview.invoiceCount} /{" "}
              {preview.customerCount}
            </dd>
            <dt>Outstanding total</dt>
            <dd>{usdCents(preview.totalCents)}</dd>
            <dt>Expires</dt>
            <dd>{preview.expiresAt}</dd>
            <dt>Content digest</dt>
            <dd className="workspace-digest">{preview.digest}</dd>
          </dl>
          <p>
            Confirm only after reconciling the source and total. After an
            uncertain response, retry this same confirmation; do not upload a
            new file.
          </p>
          <button disabled={busy} onClick={() => void apply()}>
            Confirm and apply snapshot
          </button>
          <button disabled={busy} onClick={() => void discard()}>
            Discard preview
          </button>
        </div>
      )}
      <h2>Import history</h2>
      <p>
        Latest 50 snapshots. Older sources remain available in the receivables
        register. Capture time describes the source; import time is server time.
      </p>
      {history ? (
        <ul>
          {history.items.map((h) => (
            <li key={h.version}>
              Version {h.version}: {h.sourceName} · captured{" "}
              {h.sourceCapturedAt} · imported {h.importedAt} · actor{" "}
              {h.importingActorId} · digest {h.digest}
            </li>
          ))}
        </ul>
      ) : (
        <p>Loading history…</p>
      )}
    </section>
  );
}
