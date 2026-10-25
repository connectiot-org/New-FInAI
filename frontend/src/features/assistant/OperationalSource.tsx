import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { z } from "zod";
import { apiRequest } from "../../lib/api";
import { useWorkspace } from "../workspace/context";
const task = z.strictObject({
    id: z.uuid(),
    title: z.string(),
    completed: z.boolean(),
    version: z.number().int().positive(),
  }),
  subscription = z.strictObject({
    id: z.uuid(),
    supplierName: z.string(),
    subscriptionName: z.string(),
    renewalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    cancellationDeadline: z.string().nullable(),
    version: z.number().int().positive(),
  });
const schema = z.strictObject({
  entityId: z.uuid(),
  month: z.string(),
  kind: z.enum(["checklist", "subscriptions"]),
  retrievedAt: z.iso.datetime(),
  basis: z.string(),
  offset: z.number().int().nonnegative(),
  limit: z.number().int().min(1).max(50),
  total: z.number().int().nonnegative(),
  nextOffset: z.number().int().nullable(),
  items: z.array(z.union([task, subscription])).max(50),
});
export function OperationalSource() {
  const ctx = useWorkspace(),
    [params, setParams] = useSearchParams(),
    [state, setState] = useState<{
      key: string;
      data?: z.infer<typeof schema>;
      error?: string;
    }>(),
    entityId = params.get("entityId") || "",
    month = params.get("month") || "",
    kind = params.get("kind") || "",
    offset = Number(params.get("offset") || 0),
    key = params.toString(),
    current = state?.key === key ? state : undefined;
  useEffect(() => {
    const c = new AbortController();
    if (
      !ctx.entities.some((e) => e.id === entityId) ||
      !["checklist", "subscriptions"].includes(kind) ||
      !/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(month) ||
      !Number.isInteger(offset) ||
      offset < 0 ||
      offset > 10000
    ) {
      setState({ key, error: "Choose an authorized explicit source scope." });
      return;
    }
    apiRequest(
      `/assistant/source?${new URLSearchParams({ entityId, month, kind, offset: String(offset), limit: "20" })}`,
      schema,
      { signal: c.signal },
    )
      .then((data) => {
        if (c.signal.aborted) return;
        if (
          data.entityId !== entityId ||
          data.month !== month ||
          data.kind !== kind ||
          data.offset !== offset ||
          data.limit !== 20 ||
          data.items.some((r) =>
            kind === "checklist" ? !("title" in r) : !("renewalDate" in r),
          )
        )
          throw new Error("Operational source scope mismatch.");
        setState({ key, data });
      })
      .catch((e: Error) => {
        if (!c.signal.aborted) setState({ key, error: e.message });
      });
    return () => c.abort();
  }, [ctx.entities, entityId, month, kind, offset, key]);
  const data = current?.data;
  return (
    <section className="workspace-register">
      <h1>
        {kind === "checklist"
          ? "Incomplete checklist source"
          : "Saved subscription source"}
      </h1>
      <p>
        {ctx.entities.find((e) => e.id === entityId)?.name} · {month} · current
        authorized records
      </p>
      {current?.error ? (
        <p role="alert">{current.error}</p>
      ) : !data ? (
        <p role="status">Loading scoped source…</p>
      ) : (
        <>
          <p>{data.basis}</p>
          <p>
            Retrieved {data.retrievedAt} · showing {data.items.length} of{" "}
            {data.total} records · offset {data.offset}
          </p>
          {!data.items.length && (
            <p>No current records match this exact scope.</p>
          )}
          <ul>
            {data.items.map((r) => (
              <li key={r.id}>
                {"title" in r ? (
                  <>
                    <strong>{r.title}</strong> · incomplete
                  </>
                ) : (
                  <>
                    <strong>
                      {r.supplierName} · {r.subscriptionName}
                    </strong>{" "}
                    · renewal {r.renewalDate} · cancellation deadline{" "}
                    {r.cancellationDeadline || "Not supplied"}
                  </>
                )}{" "}
                · source ID {r.id} · version {r.version}
              </li>
            ))}
          </ul>
          <button
            disabled={offset === 0}
            onClick={() => {
              const q = new URLSearchParams(params);
              q.set("offset", String(Math.max(0, offset - 20)));
              setParams(q);
            }}
          >
            Previous source records
          </button>
          <button
            disabled={data.nextOffset === null}
            onClick={() => {
              const q = new URLSearchParams(params);
              q.set("offset", String(data.nextOffset));
              setParams(q);
            }}
          >
            More source records
          </button>
        </>
      )}
    </section>
  );
}
