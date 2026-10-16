import { useEffect, useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { Plus, ArrowLeftRight, Paperclip } from "lucide-react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { command, useAppDispatch, useDemo } from "../store";
import { balances, balanced, inScope, ledger, money } from "../demo/selectors";
import { DataTable } from "../components/shared/Table";
import {
  Back,
  DocumentPreview,
  Missing,
  MoneyCell,
  PageHeader,
  Tabs,
} from "../components/shared/Common";
import {
  Badge,
  Confirm,
  Field,
  Modal,
  Permission,
  useToast,
} from "../components/ui";
import { useUnsaved } from "../components/shared/useUnsaved";
import type { Account, Journal } from "../types/domain";
export const amountPattern = /^\d{1,9}(\.\d{1,2})?$/;
export const toCents = (v: string) => {
  const [whole, decimal = ""] = v.split(".");
  return Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
};
const journalSchema = z.object({
  memo: z.string().trim().min(3, "Add a description of at least 3 characters"),
  date: z
    .string()
    .regex(/^2026-0[4-9]-\d{2}$/, "Choose April through September 2026"),
  lines: z
    .array(
      z.object({
        account: z.string().min(1),
        debit: z
          .string()
          .regex(amountPattern, "Use a positive amount with up to 2 decimals"),
        credit: z
          .string()
          .regex(amountPattern, "Use a positive amount with up to 2 decimals"),
      }),
    )
    .min(2),
});
type JournalValues = z.infer<typeof journalSchema>;
export function JournalEditor({
  open,
  onClose,
  existing,
}: {
  open: boolean;
  onClose: () => void;
  existing?: Journal;
}) {
  const s = useDemo(),
    dispatch = useAppDispatch(),
    navigate = useNavigate(),
    toast = useToast();
  const form = useForm<JournalValues>({
    resolver: zodResolver(journalSchema),
    defaultValues: {
      memo: existing?.memo || "",
      date: existing?.date || `${s.period === "all" ? "2026-09" : s.period}-30`,
      lines: existing?.lines.map((l) => ({
        account: l.account,
        debit: (l.debit / 100).toFixed(2),
        credit: (l.credit / 100).toFixed(2),
      })) || [
        { account: "1000", debit: "0", credit: "0" },
        { account: "4000", debit: "0", credit: "0" },
      ],
    },
  });
  const { requestClose, saved, confirmation } = useUnsaved(
    form.formState.isDirty,
    onClose,
    "journal",
  );
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "lines",
  });
  const values = form.watch();
  const lines = values.lines.map((l) => ({
    account: l.account,
    debit: amountPattern.test(l.debit) ? toCents(l.debit) : 0,
    credit: amountPattern.test(l.credit) ? toCents(l.credit) : 0,
  }));
  const debit = lines.reduce((v, l) => v + l.debit, 0),
    credit = lines.reduce((v, l) => v + l.credit, 0),
    valid = balanced({ lines });
  const isLocked = s.locked.includes(`${s.entity}:${values.date.slice(0, 7)}`);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (form.formState.isDirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [form.formState.isDirty]);
  return (
    <>
      <Modal
        open={open}
        onOpenChange={(v) => {
          if (!v) requestClose();
        }}
        title={existing ? "Edit draft journal" : "New journal entry"}
      >
        <form
          onSubmit={form.handleSubmit((v) => {
            if (!valid || isLocked) return;
            const id =
              existing?.id ||
              `JE-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
            dispatch(
              command({
                kind: "journalSave",
                journal: {
                  id,
                  entity: s.entity,
                  date: v.date,
                  memo: v.memo,
                  status: "Draft",
                  lines,
                },
              }),
            );
            toast("Balanced draft saved");
            saved();
            onClose();
            navigate(`/accounting/journals/${id}`);
          })}
        >
          <div className="form-grid">
            <Field
              label="Description"
              error={form.formState.errors.memo?.message}
            >
              <input
                {...form.register("memo")}
                placeholder="e.g. September consulting accrual"
              />
            </Field>
            <Field
              label="Journal date"
              error={form.formState.errors.date?.message}
            >
              <input
                type="date"
                min="2026-04-01"
                max="2026-09-30"
                {...form.register("date")}
              />
            </Field>
          </div>
          <div className="journal-lines">
            <div className="line-head">
              <span>Account</span>
              <span>Debit (USD)</span>
              <span>Credit (USD)</span>
              <span />
            </div>
            {fields.map((f, i) => (
              <div key={f.id} className="journal-line">
                <select
                  aria-label={`Line ${i + 1} account`}
                  {...form.register(`lines.${i}.account`)}
                >
                  {s.accounts
                    .filter((a) => a.active)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.id} · {a.name}
                      </option>
                    ))}
                </select>
                <input
                  aria-label={`Line ${i + 1} debit`}
                  inputMode="decimal"
                  {...form.register(`lines.${i}.debit`)}
                />
                <input
                  aria-label={`Line ${i + 1} credit`}
                  inputMode="decimal"
                  {...form.register(`lines.${i}.credit`)}
                />
                <button
                  type="button"
                  aria-label={`Remove line ${i + 1}`}
                  disabled={fields.length <= 2}
                  onClick={() => remove(i)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          {form.formState.errors.lines && (
            <p className="error">
              Amounts need up to 2 decimal places. Each line may contain only a
              debit or a credit.
            </p>
          )}
          <button
            type="button"
            className="text-link"
            onClick={() => append({ account: "6100", debit: "0", credit: "0" })}
          >
            <Plus size={14} />
            Add line
          </button>
          <div className="totals">
            <span>
              Debits <strong>{money(debit)}</strong>
            </span>
            <span>
              Credits <strong>{money(credit)}</strong>
            </span>
          </div>
          <p className={valid ? "success-text" : "error"} role="status">
            {valid
              ? "Journal is balanced"
              : `Journal is not balanced · difference ${money(debit - credit)}. Enter equal, nonzero debits and credits.`}
          </p>
          {isLocked && (
            <p className="error">
              This period is locked. Unlock it in Month-end close.
            </p>
          )}
          <div className="dialog-actions">
            <button type="button" onClick={requestClose}>
              Cancel
            </button>
            <button
              className="primary"
              disabled={!valid || isLocked || s.role === "Reviewer"}
              type="submit"
            >
              Save draft
            </button>
          </div>
        </form>
      </Modal>
      {confirmation}
    </>
  );
}
export function Journals() {
  const s = useDemo(),
    navigate = useNavigate(),
    [params, setParams] = useSearchParams();
  const [open, setOpen] = useState(params.has("new"));
  const status = params.get("status") || "All";
  const data = s.journals.filter(
    (j) => inScope(s, j) && (status === "All" || j.status === status),
  );
  return (
    <>
      <PageHeader
        title="Journal entries"
        description="Create, review, and post entries with a complete audit trail."
        action={
          <Permission>
            <button className="primary" onClick={() => setOpen(true)}>
              <Plus size={16} />
              New journal entry
            </button>
          </Permission>
        }
      />
      <Tabs
        options={["All", "Draft", "In review", "Approved", "Posted"]}
        value={status}
        onChange={(v) => {
          const p = new URLSearchParams(params);
          p.set("status", v);
          p.delete("q");
          setParams(p);
        }}
      />
      <DataTable
        name="journals"
        data={data}
        onRow={(j) => navigate(`/accounting/journals/${j.id}`)}
        columns={[
          { key: "id", label: "Entry number" },
          { key: "date", label: "Date" },
          { key: "memo", label: "Description" },
          {
            key: "status",
            label: "Status",
            render: (j) => <Badge>{j.status}</Badge>,
          },
          {
            key: "lines",
            label: "Amount",
            value: (j) => j.lines.reduce((v, l) => v + l.debit, 0),
            numeric: true,
            render: (j) => (
              <MoneyCell value={j.lines.reduce((v, l) => v + l.debit, 0)} />
            ),
          },
        ]}
      />
      {open && (
        <JournalEditor
          open
          onClose={() => {
            setOpen(false);
            if (params.has("new")) {
              params.delete("new");
              setParams(params);
            }
          }}
        />
      )}
    </>
  );
}
export function JournalDetail() {
  const { id } = useParams(),
    s = useDemo(),
    dispatch = useAppDispatch(),
    toast = useToast();
  const j = s.journals.find((j) => j.id === id && j.entity === s.entity);
  const [edit, setEdit] = useState(false),
    [reverse, setReverse] = useState(false);
  if (!j) return <Missing label="Journal" />;
  const reversal = s.journals.find((r) => r.reversalOf === id),
    isLocked = s.locked.includes(`${s.entity}:${j.date.slice(0, 7)}`);
  const step = (step: "submit" | "approve" | "post" | "reverse") => {
    dispatch(command({ kind: "journalStep", id: j.id, step }));
    toast(
      `Demo journal ${step === "reverse" ? "reversed" : step === "post" ? "posted" : step === "approve" ? "approved" : "submitted"}`,
    );
  };
  return (
    <>
      <Back to="/accounting/journals" label="Journal entries" />
      <PageHeader
        title={j.id}
        description={j.memo}
        action={
          <>
            <Badge>{j.status}</Badge>
            {!isLocked && j.status === "Draft" && (
              <Permission>
                <button onClick={() => setEdit(true)}>Edit draft</button>
                <button className="primary" onClick={() => step("submit")}>
                  Submit for review
                </button>
              </Permission>
            )}
            {!isLocked && j.status === "In review" && (
              <Permission review>
                <button className="primary" onClick={() => step("approve")}>
                  Approve journal
                </button>
              </Permission>
            )}
            {!isLocked && j.status === "Approved" && (
              <Permission>
                <button className="primary" onClick={() => step("post")}>
                  Post journal
                </button>
              </Permission>
            )}
            {!isLocked &&
              j.status === "Posted" &&
              !j.reversalOf &&
              !reversal &&
              !j.source && (
                <Permission>
                  <button onClick={() => setReverse(true)}>
                    <ArrowLeftRight size={15} />
                    Reverse entry
                  </button>
                </Permission>
              )}
          </>
        }
      />
      {isLocked && <p className="notice">This accounting period is locked.</p>}
      {(reversal || j.reversalOf) && (
        <p className="notice">
          Linked {reversal ? "reversal" : "original"}:{" "}
          <Link to={`/accounting/journals/${reversal?.id || j.reversalOf}`}>
            {reversal?.id || j.reversalOf}
          </Link>
          . Original history is preserved.
        </p>
      )}
      <div className="panel">
        <div className="detail-grid">
          <div>
            <small>Entity</small>
            <strong>{s.entities.find((e) => e.id === j.entity)?.name}</strong>
          </div>
          <div>
            <small>Accounting date</small>
            <strong>{j.date}</strong>
          </div>
          <div>
            <small>Source</small>
            {j.source ? (
              <Link
                to={
                  j.source.startsWith("INV")
                    ? `/receivables/invoices/${j.source}`
                    : `/payables/bills/${j.source}`
                }
              >
                {j.source}
              </Link>
            ) : (
              <strong>Manual entry</strong>
            )}
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Account</th>
                <th className="numeric">Debit</th>
                <th className="numeric">Credit</th>
              </tr>
            </thead>
            <tbody>
              {j.lines.map((l, i) => (
                <tr key={i}>
                  <td>
                    <Link to={`/accounting/ledger?account=${l.account}`}>
                      {l.account} ·{" "}
                      {s.accounts.find((a) => a.id === l.account)?.name}
                    </Link>
                  </td>
                  <td className="numeric">{money(l.debit)}</td>
                  <td className="numeric">{money(l.credit)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td className="numeric">
                  {money(j.lines.reduce((v, l) => v + l.debit, 0))}
                </td>
                <td className="numeric">
                  {money(j.lines.reduce((v, l) => v + l.credit, 0))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
      <div className="detail-columns">
        <DocumentPreview title={j.id} />
        <section className="panel">
          <h2>
            <Paperclip size={18} />
            Entry history
          </h2>
          {s.audit
            .filter((a) => a.object === id)
            .map((a) => (
              <div className="activity-item" key={a.id}>
                <div>
                  <strong>{a.action}</strong>
                  <p>{a.actor}</p>
                </div>
              </div>
            ))}
          <Link className="inline-link" to={`/audit-log?q=${j.id}`}>
            View full audit trail
          </Link>
        </section>
      </div>
      {edit && (
        <JournalEditor open existing={j} onClose={() => setEdit(false)} />
      )}
      <Confirm
        open={reverse}
        onOpenChange={setReverse}
        title="Reverse posted journal?"
        description="This creates an equal and opposite posted entry dated September 30, 2026. The original entry remains visible. Source-linked invoices and bills are managed in their own workflows."
        label="Reverse locally"
        onConfirm={() => step("reverse")}
      />
    </>
  );
}
export function Ledger() {
  const s = useDemo(),
    navigate = useNavigate(),
    [params, setParams] = useSearchParams(),
    account = params.get("account") || "";
  const data = ledger(s).filter((l) => !account || l.account === account);
  return (
    <>
      <PageHeader
        title="General ledger"
        description="Every posted transaction, connected to its source."
        action={
          <Link className="button" to="/accounting/trial-balance">
            View trial balance
          </Link>
        }
      />
      <DataTable
        name="ledger"
        data={data}
        onRow={(l) => navigate(`/accounting/journals/${l.journal}`)}
        extra={
          <select
            aria-label="Filter account"
            value={account}
            onChange={(e) => {
              const p = new URLSearchParams(params);
              if (e.target.value) p.set("account", e.target.value);
              else p.delete("account");
              setParams(p);
            }}
          >
            <option value="">All accounts</option>
            {s.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.id} · {a.name}
              </option>
            ))}
          </select>
        }
        columns={[
          { key: "journal", label: "Journal" },
          { key: "date", label: "Date" },
          {
            key: "account",
            label: "Account",
            render: (l) => (
              <Link to={`/accounting/ledger?account=${l.account}`}>
                {l.account} · {s.accounts.find((a) => a.id === l.account)?.name}
              </Link>
            ),
          },
          { key: "memo", label: "Description" },
          {
            key: "source",
            label: "Source",
            render: (l) =>
              l.source ? (
                <Link
                  to={
                    l.source.startsWith("INV")
                      ? `/receivables/invoices/${l.source}`
                      : `/payables/bills/${l.source}`
                  }
                >
                  {l.source}
                </Link>
              ) : (
                "Manual"
              ),
          },
          {
            key: "debit",
            label: "Debit",
            numeric: true,
            render: (l) => <MoneyCell value={l.debit} />,
          },
          {
            key: "credit",
            label: "Credit",
            numeric: true,
            render: (l) => <MoneyCell value={l.credit} />,
          },
        ]}
      />
      <div className="totals">
        <span>
          Debits <strong>{money(data.reduce((v, l) => v + l.debit, 0))}</strong>
        </span>
        <span>
          Credits{" "}
          <strong>{money(data.reduce((v, l) => v + l.credit, 0))}</strong>
        </span>
      </div>
    </>
  );
}
export function Accounts() {
  const s = useDemo(),
    dispatch = useAppDispatch();
  const [open, setOpen] = useState(false),
    [current, setCurrent] = useState<Account>(),
    [type, setType] = useState("All"),
    [activity, setActivity] = useState("All"),
    [error, setError] = useState("");
  const b = balances(s, true);
  return (
    <>
      <PageHeader
        title="Chart of accounts"
        description="The structure behind your books."
        action={
          <Permission>
            <button
              className="primary"
              onClick={() => {
                setCurrent(undefined);
                setError("");
                setOpen(true);
              }}
            >
              <Plus size={16} />
              New account
            </button>
          </Permission>
        }
      />
      <DataTable
        name="accounts"
        data={s.accounts.filter(
          (a) =>
            (type === "All" || a.type === type) &&
            (activity === "All" || a.active === (activity === "Active")),
        )}
        onRow={(a) => {
          setCurrent(a);
          setError("");
          setOpen(true);
        }}
        extra={
          <>
            <select
              aria-label="Account activity"
              value={activity}
              onChange={(e) => setActivity(e.target.value)}
            >
              {["All", "Active", "Inactive"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
            <select
              aria-label="Account type"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              {[
                "All",
                "Asset",
                "Liability",
                "Equity",
                "Revenue",
                "Expense",
              ].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </>
        }
        columns={[
          { key: "id", label: "Code" },
          { key: "name", label: "Account name" },
          { key: "type", label: "Type" },
          {
            key: "active",
            label: "Status",
            value: (a) => (a.active ? "Active" : "Inactive"),
            render: (a) => <Badge>{a.active ? "Active" : "Inactive"}</Badge>,
          },
          {
            key: "id",
            label: "Balance",
            value: (a) => b[a.id] ?? 0,
            numeric: true,
            render: (a) => <MoneyCell value={b[a.id] ?? 0} />,
          },
          {
            key: "id",
            label: "Activity",
            value: (a) => `/accounting/ledger?account=${a.id}`,
            render: (a) => (
              <Link to={`/accounting/ledger?account=${a.id}`}>View ledger</Link>
            ),
          },
        ]}
      />
      <Modal
        open={open}
        onOpenChange={setOpen}
        title={current ? "Edit account" : "Create account"}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget),
              id = String(f.get("id"));
            if (!current && s.accounts.some((a) => a.id === id)) {
              setError("This account code already exists.");
              return;
            }
            dispatch(
              command({
                kind: "accountSave",
                account: {
                  id,
                  name: String(f.get("name")),
                  type: f.get("type") as Account["type"],
                  active: f.get("active") === "on",
                },
              }),
            );
            setOpen(false);
          }}
        >
          <Field label="Account code">
            <input
              name="id"
              required
              pattern="[0-9]{4,6}"
              defaultValue={current?.id}
              readOnly={!!current}
            />
          </Field>
          <Field label="Account name">
            <input
              name="name"
              required
              minLength={2}
              defaultValue={current?.name}
            />
          </Field>
          <Field label="Account type">
            <select
              name="type"
              defaultValue={current?.type || "Expense"}
              disabled={!!current}
            >
              {["Asset", "Liability", "Equity", "Revenue", "Expense"].map(
                (t) => (
                  <option key={t}>{t}</option>
                ),
              )}
            </select>
          </Field>
          {current && <input type="hidden" name="type" value={current.type} />}
          <label className="checkbox-label">
            <input
              type="checkbox"
              name="active"
              defaultChecked={current?.active ?? true}
            />
            Active account
          </label>
          {error && <p className="error">{error}</p>}
          <div className="dialog-actions">
            <Permission>
              <button className="primary">Save account</button>
            </Permission>
          </div>
        </form>
      </Modal>
    </>
  );
}
export function TrialBalance() {
  const s = useDemo(),
    navigate = useNavigate(),
    b = balances(s, true);
  const data = s.accounts.map((a) => ({
    ...a,
    debit: Math.max(0, b[a.id] ?? 0),
    credit: Math.max(0, -(b[a.id] ?? 0)),
  }));
  const debit = data.reduce((v, a) => v + a.debit, 0),
    credit = data.reduce((v, a) => v + a.credit, 0);
  return (
    <>
      <PageHeader
        title="Trial balance"
        description="Closing balances through the selected period. Includes opening equity and retained earnings."
      />
      <div className={`notice ${debit === credit ? "success" : ""}`}>
        Control difference: {money(debit - credit)} ·{" "}
        {debit === credit ? "Books are balanced" : "Review required"}
      </div>
      <DataTable
        name="trial balance"
        data={data}
        onRow={(a) => navigate(`/accounting/ledger?account=${a.id}`)}
        columns={[
          { key: "id", label: "Account" },
          { key: "name", label: "Name" },
          { key: "type", label: "Type" },
          {
            key: "debit",
            label: "Debit",
            numeric: true,
            render: (a) => <MoneyCell value={a.debit} />,
          },
          {
            key: "credit",
            label: "Credit",
            numeric: true,
            render: (a) => <MoneyCell value={a.credit} />,
          },
        ]}
      />
      <div className="totals">
        <span>
          Debits <strong>{money(debit)}</strong>
        </span>
        <span>
          Credits <strong>{money(credit)}</strong>
        </span>
      </div>
    </>
  );
}
export function Audit() {
  const s = useDemo(),
    [selected, setSelected] = useState<string>(),
    [actor, setActor] = useState("All");
  const event = s.audit.find((a) => a.id === selected);
  return (
    <>
      <PageHeader
        title="Audit log"
        description="A transparent record of local changes. Reset demo clears this history."
      />
      <DataTable
        name="audit events"
        data={s.audit.filter((a) => actor === "All" || a.actor.includes(actor))}
        onRow={(a) => setSelected(a.id)}
        extra={
          <select
            aria-label="Filter audit actor"
            value={actor}
            onChange={(e) => setActor(e.target.value)}
          >
            {["All", "Admin", "Accountant", "Reviewer"].map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        }
        columns={[
          { key: "action", label: "Action" },
          { key: "object", label: "Record" },
          { key: "actor", label: "Actor" },
          {
            key: "date",
            label: "Timestamp",
            render: (a) => new Date(a.date).toLocaleString(),
          },
        ]}
      />
      <Modal
        title="Audit event details"
        open={!!event}
        onOpenChange={(v) => !v && setSelected(undefined)}
        drawer
      >
        {event && (
          <>
            <h3>{event.action}</h3>
            <p>
              {event.actor} · {event.date}
            </p>
            <h4>Before</h4>
            <pre>{event.before}</pre>
            <h4>After</h4>
            <pre>{event.after}</pre>
          </>
        )}
      </Modal>
    </>
  );
}
