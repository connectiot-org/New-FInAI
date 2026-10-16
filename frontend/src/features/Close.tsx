import { useState } from "react";
import { Check, LockKeyhole, Unlock } from "lucide-react";
import { useDemo, useAppDispatch, command } from "../store";
import { PageHeader, DocumentPreview } from "../components/shared/Common";
import {
  Badge,
  Confirm,
  Field,
  Modal,
  Permission,
  useToast,
} from "../components/ui";
export function Close() {
  const s = useDemo(),
    dispatch = useAppDispatch(),
    toast = useToast(),
    [selected, setSelected] = useState<string>(),
    [evidence, setEvidence] = useState(""),
    [confirm, setConfirm] = useState(false);
  const period = s.period === "all" ? "2026-09" : s.period,
    tasks = s.tasks.filter(
      (t) => t.entity === s.entity && t.due.startsWith(period),
    ),
    done = tasks.filter((t) => t.status === "Approved").length,
    task = tasks.find((t) => t.id === selected),
    locked = s.locked.includes(`${s.entity}:${period}`);
  return (
    <>
      <PageHeader
        title="Month-end close"
        description={`${period} · A shared checklist for a confident close.`}
        action={
          <Permission admin>
            <button onClick={() => setConfirm(true)}>
              {locked ? <Unlock size={15} /> : <LockKeyhole size={15} />}{" "}
              {locked ? "Unlock period" : "Lock period"}
            </button>
          </Permission>
        }
      />
      <div className="close-summary panel">
        <div>
          <strong>
            {done} <span>/ {tasks.length}</span>
          </strong>
          <p>tasks approved</p>
        </div>
        <div className="progress-track">
          <div
            style={{
              width: `${tasks.length ? (done / tasks.length) * 100 : 0}%`,
            }}
          />
        </div>
        <Badge>{locked ? "Period locked" : "Period open"}</Badge>
      </div>
      <section className="panel close-table">
        {tasks.map((t) => (
          <button
            className="close-task"
            key={t.id}
            onClick={() => {
              setSelected(t.id);
              setEvidence(t.evidence);
            }}
          >
            <span
              className={`check-circle ${t.status === "Approved" ? "done" : ""}`}
            >
              {t.status === "Approved" && <Check size={13} />}
            </span>
            <div>
              <strong>{t.title}</strong>
              <p>
                {t.owner} · Due {t.due}
              </p>
            </div>
            {t.evidence && (
              <span className="muted evidence-label">Evidence attached</span>
            )}
            <Badge>{t.status}</Badge>
          </button>
        ))}
        {!tasks.length && (
          <p className="muted">No checklist tasks for this period.</p>
        )}
      </section>
      <Modal
        open={!!task}
        onOpenChange={(v) => !v && setSelected(undefined)}
        title="Close task"
        drawer
      >
        {task && (
          <>
            <h2>{task.title}</h2>
            <p>
              {task.owner} · Due {task.due}
            </p>
            <Badge>{task.status}</Badge>
            <Field label="Evidence note">
              <textarea
                value={evidence}
                onChange={(e) => setEvidence(e.target.value)}
                placeholder="Describe the supporting work"
                disabled={task.status !== "To do" || s.role === "Reviewer"}
              />
            </Field>
            <DocumentPreview
              title="Close evidence"
              onEvidence={(name) =>
                setEvidence(
                  (v) => `${v}${v ? " · " : ""}Local attachment: ${name}`,
                )
              }
            />
            {task.evidence && (
              <p className="notice">
                Saved evidence: {task.evidence}. File contents are session-only.
              </p>
            )}
            <div className="dialog-actions">
              {task.status === "To do" ? (
                <Permission>
                  <button
                    className="primary"
                    disabled={!evidence.trim() || locked}
                    onClick={() => {
                      dispatch(
                        command({
                          kind: "taskStep",
                          id: task.id,
                          step: "complete",
                          evidence,
                        }),
                      );
                      toast("Task completed with evidence metadata");
                    }}
                  >
                    Complete task
                  </button>
                </Permission>
              ) : task.status === "Complete" ? (
                <Permission>
                  <button
                    className="primary"
                    disabled={locked}
                    onClick={() =>
                      dispatch(
                        command({
                          kind: "taskStep",
                          id: task.id,
                          step: "submit",
                        }),
                      )
                    }
                  >
                    Request review
                  </button>
                </Permission>
              ) : task.status === "In review" ? (
                <Permission review>
                  <button
                    className="primary"
                    disabled={locked}
                    onClick={() => {
                      dispatch(
                        command({
                          kind: "taskStep",
                          id: task.id,
                          step: "approve",
                        }),
                      );
                      toast("Close task approved");
                    }}
                  >
                    Approve task
                  </button>
                </Permission>
              ) : (
                <p className="success-text">This task is approved.</p>
              )}
            </div>
          </>
        )}
      </Modal>
      <Confirm
        title={locked ? "Unlock accounting period?" : "Lock accounting period?"}
        open={confirm}
        onOpenChange={setConfirm}
        description={`This local demo control ${locked ? "allows" : "blocks"} posting and source changes for ${period}. ${tasks.length - done} close tasks are still unapproved.`}
        label={locked ? "Unlock locally" : "Lock locally"}
        onConfirm={() => {
          dispatch(command({ kind: "lock", period }));
          toast("Local period lock updated");
        }}
      />
    </>
  );
}
