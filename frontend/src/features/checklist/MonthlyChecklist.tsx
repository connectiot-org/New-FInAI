import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Trash2 } from "lucide-react";
import { PageHeader } from "../../components/shared/Common";
import { Confirm, Field, useToast } from "../../components/ui";
import {
  checklistClient as client,
  checklistMode,
  sessionEnabled,
  previousMonth,
  monthPattern,
  ChecklistError,
  type ChecklistEntity,
  type ChecklistList,
  type ChecklistTask,
  type CreateTask,
} from "./api";
import "./checklist.css";

function ChecklistBody() {
  const [params, setParams] = useSearchParams();
  const [entities, setEntities] = useState<ChecklistEntity[]>([]);
  const [entityError, setEntityError] = useState("");
  const [entityLoading, setEntityLoading] = useState(true);
  const [entityReload, setEntityReload] = useState(0);
  const [data, setData] = useState<{ scope: string; list: ChecklistList }>();
  const [listError, setListError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [revision, setRevision] = useState(0);
  const [title, setTitle] = useState("");
  const [copying, setCopying] = useState(false);
  const [copyMessage, setCopyMessage] = useState<{
    scope: string;
    message: string;
  }>();
  const [deleting, setDeleting] = useState<ChecklistTask>();
  const retryCreate = useRef<CreateTask | undefined>(undefined);
  const inFlight = useRef(false);
  const toast = useToast();
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const month = monthPattern.test(params.get("month") || "")
    ? params.get("month")!
    : defaultMonth;
  const entityId =
    entities.find((e) => e.id === params.get("entity"))?.id ||
    entities[0]?.id ||
    "";
  const scope = `${entityId}:${month}`;
  const activeScope = useRef(scope);
  activeScope.current = scope;
  const visible = data?.scope === scope ? data.list : undefined;

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setEntityLoading(true);
    setEntityError("");
    client
      .entities(controller.signal)
      .then((items) => {
        if (active) setEntities(items);
      })
      .catch((error) => {
        if (active)
          setEntityError(
            error instanceof Error
              ? error.message
              : "Cannot load checklist entities.",
          );
      })
      .finally(() => {
        if (active) setEntityLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [entityReload]);
  useEffect(() => {
    if (!entityId) return;
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setListError("");
    client
      .list(entityId, month, controller.signal)
      .then((list) => {
        if (active) setData({ scope, list });
      })
      .catch((error) => {
        if (active) {
          setData(undefined);
          setListError(
            error instanceof Error
              ? error.message
              : "Cannot load checklist tasks.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [entityId, month, scope, revision]);

  function select(nextEntity: string, nextMonth: string) {
    if (inFlight.current) return;
    setParams({ entity: nextEntity, month: nextMonth });
    setTitle("");
    setSaveError("");
    setDeleting(undefined);
    setCopying(false);
    setCopyMessage(undefined);
    // Keep an ambiguous creation bound to its original scope; never reuse it in a new month.
  }
  async function write(
    action: () => Promise<unknown>,
    success: string,
    isCreate = false,
  ) {
    if (inFlight.current) return;
    const startedScope = scope;
    inFlight.current = true;
    setPending(true);
    setSaveError("");
    try {
      await action();
      if (isCreate) retryCreate.current = undefined;
      if (activeScope.current === startedScope) {
        if (isCreate) setTitle("");
        toast(success);
        setData(undefined);
        setRevision((v) => v + 1);
      }
    } catch (error) {
      if (
        isCreate &&
        error instanceof ChecklistError &&
        error.status >= 400 &&
        error.status < 500
      )
        retryCreate.current = undefined;
      if (activeScope.current !== startedScope) return;
      const message =
        error instanceof Error ? error.message : "The task could not be saved.";
      if (error instanceof ChecklistError && error.status === 409) {
        setSaveError(
          `${message} The checklist has been reloaded; review it before trying again.`,
        );
        setData(undefined);
        setRevision((v) => v + 1);
      } else {
        setSaveError(message);
      }
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }
  async function copy() {
    if (inFlight.current) return;
    const startedScope = scope;
    inFlight.current = true;
    setPending(true);
    setCopying(false);
    setSaveError("");
    setCopyMessage(undefined);
    try {
      const result = await client.copyPreviousMonth(entityId, month);
      if (activeScope.current !== startedScope) return;
      setCopyMessage({
        scope: startedScope,
        message: result.copiedCount
          ? `Copied ${result.copiedCount} tasks from ${result.sourceMonth} to ${result.destinationMonth}.`
          : `No tasks in ${result.sourceMonth}. Nothing was copied.`,
      });
    } catch (error) {
      if (activeScope.current !== startedScope) return;
      setSaveError(
        `${error instanceof Error ? error.message : "Copy could not be confirmed."} Reloading the destination before any retry. Review the checklist first.`,
      );
    } finally {
      if (activeScope.current === startedScope) {
        setData(undefined);
        setRevision((v) => v + 1);
      }
      inFlight.current = false;
      setPending(false);
    }
  }
  function add() {
    const canonicalTitle = title.trim();
    if (
      !canonicalTitle ||
      Array.from(canonicalTitle).length > 200 ||
      Array.from(canonicalTitle).some(
        (c) => c.codePointAt(0)! < 32 || c.codePointAt(0) === 127,
      )
    ) {
      setSaveError(
        "Use a task title of 1–200 characters without control characters.",
      );
      return;
    }
    const previous = retryCreate.current;
    if (
      previous &&
      (previous.entityId !== entityId ||
        previous.month !== month ||
        previous.title !== canonicalTitle)
    ) {
      setSaveError(
        "A previous add may have reached the backend. Return to its entity/month and retry the original title to resolve it before adding another task.",
      );
      return;
    }
    const input = previous || {
      id: crypto.randomUUID(),
      entityId,
      month,
      title: canonicalTitle,
    };
    retryCreate.current = input;
    void write(() => client.create(input), "Task saved", true);
  }
  const disabled =
    pending ||
    loading ||
    !visible ||
    !!listError ||
    entityLoading ||
    !!entityError;
  return (
    <>
      <PageHeader
        title="Monthly checklist"
        description="Your tasks for one entity and month. Completion is separate from close approval."
        action={
          <span className="tag">
            {checklistMode === "demo"
              ? "Demo checklist"
              : sessionEnabled
                ? "Connected backend"
                : "Local backend"}
          </span>
        }
      />
      <p className="notice">
        {checklistMode === "demo"
          ? "Session-only checklist demo. Tasks clear on page refresh."
          : "Tasks are saved to the connected backend. Demo workspace controls and persona changes do not change checklist access."}
      </p>
      {entityError && (
        <div role="alert" className="notice error">
          {entityError}{" "}
          <button onClick={() => setEntityReload((v) => v + 1)}>
            Retry entities
          </button>
        </div>
      )}
      <div className="checklist-filters panel">
        <Field label="Checklist entity">
          <select
            value={entityId}
            disabled={entityLoading || pending || !!entityError}
            onChange={(e) => select(e.target.value, month)}
          >
            {!entities.length && (
              <option value="">
                {entityLoading ? "Loading entities…" : "No authorized entities"}
              </option>
            )}
            {entities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Checklist month">
          <input
            type="month"
            min="0001-01"
            max="9999-12"
            value={month}
            disabled={pending}
            onChange={(e) => {
              if (monthPattern.test(e.target.value))
                select(entityId, e.target.value);
            }}
          />
        </Field>
      </div>
      <button
        type="button"
        disabled={disabled || !!visible?.items.length || month === "0001-01"}
        onClick={() => setCopying(true)}
      >
        {pending ? "Copying…" : "Copy last month’s tasks"}
      </button>
      {copyMessage?.scope === scope && (
        <p role="status" className="notice">
          {copyMessage.message}
        </p>
      )}
      <Confirm
        open={copying}
        title="Copy last month’s tasks"
        description={`Copy titles from ${previousMonth(month)} into ${month}? New tasks start incomplete. The destination must be empty.`}
        label="Copy tasks"
        onConfirm={() => void copy()}
        onOpenChange={setCopying}
      />
      {entityLoading && <p role="status">Loading checklist entities…</p>}
      {!entityLoading && !entityError && !entities.length && (
        <p className="notice">
          No checklist entities are available for this identity.
        </p>
      )}
      {loading && <p role="status">Loading checklist…</p>}
      {listError && (
        <div role="alert" className="notice error">
          {listError}{" "}
          <button onClick={() => setRevision((v) => v + 1)}>
            Reload checklist
          </button>
        </div>
      )}
      {saveError && (
        <div role="alert" className="notice error">
          {saveError}{" "}
          <button
            disabled={pending || loading}
            onClick={() => setRevision((v) => v + 1)}
          >
            Reload checklist
          </button>
        </div>
      )}
      <section
        className="panel checklist-panel"
        aria-label="Monthly tasks"
        aria-busy={loading || pending}
      >
        <div className="checklist-summary" aria-live="polite">
          <strong>
            {visible
              ? `${visible.summary.completed}/${visible.summary.total} completed`
              : "Checklist progress"}
          </strong>
          <span>{visible ? `${visible.summary.percent}%` : "—"}</span>
        </div>
        <div
          className="progress-track"
          role="progressbar"
          aria-label="Checklist completion"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={visible?.summary.percent || 0}
        >
          <div style={{ width: `${visible?.summary.percent || 0}%` }} />
        </div>
        <form
          className="checklist-add"
          onSubmit={(e) => {
            e.preventDefault();
            if (!disabled) add();
          }}
        >
          <Field label="Task title">
            <input
              value={title}
              maxLength={400}
              disabled={pending || !entityId}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs doing?"
            />
          </Field>
          <button
            className="primary"
            type="submit"
            disabled={
              disabled ||
              !title.trim() ||
              ((visible?.summary.total || 0) >= 200 && !retryCreate.current)
            }
          >
            {pending ? "Saving…" : "Add task"}
          </button>
        </form>
        {visible?.summary.total === 200 && (
          <p className="notice">
            This entity and month has reached the 200-task limit.
          </p>
        )}
        {!loading && !listError && visible?.items.length === 0 && (
          <p className="empty">Add your first monthly task.</p>
        )}
        <ul className="checklist-tasks">
          {visible?.items.map((task) => (
            <li key={task.id}>
              <label>
                <input
                  type="checkbox"
                  checked={task.completed}
                  disabled={disabled}
                  onChange={(e) => {
                    const completed = e.target.checked;
                    void write(
                      () => client.complete(task.id, completed, task.version),
                      "Task saved",
                    );
                  }}
                />
                <span className={task.completed ? "checklist-done" : ""}>
                  {task.title}
                </span>
              </label>
              <button
                className="icon-btn"
                aria-label={`Delete ${task.title}`}
                disabled={disabled}
                onClick={() => setDeleting(task)}
              >
                <Trash2 size={17} />
              </button>
            </li>
          ))}
        </ul>
      </section>
      <Confirm
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open) setDeleting(undefined);
        }}
        title="Delete checklist task?"
        description={`Remove “${deleting?.title || "this task"}” from this monthly checklist?`}
        label="Delete task"
        onConfirm={() => {
          const task = deleting;
          if (task && !disabled)
            void write(
              () => client.remove(task.id, task.version),
              "Task deleted",
            );
        }}
      />
    </>
  );
}

export function MonthlyChecklist() {
  const [authenticated, setAuthenticated] = useState(!sessionEnabled);
  const [checking, setChecking] = useState(sessionEnabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!sessionEnabled) return;
    let active = true;
    fetch("/auth/session", {
      credentials: "same-origin",
      signal: AbortSignal.timeout(10000),
    })
      .then((r) => {
        if (active) setAuthenticated(r.ok);
      })
      .catch(() => {
        if (active) setError("Cannot reach sign-in service.");
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, []);
  if (checking) return <p role="status">Checking session…</p>;
  if (!authenticated)
    return (
      <section className="panel">
        <h1>Sign in to your checklist</h1>
        <p>Accounts are provided by your administrator.</p>
        {error && <p role="alert">{error}</p>}
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy) return;
            const form = event.currentTarget;
            const fields = new FormData(form);
            setBusy(true);
            setError("");
            try {
              const r = await fetch("/auth/login", {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  username: fields.get("username"),
                  password: fields.get("password"),
                  organisationId: fields.get("organisationId"),
                }),
                signal: AbortSignal.timeout(10000),
              });
              if (!r.ok)
                throw new Error(
                  "Sign-in failed. Check your details or try again later.",
                );
              form.reset();
              setAuthenticated(true);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Sign-in failed.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="Account name">
            <input
              name="username"
              autoComplete="username"
              required
              maxLength={100}
            />
          </Field>
          <Field label="Organisation ID">
            <input name="organisationId" required autoComplete="off" />
          </Field>
          <Field label="Password">
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={1024}
            />
          </Field>
          <button className="primary" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </section>
    );
  return (
    <>
      {sessionEnabled && (
        <>
          <button
            disabled={busy}
            onClick={async () => {
              if (busy) return;
              setBusy(true);
              setError("");
              try {
                const r = await fetch("/auth/session", {
                  credentials: "same-origin",
                });
                if (r.ok) {
                  const session = await r.json();
                  const result = await fetch("/auth/logout", {
                    method: "POST",
                    credentials: "same-origin",
                    headers: {
                      "Content-Type": "application/json",
                      "X-CSRF-Token": session.csrfToken,
                    },
                    body: "{}",
                    signal: AbortSignal.timeout(10000),
                  });
                  if (!result.ok)
                    throw new Error("Sign out failed. Try again.");
                }
                setAuthenticated(false);
              } catch (e) {
                setError(e instanceof Error ? e.message : "Sign out failed.");
              } finally {
                setBusy(false);
              }
            }}
          >
            Sign out
          </button>
          {error && <p role="alert">{error}</p>}
        </>
      )}
      <ChecklistBody />
    </>
  );
}
