import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "../../components/shared/Common";
import { Modal, Confirm, Field, Empty, useToast } from "../../components/ui";
import { SessionGate } from "../../components/SessionGate";
import { ApiError } from "../../lib/api";
import {
  subscriptionApi as api,
  type Renewal,
  type RenewalPage,
  type Details,
} from "./api";
import "./subscriptions.css";
const blank = {
  supplierName: "",
  subscriptionName: "",
  renewalDate: "",
  cancellationDeadline: "",
  notes: "",
};
function RenewalsBody() {
  const [params, setParams] = useSearchParams();
  const [entities, setEntities] = useState<{ id: string; name: string }[]>([]),
    [entityError, setEntityError] = useState(""),
    [entityLoading, setEntityLoading] = useState(true),
    [entityRetry, setEntityRetry] = useState(0);
  const entityId =
    entities.find((v) => v.id === params.get("entity"))?.id ||
    entities[0]?.id ||
    "";
  const search = params.get("search") || "",
    status = ["active", "archived", "all"].includes(params.get("status") || "")
      ? params.get("status")!
      : "active",
    rawOffset = Number(params.get("offset") || 0),
    offset =
      Number.isInteger(rawOffset) && rawOffset >= 0 && rawOffset <= 1000000
        ? rawOffset
        : 0;
  const key = JSON.stringify([entityId, search, status, offset]),
    activeKey = useRef(key);
  activeKey.current = key;
  const [searchText, setSearchText] = useState(search),
    [data, setData] = useState<{ key: string; page: RenewalPage }>(),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [saveError, setSaveError] = useState(""),
    [reload, setReload] = useState(0),
    [pending, setPending] = useState(false);
  const [editor, setEditor] = useState<{
      key: string;
      id: string;
      row?: Renewal;
    }>(),
    [fields, setFields] = useState(blank),
    [archive, setArchive] = useState<Renewal>(),
    [conflict, setConflict] = useState(false);
  const writing = useRef(false),
    toast = useToast();
  const page = data?.key === key ? data.page : undefined;
  useEffect(() => {
    const c = new AbortController();
    let active = true;
    setEntityLoading(true);
    setEntityError("");
    api
      .entities(c.signal)
      .then((v) => {
        if (active) setEntities(v.items);
      })
      .catch((e) => {
        if (active)
          setEntityError(
            e instanceof Error ? e.message : "Cannot load entities.",
          );
      })
      .finally(() => {
        if (active) setEntityLoading(false);
      });
    return () => {
      active = false;
      c.abort();
    };
  }, [entityRetry]);
  useEffect(() => {
    if (!entityId) return;
    const c = new AbortController();
    let active = true;
    setLoading(true);
    setError("");
    api
      .list(entityId, search, status, offset, c.signal)
      .then((v) => {
        if (active) setData({ key, page: v });
      })
      .catch((e) => {
        if (active) {
          setData(undefined);
          setError(
            e instanceof Error ? e.message : "Cannot load subscriptions.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      c.abort();
    };
  }, [entityId, search, status, offset, key, reload]);
  function select(values: Record<string, string>) {
    if (writing.current) return;
    setParams({ entity: entityId, search, status, offset: "0", ...values });
    setEditor(undefined);
    setArchive(undefined);
    setSaveError("");
  }
  function edit(row?: Renewal) {
    setFields(
      row
        ? {
            supplierName: row.supplierName,
            subscriptionName: row.subscriptionName,
            renewalDate: row.renewalDate,
            cancellationDeadline: row.cancellationDeadline || "",
            notes: row.notes || "",
          }
        : blank,
    );
    setEditor({ key, id: row?.id || crypto.randomUUID(), row });
    setSaveError("");
    setConflict(false);
  }
  async function write(action: () => Promise<Renewal>, message: string) {
    if (writing.current) return;
    const started = key;
    writing.current = true;
    setPending(true);
    setSaveError("");
    try {
      await action();
      if (activeKey.current !== started) return;
      toast(message);
      setEditor(undefined);
      setArchive(undefined);
      setData(undefined);
      setReload((v) => v + 1);
    } catch (e) {
      if (activeKey.current !== started) return;
      const stale = e instanceof ApiError && e.status === 409;
      setConflict(stale);
      setSaveError(
        stale
          ? "Record changed. Close this drawer, reload and review the current record before saving again."
          : `${e instanceof Error ? e.message : "Save failed."} No success was confirmed.`,
      );
      setData(undefined);
      setReload((v) => v + 1);
    } finally {
      writing.current = false;
      setPending(false);
    }
  }
  function save() {
    if (!editor || editor.key !== key) return;
    const body: Details = {
      supplierName: fields.supplierName.trim(),
      subscriptionName: fields.subscriptionName.trim(),
      renewalDate: fields.renewalDate,
      cancellationDeadline: fields.cancellationDeadline || null,
      notes: fields.notes || null,
    };
    const validDate = (v: string) =>
      /^\d{4}-\d{2}-\d{2}$/.test(v) &&
      !v.startsWith("0000") &&
      Number.isFinite(new Date(v + "T00:00:00Z").getTime()) &&
      new Date(v + "T00:00:00Z").toISOString().slice(0, 10) === v;
    if (
      [body.supplierName, body.subscriptionName].some(
        (v) => !v || Array.from(v).length > 200,
      ) ||
      Array.from(body.notes || "").length > 2000 ||
      !validDate(body.renewalDate) ||
      (body.cancellationDeadline &&
        (!validDate(body.cancellationDeadline) ||
          body.cancellationDeadline > body.renewalDate))
    ) {
      setSaveError(
        "Check names (1–200 characters), valid calendar dates, cancellation deadline no later than renewal, and notes (2,000 characters maximum).",
      );
      return;
    }
    void write(
      () =>
        editor.row
          ? api.update(editor.row, body)
          : api.create(editor.id, entityId, body),
      "Subscription saved",
    );
  }
  const disabled =
    pending || loading || !page || !!error || entityLoading || !!entityError;
  return (
    <>
      <PageHeader
        title="Subscription renewals"
        description="Manually track renewal dates and cancellation deadlines."
        action={
          <button
            className="primary"
            disabled={disabled || !entityId}
            onClick={() => edit()}
          >
            Add subscription
          </button>
        }
      />
      <p className="notice">
        Saved backend records. Dates indicate deadlines only; they do not
        confirm renewal, cancellation or payment.
      </p>
      <div className="panel subscription-filters">
        <Field label="Subscription entity">
          <select
            aria-label="Subscription entity"
            value={entityId}
            disabled={pending || entityLoading || !!entityError}
            onChange={(e) => select({ entity: e.target.value })}
          >
            {!entities.length && (
              <option value="">
                {entityLoading ? "Loading entities…" : "No authorized entities"}
              </option>
            )}
            {entities.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </Field>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            select({ search: searchText });
          }}
        >
          <Field label="Search subscriptions">
            <input
              value={searchText}
              maxLength={200}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Supplier or subscription"
              disabled={pending}
            />
          </Field>
          <button disabled={pending}>Search</button>
        </form>
        <Field label="Subscription status">
          <select
            aria-label="Subscription status"
            value={status}
            disabled={pending}
            onChange={(e) => select({ status: e.target.value })}
          >
            <option value="active">Active</option>
            <option value="archived">Archived</option>
            <option value="all">All</option>
          </select>
        </Field>
      </div>
      {entityError && (
        <p className="notice error" role="alert">
          {entityError}{" "}
          <button onClick={() => setEntityRetry((v) => v + 1)}>
            Retry entities
          </button>
        </p>
      )}
      {!entityLoading && !entityError && !entities.length && (
        <p className="notice">
          No subscription entities are available for this identity.
        </p>
      )}
      {(loading || entityLoading) && (
        <p role="status">Loading subscriptions…</p>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}{" "}
          <button onClick={() => setReload((v) => v + 1)}>
            Reload subscriptions
          </button>
        </p>
      )}
      {saveError && editor?.key !== key && (
        <p className="notice error" role="alert">
          {saveError}
        </p>
      )}
      {page && !loading && !error && (
        <section className="panel" aria-label="Subscription records">
          <p className="muted">
            Today: {page.today} · {page.timezone} · {page.total} records
          </p>
          {!page.items.length ? (
            <Empty
              title="No subscriptions found"
              description="Add a subscription or change the search and status filter."
            />
          ) : (
            <div className="subscription-table">
              <table>
                <thead>
                  <tr>
                    <th>Supplier / subscription</th>
                    <th>Renewal date</th>
                    <th>Cancellation deadline</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {page.items.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <strong>{row.supplierName}</strong>
                        <br />
                        {row.subscriptionName}
                      </td>
                      <td>
                        {row.renewalDate}
                        {row.renewalIndicator && (
                          <small className="subscription-indicator">
                            {row.renewalIndicator}
                          </small>
                        )}
                      </td>
                      <td>
                        {row.cancellationDeadline || "—"}
                        {row.cancellationIndicator && (
                          <small className="subscription-indicator">
                            {row.cancellationIndicator}
                          </small>
                        )}
                      </td>
                      <td>{row.archived ? "Archived" : "Active"}</td>
                      <td>
                        <button
                          disabled={pending}
                          onClick={() => edit(row)}
                          aria-label={`Edit ${row.subscriptionName}`}
                        >
                          Edit
                        </button>
                        <button
                          disabled={pending}
                          onClick={() => {
                            setArchive(row);
                            setSaveError("");
                          }}
                          aria-label={`${row.archived ? "Unarchive" : "Archive"} ${row.subscriptionName}`}
                        >
                          {row.archived ? "Unarchive" : "Archive"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="subscription-pagination">
            <button
              disabled={pending || offset === 0}
              onClick={() =>
                select({ offset: String(Math.max(0, offset - 20)) })
              }
            >
              Previous page
            </button>
            <span>
              {page.total
                ? `${offset + 1}–${offset + page.items.length} of ${page.total}`
                : "0 records"}
            </span>
            <button
              disabled={pending || page.nextOffset === null}
              onClick={() => select({ offset: String(page.nextOffset) })}
            >
              Next page
            </button>
          </div>
        </section>
      )}
      <Confirm
        open={!!archive}
        onOpenChange={(v) => {
          if (!pending && !v) setArchive(undefined);
        }}
        title={
          archive?.archived ? "Unarchive subscription" : "Archive subscription"
        }
        description={`${archive?.subscriptionName || "This subscription"} will be ${archive?.archived ? "active again" : "hidden from the active list"}. Its stored dates will not change.`}
        label={archive?.archived ? "Unarchive" : "Archive"}
        onConfirm={() => {
          if (archive)
            void write(
              () => api.archive(archive),
              archive.archived
                ? "Subscription unarchived"
                : "Subscription archived",
            );
        }}
      />
      <Modal
        drawer
        open={editor?.key === key}
        title={editor?.row ? "Edit subscription" : "Add subscription"}
        onOpenChange={(v) => {
          if (!pending && !v) {
            setEditor(undefined);
            setSaveError("");
          }
        }}
      >
        <form
          className="subscription-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!pending && !conflict) save();
          }}
        >
          {saveError && (
            <p className="notice error" role="alert">
              {saveError}
            </p>
          )}
          <Field label="Supplier name">
            <input
              required
              value={fields.supplierName}
              maxLength={400}
              disabled={pending}
              onChange={(e) =>
                setFields({ ...fields, supplierName: e.target.value })
              }
            />
          </Field>
          <Field label="Subscription name">
            <input
              required
              value={fields.subscriptionName}
              maxLength={400}
              disabled={pending}
              onChange={(e) =>
                setFields({ ...fields, subscriptionName: e.target.value })
              }
            />
          </Field>
          <Field label="Renewal date">
            <input
              required
              type="date"
              min="0001-01-01"
              max="9999-12-31"
              value={fields.renewalDate}
              disabled={pending}
              onChange={(e) =>
                setFields({ ...fields, renewalDate: e.target.value })
              }
            />
          </Field>
          <Field label="Cancellation deadline (optional)">
            <input
              type="date"
              min="0001-01-01"
              max={fields.renewalDate || "9999-12-31"}
              value={fields.cancellationDeadline}
              disabled={pending}
              onChange={(e) =>
                setFields({ ...fields, cancellationDeadline: e.target.value })
              }
            />
          </Field>
          <Field label="Notes (optional)">
            <textarea
              aria-label="Notes (optional)"
              rows={4}
              maxLength={4000}
              value={fields.notes}
              disabled={pending}
              onChange={(e) => setFields({ ...fields, notes: e.target.value })}
            />
          </Field>
          <div className="dialog-actions">
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setEditor(undefined);
                setSaveError("");
              }}
            >
              Cancel
            </button>
            <button className="primary" disabled={pending || conflict}>
              {pending ? "Saving…" : "Save subscription"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
export function SubscriptionRenewals() {
  return (
    <SessionGate title="Sign in to FinAI">
      <RenewalsBody />
    </SessionGate>
  );
}
