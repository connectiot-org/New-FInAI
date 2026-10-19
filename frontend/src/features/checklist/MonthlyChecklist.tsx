import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Trash2 } from "lucide-react";
import { PageHeader } from "../../components/shared/Common";
import { Confirm, Field, useToast } from "../../components/ui";
import {
  checklistClient as client,
  checklistMode,
  monthPattern,
  ChecklistError,
  type ChecklistEntity,
  type ChecklistList,
  type ChecklistTask,
  type CreateTask,
} from "./api";
import "./checklist.css";

export function MonthlyChecklist() {
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
            {checklistMode === "demo" ? "Demo checklist" : "Local backend"}
          </span>
        }
      />
      <p className="notice">
        {checklistMode === "demo"
          ? "Session-only checklist demo. Tasks clear on page refresh."
          : "Tasks are saved to your local backend. Demo workspace controls and persona changes do not change checklist access."}
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
