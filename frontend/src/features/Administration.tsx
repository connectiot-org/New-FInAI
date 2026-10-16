import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Bell, Check, Plug, Plus, Search, Zap } from "lucide-react";
import { command, useAppDispatch, useDemo } from "../store";
import { money } from "../demo/selectors";
import { Back, Missing, PageHeader, Tabs } from "../components/shared/Common";
import {
  Badge,
  Confirm,
  Field,
  Modal,
  Permission,
  useToast,
} from "../components/ui";
import { amountPattern, toCents } from "./Accounting";
import { useUnsaved } from "../components/shared/useUnsaved";
import type { Automation, Role } from "../types/domain";
export function Automations() {
  const s = useDemo(),
    navigate = useNavigate(),
    [open, setOpen] = useState(false),
    dispatch = useAppDispatch();
  return (
    <>
      <PageHeader
        title="Automations"
        description="Repeatable local workflows. Preview the result before you run."
        action={
          <Permission admin>
            <button className="primary" onClick={() => setOpen(true)}>
              <Plus size={16} />
              New automation
            </button>
          </Permission>
        }
      />
      <div className="automation-grid">
        {s.automations.map((a) => (
          <Link
            className="panel automation-card"
            to={`/automations/${a.id}`}
            key={a.id}
          >
            <div className="section-heading">
              <Zap size={22} />
              <Badge>{a.enabled ? "Active" : "Inactive"}</Badge>
            </div>
            <h2>{a.name}</h2>
            <p>
              {a.trigger} → {a.action}
            </p>
            <p className="muted">
              Amount ≥ {money(a.threshold)} · {a.runs.length} local runs
            </p>
          </Link>
        ))}
      </div>
      <Modal title="New automation" open={open} onOpenChange={setOpen}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget),
              id = `auto-${crypto.randomUUID().slice(0, 6)}`;
            dispatch(
              command({
                kind: "automationSave",
                automation: {
                  id,
                  name: String(f.get("name")),
                  trigger: "Invoice issued",
                  threshold: 500000,
                  action: "Flag for review",
                  enabled: false,
                  runs: [],
                },
              }),
            );
            setOpen(false);
            navigate(`/automations/${id}`);
          }}
        >
          <Field label="Automation name">
            <input
              required
              minLength={3}
              name="name"
              placeholder="e.g. Review enterprise invoices"
            />
          </Field>
          <p className="muted">
            Starts as an inactive invoice review template. Configure it on the
            next screen.
          </p>
          <div className="dialog-actions">
            <button className="primary">Create local automation</button>
          </div>
        </form>
      </Modal>
    </>
  );
}
export function AutomationDetail() {
  const { id } = useParams(),
    s = useDemo(),
    a = s.automations.find((a) => a.id === id);
  return a ? (
    <AutomationEditor key={a.id} automation={a} />
  ) : (
    <Missing label="Automation" />
  );
}
function AutomationEditor({ automation: a }: { automation: Automation }) {
  const s = useDemo(),
    dispatch = useAppDispatch(),
    toast = useToast(),
    navigate = useNavigate(),
    [action, setAction] = useState(a.action),
    [name, setName] = useState(a.name),
    [trigger, setTrigger] = useState(a.trigger),
    [threshold, setThreshold] = useState((a.threshold / 100).toFixed(2)),
    [enabled, setEnabled] = useState(a.enabled),
    [preview, setPreview] = useState(false);
  const valid = amountPattern.test(threshold),
    dirty =
      name !== a.name ||
      trigger !== a.trigger ||
      toCents(threshold) !== a.threshold ||
      enabled !== a.enabled ||
      action !== a.action;
  const { confirmation } = useUnsaved(
    dirty,
    () => navigate("/automations"),
    "automation",
  );
  const matches =
    trigger === "Invoice issued"
      ? s.invoices
          .filter(
            (i) =>
              i.entity === s.entity &&
              i.status !== "Draft" &&
              i.amount >= (valid ? toCents(threshold) : 0),
          )
          .map((i) => ({
            id: i.id,
            amount: i.amount,
            to: `/receivables/invoices/${i.id}`,
          }))
      : s.bills
          .filter(
            (b) =>
              b.entity === s.entity &&
              b.amount >= (valid ? toCents(threshold) : 0),
          )
          .map((b) => ({
            id: b.id,
            amount: b.amount,
            to: `/payables/bills/${b.id}`,
          }));
  return (
    <>
      <Back to="/automations" label="Automations" />
      <PageHeader
        title={a.name}
        description="Local rule builder · Runs only when explicitly requested."
      />
      <div className="detail-columns">
        <form
          className="panel"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            dispatch(
              command({
                kind: "automationSave",
                automation: {
                  ...a,
                  name,
                  trigger,
                  action,
                  threshold: toCents(threshold),
                  enabled,
                },
              }),
            );
            setPreview(false);
            toast("Automation configuration saved");
          }}
        >
          <Field label="Name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={3}
            />
          </Field>
          <Field label="Trigger">
            <select
              value={trigger}
              onChange={(e) => {
                setTrigger(e.target.value);
                setPreview(false);
              }}
            >
              <option>Invoice issued</option>
              <option>Bill received</option>
            </select>
          </Field>
          <Field
            label="Amount at least (USD)"
            error={!valid ? "Use up to two decimal places" : undefined}
          >
            <input
              inputMode="decimal"
              value={threshold}
              onChange={(e) => {
                setThreshold(e.target.value);
                setPreview(false);
              }}
            />
          </Field>
          <Field label="Action">
            <select
              value={action}
              onChange={(e) => {
                setAction(e.target.value);
                setPreview(false);
              }}
            >
              <option>Flag for review</option>
              <option>Prepare review summary</option>
            </select>
          </Field>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            Enable local automation
          </label>
          <p className="muted">
            This prototype records a review queue in run history. It never sends
            messages or automatically posts entries.
          </p>
          <div className="dialog-actions">
            <Permission admin>
              <button className="primary" disabled={!valid}>
                Save automation
              </button>
            </Permission>
          </div>
        </form>
        <section className="panel">
          <h2>Preview & run</h2>
          <p>
            Preview scans all seeded dates in the active entity. Save changes
            before running.
          </p>
          <button disabled={!valid || dirty} onClick={() => setPreview(true)}>
            Preview demo results
          </button>
          {dirty && (
            <p className="muted">Save the configuration to enable preview.</p>
          )}
          {preview && (
            <>
              <p className="notice">
                {matches.length} matching records · Action: {action}.
              </p>
              <div className="preview-results">
                {matches.slice(0, 8).map((m) => (
                  <Link className="list-link" key={m.id} to={m.to}>
                    {m.id}
                    <strong>{money(m.amount)}</strong>
                  </Link>
                ))}
              </div>
              <Permission admin>
                <button
                  className="primary"
                  disabled={!a.enabled || dirty}
                  onClick={() => {
                    dispatch(command({ kind: "automationRun", id: a.id }));
                    toast("Local run recorded; review queue updated");
                  }}
                >
                  Run locally
                </button>
              </Permission>
              {!a.enabled && (
                <p className="muted">Enable and save this automation first.</p>
              )}
            </>
          )}
          <h3>Local run history</h3>
          {a.runs.length ? (
            a.runs.map((r, i) => (
              <div className="activity-item" key={i}>
                <Check size={16} />
                <div>
                  <strong>
                    {r.count} records · {r.action || a.action}
                  </strong>
                  <p>{new Date(r.date).toLocaleString()}</p>
                </div>
              </div>
            ))
          ) : (
            <p className="muted">No local runs yet.</p>
          )}
        </section>
      </div>
      {confirmation}
    </>
  );
}
const catalog = [
  {
    name: "Mercury (demo)",
    category: "Banking",
    description: "Operating cash and statement fixtures.",
  },
  {
    name: "Stripe (demo)",
    category: "Payments",
    description: "A simulated subscription payment source.",
  },
  {
    name: "Ramp (demo)",
    category: "Expenses",
    description: "A simulated spend management connection.",
  },
  {
    name: "Gusto (demo)",
    category: "Payroll",
    description: "A simulated payroll fixture connector.",
  },
  {
    name: "Salesforce (demo)",
    category: "CRM",
    description: "A simulated customer and contract source.",
  },
  {
    name: "Slack (demo)",
    category: "Notifications",
    description: "Local sync activity only; no messages sent.",
  },
];
export function Integrations() {
  const s = useDemo(),
    dispatch = useAppDispatch(),
    toast = useToast(),
    [query, setQuery] = useState(""),
    [selected, setSelected] = useState<string>(),
    [step, setStep] = useState(0),
    [consent, setConsent] = useState(false);
  return (
    <>
      <PageHeader
        title="Integrations"
        description="Explore a simulated connected finance stack. No credentials needed."
      />
      <div className="search-input integration-search">
        <Search size={16} />
        <input
          aria-label="Search integrations"
          placeholder="Search integrations…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="integration-grid">
        {catalog
          .filter((c) =>
            `${c.name} ${c.category}`
              .toLowerCase()
              .includes(query.toLowerCase()),
          )
          .map((c) => (
            <section className="panel integration-card" key={c.name}>
              <div className="section-heading">
                <span className="integration-logo">
                  <Plug size={23} />
                </span>
                <Badge>
                  {s.integrations.includes(c.name)
                    ? "Connected · demo"
                    : "Available"}
                </Badge>
              </div>
              <h2>{c.name}</h2>
              <span className="eyebrow">{c.category}</span>
              <p>{c.description}</p>
              <Permission admin>
                <button
                  onClick={() => {
                    setSelected(c.name);
                    setStep(0);
                    setConsent(false);
                  }}
                >
                  {s.integrations.includes(c.name)
                    ? "Manage connection"
                    : "Simulate connection"}
                </button>
              </Permission>
            </section>
          ))}
      </div>
      <section className="panel">
        <h2>Local sync log</h2>
        {s.syncLog.map((entry, i) => (
          <div className="activity-item" key={i}>
            <span className="activity-dot" />
            <p>{entry}</p>
          </div>
        ))}
      </section>
      <Modal
        title={selected || "Demo connection"}
        open={!!selected}
        onOpenChange={(v) => !v && setSelected(undefined)}
      >
        {selected && s.integrations.includes(selected) ? (
          <>
            <p>
              This is a simulated connection. No external account has been
              linked.
            </p>
            <button
              onClick={() => {
                dispatch(
                  command({
                    kind: "integration",
                    name: selected,
                    connected: false,
                  }),
                );
                setSelected(undefined);
                toast("Demo disconnected");
              }}
            >
              Disconnect demo
            </button>
          </>
        ) : step === 0 ? (
          <>
            <p>
              This wizard creates a local connection state. It does not contact{" "}
              {selected}, request credentials, or import data.
            </p>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              I understand this is a simulation
            </label>
            <div className="dialog-actions">
              <button
                className="primary"
                disabled={!consent}
                onClick={() => setStep(1)}
              >
                Continue simulation
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="notice success">
              Ready to save local connection state
            </div>
            <p>Your existing fixture data will remain the source of truth.</p>
            <div className="dialog-actions">
              <button
                className="primary"
                onClick={() => {
                  if (selected)
                    dispatch(
                      command({
                        kind: "integration",
                        name: selected,
                        connected: true,
                      }),
                    );
                  setSelected(undefined);
                  toast("Simulated connection saved");
                }}
              >
                Finish demo connection
              </button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
export function Settings() {
  const s = useDemo(),
    dispatch = useAppDispatch(),
    navigate = useNavigate(),
    toast = useToast(),
    { section = "workspace" } = useParams(),
    [reset, setReset] = useState(false),
    [dimension, setDimension] = useState("");
  const tabs = [
    "Workspace",
    "Members",
    "Approvals",
    "Dimensions",
    "Notifications",
    "Preferences",
  ];
  if (!tabs.map((t) => t.toLowerCase()).includes(section))
    return <Missing label="Settings page" />;
  return (
    <>
      <PageHeader
        title="Settings"
        description="Manage this local workspace and demo preferences."
      />
      <Tabs
        options={tabs}
        value={section[0].toUpperCase() + section.slice(1)}
        onChange={(v) => navigate(`/settings/${v.toLowerCase()}`)}
      />
      <section className="panel settings-panel">
        {section === "workspace" && (
          <>
            <h2>Workspace details</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                dispatch(
                  command({
                    kind: "settings",
                    workspace: String(
                      new FormData(e.currentTarget).get("workspace"),
                    ),
                  }),
                );
                toast("Workspace name saved");
              }}
            >
              <Field label="Workspace name">
                <input
                  name="workspace"
                  defaultValue={s.workspace}
                  required
                  minLength={2}
                />
              </Field>
              <Field label="Base currency">
                <input readOnly value="USD · All demo books use USD" />
              </Field>
              <Permission admin>
                <button className="primary">Save workspace</button>
              </Permission>
            </form>
          </>
        )}
        {section === "members" && (
          <>
            <h2>Demo members & roles</h2>
            <p className="muted">
              These local personas demonstrate permissions. They provide no
              security boundary.
            </p>
            {(["Admin", "Accountant", "Reviewer"] as Role[]).map((r, i) => (
              <div className="member-row" key={r}>
                <span className="avatar">{["AM", "TC", "JE"][i]}</span>
                <div>
                  <strong>
                    {["Alex Morgan", "Taylor Chen", "Jordan Ellis"][i]}
                  </strong>
                  <p>
                    {r === "Admin"
                      ? "All local controls"
                      : r === "Accountant"
                        ? "Create, submit, and post approved entries"
                        : "Review and approve; no draft editing"}
                  </p>
                </div>
                <button
                  onClick={() => {
                    dispatch(command({ kind: "scope", role: r }));
                    toast(`${r} persona selected`);
                  }}
                >
                  {s.role === r ? "Selected" : `Use ${r}`}
                </button>
              </div>
            ))}
          </>
        )}
        {section === "approvals" && (
          <>
            <h2>Review policy</h2>
            <p>
              All journals and bills require review in this demo. The threshold
              below is an informational high-value flag; it does not bypass
              review.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const value = String(
                  new FormData(e.currentTarget).get("threshold"),
                );
                if (!amountPattern.test(value)) return;
                dispatch(
                  command({
                    kind: "settings",
                    approvalThreshold: toCents(value),
                  }),
                );
                toast("Review threshold saved");
              }}
            >
              <Field label="High-value threshold (USD)">
                <input
                  name="threshold"
                  defaultValue={(s.approvalThreshold / 100).toFixed(2)}
                  pattern="[0-9]+(\.[0-9]{1,2})?"
                  required
                />
              </Field>
              <Permission admin>
                <button className="primary">Save policy</button>
              </Permission>
            </form>
          </>
        )}
        {section === "dimensions" && (
          <>
            <h2>Departments</h2>
            <p className="muted">
              Local reporting dimensions. Existing fixture departments remain on
              historical records.
            </p>
            {s.dimensions.map((d) => (
              <div className="detail-row" key={d}>
                <strong>{d}</strong>
                <Permission admin>
                  <button
                    onClick={() =>
                      dispatch(
                        command({
                          kind: "settings",
                          dimensions: s.dimensions.filter((v) => v !== d),
                        }),
                      )
                    }
                  >
                    Remove
                  </button>
                </Permission>
              </div>
            ))}
            <form
              className="inline-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (
                  dimension.trim() &&
                  !s.dimensions.includes(dimension.trim())
                )
                  dispatch(
                    command({
                      kind: "settings",
                      dimensions: [...s.dimensions, dimension.trim()],
                    }),
                  );
                setDimension("");
              }}
            >
              <input
                aria-label="New department"
                required
                value={dimension}
                onChange={(e) => setDimension(e.target.value)}
                placeholder="New department"
              />
              <Permission admin>
                <button>Add department</button>
              </Permission>
            </form>
          </>
        )}
        {section === "notifications" && (
          <>
            <Bell size={24} />
            <h2>Workspace notifications</h2>
            <p>
              Controls the local notification panel. No email, push notification
              or Slack message is sent.
            </p>
            <Permission admin>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={s.notifications}
                  onChange={(e) =>
                    dispatch(
                      command({
                        kind: "settings",
                        notifications: e.target.checked,
                      }),
                    )
                  }
                />
                Show local activity notifications
              </label>
            </Permission>
          </>
        )}
        {section === "preferences" && (
          <>
            <h2>Display & demo data</h2>
            <Permission admin>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={s.compact}
                  onChange={(e) =>
                    dispatch(
                      command({ kind: "settings", compact: e.target.checked }),
                    )
                  }
                />
                Compact table density
              </label>
            </Permission>
            <Field label="Simulated view state">
              <select
                defaultValue="ready"
                onChange={(e) =>
                  navigate(
                    `/accounting/ledger${e.target.value === "ready" ? "" : `?demoState=${e.target.value}`}`,
                  )
                }
              >
                <option value="ready">Ready</option>
                <option value="loading">Loading</option>
                <option value="empty">Empty</option>
                <option value="error">Error / retry</option>
              </select>
            </Field>
            <hr />
            <h3>Reset demo workspace</h3>
            <p>
              Restore all seeded records, balanced books and preferences. This
              removes local edits and audit activity.
            </p>
            <button className="danger" onClick={() => setReset(true)}>
              Reset demo
            </button>
          </>
        )}
      </section>
      <Confirm
        title="Reset all demo data?"
        open={reset}
        onOpenChange={setReset}
        description="Local journals, invoices, matches, task changes, roles, and audit history will be replaced with the original balanced fixture."
        label="Reset everything locally"
        onConfirm={() => {
          dispatch(command({ kind: "reset" }));
          localStorage.removeItem("finai-saved-reports");
          toast("Original demo restored");
          navigate("/overview");
        }}
      />
    </>
  );
}
