import { useEffect, useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  Plus,
  ArrowUpRight,
  Landmark,
  Check,
  Link2,
  Unlink,
} from "lucide-react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { command, useAppDispatch, useDemo } from "../store";
import { balances, inScope, ledger, money } from "../demo/selectors";
import { periods } from "../demo/seed";
import { amountPattern, toCents } from "./Accounting";
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
  Empty,
  Field,
  Modal,
  Permission,
  useToast,
} from "../components/ui";
import { useUnsaved } from "../components/shared/useUnsaved";
import type { Invoice } from "../types/domain";
const invoiceSchema = z
  .object({
    customer: z.string().min(1),
    date: z.string().min(1),
    due: z.string().min(1),
    lines: z
      .array(
        z.object({
          description: z.string().trim().min(2),
          quantity: z.string().regex(/^[1-9]\d{0,3}$/, "Use a whole quantity"),
          rate: z.string().regex(amountPattern, "Use up to 2 decimal places"),
        }),
      )
      .min(1),
  })
  .refine((v) => v.due >= v.date, {
    path: ["due"],
    message: "Due date must be on or after the invoice date",
  });
type InvoiceValues = z.infer<typeof invoiceSchema>;
function InvoiceEditor({
  onClose,
  existing,
}: {
  onClose: () => void;
  existing?: Invoice;
}) {
  const s = useDemo(),
    dispatch = useAppDispatch(),
    navigate = useNavigate(),
    toast = useToast();
  const form = useForm<InvoiceValues>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: {
      customer:
        existing?.customer ||
        s.customers.find((c) => c.entity === s.entity)?.id,
      date: existing?.date || `${s.period === "all" ? "2026-09" : s.period}-25`,
      due: existing?.due || "2026-10-25",
      lines: existing?.lineItems?.map((l) => ({
        description: l.description,
        quantity: String(l.quantity),
        rate: (l.rate / 100).toFixed(2),
      })) || [
        {
          description: existing?.description || "Platform subscription",
          quantity: "1",
          rate: existing ? (existing.amount / 100).toFixed(2) : "2500.00",
        },
      ],
    },
  });
  const { requestClose, saved, confirmation } = useUnsaved(
    form.formState.isDirty,
    onClose,
    "invoice",
  );
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "lines",
  });
  const total = form
    .watch("lines")
    .reduce(
      (v, l) =>
        v +
        (amountPattern.test(l.rate) ? toCents(l.rate) : 0) *
          (Number(l.quantity) || 0),
      0,
    );
  const date = form.watch("date");
  const locked = s.locked.includes(`${s.entity}:${date.slice(0, 7)}`);
  useEffect(() => {
    const fn = (e: BeforeUnloadEvent) => {
      if (form.formState.isDirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", fn);
    return () => window.removeEventListener("beforeunload", fn);
  }, [form.formState.isDirty]);
  return (
    <>
      <Modal
        open
        title={existing ? "Edit draft invoice" : "New invoice"}
        onOpenChange={(v) => {
          if (!v) requestClose();
        }}
      >
        <form
          onSubmit={form.handleSubmit((v) => {
            if (total <= 0 || !Number.isSafeInteger(total) || locked) return;
            const id =
              existing?.id ||
              `INV-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
            dispatch(
              command({
                kind: "invoiceSave",
                invoice: {
                  id,
                  entity: s.entity,
                  customer: v.customer,
                  date: v.date,
                  due: v.due,
                  description: v.lines.map((l) => l.description).join(" · "),
                  amount: total,
                  paid: 0,
                  status: "Draft",
                  department: "Sales",
                  lineItems: v.lines.map((l) => ({
                    description: l.description,
                    quantity: Number(l.quantity),
                    rate: toCents(l.rate),
                  })),
                },
              }),
            );
            toast("Invoice draft saved");
            saved();
            onClose();
            navigate(`/receivables/invoices/${id}`);
          })}
        >
          <Field label="Customer">
            <select {...form.register("customer")}>
              {s.customers
                .filter((c) => c.entity === s.entity)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </Field>
          <div className="form-grid">
            <Field label="Invoice date">
              <input
                type="date"
                min="2026-04-01"
                max="2026-09-30"
                {...form.register("date")}
              />
            </Field>
            <Field label="Due date" error={form.formState.errors.due?.message}>
              <input type="date" {...form.register("due")} />
            </Field>
          </div>
          <h3>Invoice lines</h3>
          {fields.map((f, i) => (
            <div className="invoice-line" key={f.id}>
              <Field label="Description">
                <input {...form.register(`lines.${i}.description`)} />
              </Field>
              <Field label="Quantity">
                <input
                  inputMode="numeric"
                  {...form.register(`lines.${i}.quantity`)}
                />
              </Field>
              <Field label="Rate (USD)">
                <input
                  inputMode="decimal"
                  {...form.register(`lines.${i}.rate`)}
                />
              </Field>
              <button
                type="button"
                aria-label={`Remove invoice line ${i + 1}`}
                disabled={fields.length < 2}
                onClick={() => remove(i)}
              >
                ×
              </button>
            </div>
          ))}
          {form.formState.errors.lines && (
            <p className="error">
              Check every description, whole-number quantity, and rate.
            </p>
          )}
          <button
            type="button"
            onClick={() =>
              append({
                description: "Additional services",
                quantity: "1",
                rate: "0",
              })
            }
          >
            Add invoice line
          </button>
          <div className="totals">
            Invoice total <strong>{money(total)}</strong>
          </div>
          {locked && <p className="error">This period is locked.</p>}
          <div className="dialog-actions">
            <button type="button" onClick={requestClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="primary"
              disabled={locked || total <= 0 || s.role === "Reviewer"}
            >
              Save draft invoice
            </button>
          </div>
        </form>
      </Modal>
      {confirmation}
    </>
  );
}
export function Invoices() {
  const s = useDemo(),
    navigate = useNavigate(),
    [params, setParams] = useSearchParams(),
    status = params.get("status") || "All";
  const [open, setOpen] = useState(false);
  const data = s.invoices
    .filter(
      (i) =>
        inScope(s, i) &&
        (status === "All" ||
          (status === "Outstanding"
            ? i.paid < i.amount && i.status !== "Draft"
            : i.status === status)),
    )
    .map((i) => ({
      ...i,
      customerName: s.customers.find((c) => c.id === i.customer)?.name || "",
      balance: i.amount - i.paid,
    }));
  return (
    <>
      <PageHeader
        title="Invoices"
        description="From first draft to final receipt, keep receivables moving."
        action={
          <Permission>
            <button className="primary" onClick={() => setOpen(true)}>
              <Plus size={16} />
              New invoice
            </button>
          </Permission>
        }
      />
      <Tabs
        options={["All", "Draft", "Issued", "Partial", "Paid", "Outstanding"]}
        value={status}
        onChange={(v) => {
          const p = new URLSearchParams(params);
          p.set("status", v);
          p.delete("q");
          setParams(p);
        }}
      />
      <DataTable
        name="invoices"
        data={data}
        onRow={(i) => navigate(`/receivables/invoices/${i.id}`)}
        columns={[
          { key: "id", label: "Invoice" },
          { key: "customerName", label: "Customer" },
          { key: "date", label: "Issued" },
          { key: "due", label: "Due date" },
          {
            key: "status",
            label: "Status",
            render: (i) => <Badge>{i.status}</Badge>,
          },
          {
            key: "amount",
            label: "Total",
            numeric: true,
            render: (i) => <MoneyCell value={i.amount} />,
          },
          {
            key: "balance",
            label: "Balance",
            numeric: true,
            render: (i) => <MoneyCell value={i.balance} />,
          },
        ]}
      />
      {open && <InvoiceEditor onClose={() => setOpen(false)} />}
    </>
  );
}
export function InvoiceDetail() {
  const { id } = useParams(),
    s = useDemo(),
    dispatch = useAppDispatch(),
    toast = useToast(),
    [edit, setEdit] = useState(false),
    [receipt, setReceipt] = useState(false),
    [amount, setAmount] = useState("");
  const i = s.invoices.find((i) => i.id === id && i.entity === s.entity);
  if (!i) return <Missing label="Invoice" />;
  const customer = s.customers.find((c) => c.id === i.customer),
    remaining = i.amount - i.paid,
    locked = s.locked.includes(`${s.entity}:${i.date.slice(0, 7)}`);
  return (
    <>
      <Back to="/receivables/invoices" label="Invoices" />
      <PageHeader
        title={i.id}
        description={customer?.name}
        action={
          <>
            <Badge>{i.status}</Badge>
            {i.amount >= s.approvalThreshold && (
              <span className="tag">High value</span>
            )}
            {!locked && (
              <Permission>
                {i.status === "Draft" ? (
                  <>
                    <button onClick={() => setEdit(true)}>Edit invoice</button>
                    <button
                      className="primary"
                      onClick={() => {
                        dispatch(
                          command({
                            kind: "invoiceStep",
                            id: i.id,
                            step: "issue",
                          }),
                        );
                        toast("Invoice issued in demo only");
                      }}
                    >
                      Issue locally
                    </button>
                  </>
                ) : (
                  remaining > 0 && (
                    <button
                      className="primary"
                      onClick={() => {
                        setAmount((remaining / 100).toFixed(2));
                        setReceipt(true);
                      }}
                    >
                      Apply demo receipt
                    </button>
                  )
                )}
              </Permission>
            )}
          </>
        }
      />
      <div className="detail-columns">
        <div className="panel">
          <div className="section-heading">
            <h2>Invoice details</h2>
            <span className="tag">USD</span>
          </div>
          <div className="detail-row">
            <span>Customer</span>
            <Link to={`/receivables/customers/${i.customer}`}>
              {customer?.name}
            </Link>
          </div>
          <div className="detail-row">
            <span>Issued / due</span>
            <strong>
              {i.date} / {i.due}
            </strong>
          </div>
          <div className="invoice-items">
            {(
              i.lineItems || [
                { description: i.description, quantity: 1, rate: i.amount },
              ]
            ).map((l, n) => (
              <div className="detail-row" key={n}>
                <span>
                  {l.description}
                  <small>
                    {l.quantity} × {money(l.rate)}
                  </small>
                </span>
                <strong>{money(l.quantity * l.rate)}</strong>
              </div>
            ))}
          </div>
          <div className="detail-row">
            <span>Invoice total</span>
            <strong>{money(i.amount)}</strong>
          </div>
          <div className="detail-row">
            <span>Receipts applied</span>
            <strong>{money(i.paid)}</strong>
          </div>
          <div className="detail-row total-row">
            <span>Balance due</span>
            <strong>{money(remaining)}</strong>
          </div>
          <p className="muted">
            Demo receipts are recorded on the invoice date. No real payment or
            email is sent.
          </p>
          <h3>Linked journals</h3>
          {s.journals
            .filter((j) => j.source === id)
            .map((j) => (
              <Link
                className="list-link"
                key={j.id}
                to={`/accounting/journals/${j.id}`}
              >
                {j.id}
                <Badge>{j.status}</Badge>
              </Link>
            ))}
        </div>
        <DocumentPreview
          title={i.id}
          amount={i.amount}
          party={customer?.name}
        />
      </div>
      {edit && <InvoiceEditor existing={i} onClose={() => setEdit(false)} />}
      <Modal
        open={receipt}
        onOpenChange={setReceipt}
        title="Apply demo receipt"
      >
        <p>
          No payment will be collected. This updates local cash and receivables.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (
              !amountPattern.test(amount) ||
              toCents(amount) <= 0 ||
              toCents(amount) > remaining
            )
              return;
            dispatch(
              command({
                kind: "invoiceStep",
                id: i.id,
                step: "receipt",
                amount: toCents(amount),
              }),
            );
            toast("Demo receipt applied; balances updated");
            setReceipt(false);
          }}
        >
          <Field label="Receipt amount (USD)">
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              inputMode="decimal"
            />
          </Field>
          {(!amountPattern.test(amount) ||
            toCents(amount) <= 0 ||
            toCents(amount) > remaining) && (
            <p className="error">
              Enter a positive amount up to {money(remaining)}.
            </p>
          )}
          <div className="dialog-actions">
            <button
              className="primary"
              disabled={
                !amountPattern.test(amount) ||
                toCents(amount) <= 0 ||
                toCents(amount) > remaining
              }
            >
              Record demo receipt
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
export function Parties({ vendor = false }: { vendor?: boolean }) {
  const s = useDemo(),
    navigate = useNavigate(),
    parties = vendor ? s.vendors : s.customers;
  const data = parties
    .filter((p) => p.entity === s.entity)
    .map((p) => ({
      ...p,
      balance: vendor
        ? s.bills
            .filter(
              (b) =>
                b.vendor === p.id && inScope(s, b) && b.status === "Approved",
            )
            .reduce((v, b) => v + b.amount, 0)
        : s.invoices
            .filter(
              (i) =>
                i.customer === p.id && inScope(s, i) && i.status !== "Draft",
            )
            .reduce((v, i) => v + i.amount - i.paid, 0),
    }));
  return (
    <>
      <PageHeader
        title={vendor ? "Vendors" : "Customers"}
        description={
          vendor
            ? "Your suppliers, balances, and bill history."
            : "Relationships, outstanding balances, and billing history."
        }
      />
      <DataTable
        name={vendor ? "vendors" : "customers"}
        data={data}
        onRow={(p) =>
          navigate(
            `${vendor ? "/payables/vendors" : "/receivables/customers"}/${p.id}`,
          )
        }
        columns={[
          { key: "name", label: vendor ? "Vendor" : "Customer" },
          { key: "contact", label: "Contact" },
          { key: "email", label: "Email" },
          {
            key: "balance",
            label: "Period outstanding",
            numeric: true,
            render: (p) => <MoneyCell value={p.balance} />,
          },
        ]}
      />
    </>
  );
}
export function PartyDetail({ vendor = false }: { vendor?: boolean }) {
  const { id } = useParams(),
    s = useDemo(),
    p = (vendor ? s.vendors : s.customers).find(
      (p) => p.id === id && p.entity === s.entity,
    );
  if (!p) return <Missing label={vendor ? "Vendor" : "Customer"} />;
  return (
    <>
      <Back
        to={vendor ? "/payables/vendors" : "/receivables/customers"}
        label={vendor ? "Vendors" : "Customers"}
      />
      <PageHeader title={p.name} description={p.email} />
      <div className="detail-columns">
        <section className="panel">
          <h2>Contact profile</h2>
          <div className="detail-row">
            <span>Primary contact</span>
            <strong>{p.contact}</strong>
          </div>
          <div className="detail-row">
            <span>Email</span>
            <span>{p.email}</span>
          </div>
          <div className="detail-row">
            <span>Entity</span>
            <span>{s.entities.find((e) => e.id === p.entity)?.name}</span>
          </div>
          <h3>Linked contracts</h3>
          {!vendor &&
            s.contracts
              .filter((c) => c.customer === id)
              .map((c) => (
                <Link
                  key={c.id}
                  className="list-link"
                  to={`/revenue/contracts/${c.id}`}
                >
                  {c.name}
                  <ArrowUpRight size={14} />
                </Link>
              ))}
          {(vendor || !s.contracts.some((c) => c.customer === id)) && (
            <p className="muted">No linked contracts.</p>
          )}
        </section>
        <section className="panel">
          <h2>{vendor ? "Bill" : "Invoice"} history</h2>
          {vendor
            ? s.bills
                .filter((b) => b.vendor === id)
                .map((b) => (
                  <Link
                    className="list-link"
                    to={`/payables/bills/${b.id}`}
                    key={b.id}
                  >
                    <span>
                      {b.id} · {b.date}
                    </span>
                    <strong>{money(b.amount)}</strong>
                    <Badge>{b.status}</Badge>
                  </Link>
                ))
            : s.invoices
                .filter((i) => i.customer === id)
                .map((i) => (
                  <Link
                    className="list-link"
                    to={`/receivables/invoices/${i.id}`}
                    key={i.id}
                  >
                    <span>
                      {i.id} · {i.date}
                    </span>
                    <strong>{money(i.amount - i.paid)} due</strong>
                    <Badge>{i.status}</Badge>
                  </Link>
                ))}
        </section>
      </div>
    </>
  );
}
export function Bills() {
  const s = useDemo(),
    navigate = useNavigate(),
    [params, setParams] = useSearchParams(),
    status = params.get("status") || "All";
  return (
    <>
      <PageHeader
        title="Bills"
        description="Review documents, code expenses, and keep approvals on track."
        action={<span className="tag">Local document inbox</span>}
      />
      <Tabs
        options={["All", "Inbox", "In review", "Approved", "Paid"]}
        value={status}
        onChange={(v) => {
          const p = new URLSearchParams(params);
          p.set("status", v);
          p.delete("q");
          setParams(p);
        }}
      />
      <DataTable
        name="bills"
        data={s.bills
          .filter(
            (b) => inScope(s, b) && (status === "All" || b.status === status),
          )
          .map((b) => ({
            ...b,
            vendorName: s.vendors.find((v) => v.id === b.vendor)?.name || "",
          }))}
        onRow={(b) => navigate(`/payables/bills/${b.id}`)}
        columns={[
          { key: "id", label: "Bill" },
          { key: "vendorName", label: "Vendor" },
          { key: "date", label: "Date" },
          { key: "due", label: "Due date" },
          { key: "department", label: "Department" },
          {
            key: "status",
            label: "Status",
            render: (b) => <Badge>{b.status}</Badge>,
          },
          {
            key: "amount",
            label: "Amount",
            numeric: true,
            render: (b) => <MoneyCell value={b.amount} />,
          },
        ]}
      />
    </>
  );
}
export function BillDetail() {
  const { id } = useParams(),
    s = useDemo(),
    dispatch = useAppDispatch(),
    toast = useToast();
  const b = s.bills.find((b) => b.id === id && b.entity === s.entity);
  if (!b) return <Missing label="Bill" />;
  const locked = s.locked.includes(`${s.entity}:${b.date.slice(0, 7)}`);
  return (
    <>
      <Back to="/payables/bills" label="Bills" />
      <PageHeader
        title={b.id}
        description={s.vendors.find((v) => v.id === b.vendor)?.name}
        action={
          <>
            <Badge>{b.status}</Badge>
            {b.amount >= s.approvalThreshold && (
              <span className="tag">High value</span>
            )}
            {!locked &&
              (b.status === "Inbox" ? (
                <Permission>
                  <button
                    className="primary"
                    onClick={() => {
                      dispatch(
                        command({ kind: "billStep", id: b.id, step: "submit" }),
                      );
                      toast("Bill submitted for review");
                    }}
                  >
                    Submit bill
                  </button>
                </Permission>
              ) : b.status === "In review" ? (
                <Permission review>
                  <button
                    className="primary"
                    onClick={() => {
                      dispatch(
                        command({
                          kind: "billStep",
                          id: b.id,
                          step: "approve",
                        }),
                      );
                      toast("Bill approved and expense recorded");
                    }}
                  >
                    Approve bill
                  </button>
                </Permission>
              ) : b.status === "Approved" ? (
                <Permission>
                  <button
                    onClick={() => {
                      dispatch(
                        command({ kind: "billStep", id: b.id, step: "pay" }),
                      );
                      toast("Demo payment recorded");
                    }}
                  >
                    Record demo payment
                  </button>
                </Permission>
              ) : null)}
          </>
        }
      />
      <div className="detail-columns">
        <DocumentPreview
          title={b.id}
          amount={b.amount}
          party={s.vendors.find((v) => v.id === b.vendor)?.name}
        />
        <section className="panel">
          <h2>Bill coding</h2>
          <Field label="Expense account">
            <select
              value={b.account}
              disabled={b.status !== "Inbox" || s.role === "Reviewer" || locked}
              onChange={(e) =>
                dispatch(
                  command({
                    kind: "billCode",
                    id: b.id,
                    account: e.target.value,
                  }),
                )
              }
            >
              {s.accounts
                .filter((a) => a.active && a.type === "Expense")
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.id} · {a.name}
                  </option>
                ))}
            </select>
          </Field>
          <div className="detail-row">
            <span>Vendor</span>
            <Link to={`/payables/vendors/${b.vendor}`}>View profile</Link>
          </div>
          <div className="detail-row">
            <span>Department</span>
            <strong>{b.department}</strong>
          </div>
          <div className="detail-row">
            <span>Amount</span>
            <strong>{money(b.amount)}</strong>
          </div>
          <div className="detail-row">
            <span>Due date</span>
            <strong>{b.due}</strong>
          </div>
          <h3>Approval activity</h3>
          {s.audit
            .filter((a) => a.object === b.id)
            .map((a) => (
              <div className="activity-item" key={a.id}>
                <div>
                  <strong>{a.action}</strong>
                  <p>{a.actor}</p>
                </div>
              </div>
            ))}
          <Link className="inline-link" to={`/audit-log?q=${b.id}`}>
            Inspect full activity
          </Link>
          <h3>Source journals</h3>
          {s.journals
            .filter((j) => j.source === id)
            .map((j) => (
              <Link
                className="list-link"
                key={j.id}
                to={`/accounting/journals/${j.id}`}
              >
                {j.id}
                <Badge>{j.status}</Badge>
              </Link>
            ))}
        </section>
      </div>
    </>
  );
}
export function Contracts() {
  const s = useDemo(),
    navigate = useNavigate();
  return (
    <>
      <PageHeader
        title="Contracts"
        description="Customer agreements and their billing commitments."
      />
      <DataTable
        name="contracts"
        data={s.contracts.filter((c) => c.entity === s.entity)}
        onRow={(c) => navigate(`/revenue/contracts/${c.id}`)}
        columns={[
          { key: "id", label: "Contract" },
          { key: "name", label: "Agreement" },
          { key: "start", label: "Start date" },
          { key: "end", label: "End date" },
          {
            key: "monthly",
            label: "Monthly commitment",
            numeric: true,
            render: (c) => <MoneyCell value={c.monthly} />,
          },
        ]}
      />
    </>
  );
}
export function ContractDetail() {
  const { id } = useParams(),
    s = useDemo(),
    c = s.contracts.find((c) => c.id === id && c.entity === s.entity);
  if (!c) return <Missing label="Contract" />;
  return (
    <>
      <Back to="/revenue/contracts" label="Contracts" />
      <PageHeader
        title={c.name}
        description={`${c.id} · Annual platform agreement`}
      />
      <div className="detail-columns">
        <section className="panel">
          <h2>Agreement summary</h2>
          <div className="detail-row">
            <span>Customer</span>
            <Link to={`/receivables/customers/${c.customer}`}>
              {s.customers.find((p) => p.id === c.customer)?.name}
            </Link>
          </div>
          <div className="detail-row">
            <span>Term</span>
            <strong>
              {c.start} – {c.end}
            </strong>
          </div>
          <div className="detail-row">
            <span>Billing terms</span>
            <strong>Monthly in arrears · Net 30</strong>
          </div>
          <div className="detail-row">
            <span>Platform subscription</span>
            <strong>{money(c.monthly)} / month</strong>
          </div>
          <div className="detail-row total-row">
            <span>Total committed</span>
            <strong>{money(c.monthly * c.months)}</strong>
          </div>
          <p className="muted">
            Contract commitments are forecasts. Only issued invoices recognize
            revenue in this monthly-billed demo.
          </p>
          <Link className="button" to={`/revenue/schedules?contract=${c.id}`}>
            View recognition schedule
          </Link>
        </section>
        <DocumentPreview title={c.id} amount={c.monthly * c.months} />
      </div>
    </>
  );
}
export function Schedules() {
  const s = useDemo(),
    dispatch = useAppDispatch(),
    [params, setParams] = useSearchParams(),
    contract = params.get("contract") || "",
    selected = s.contracts.find(
      (c) => c.id === contract && c.entity === s.entity,
    );
  const contracts = s.contracts.filter(
    (c) => c.entity === s.entity && (!contract || c.id === contract),
  );
  return (
    <>
      <PageHeader
        title="Revenue schedules"
        description="Recognized invoice revenue and monthly contract commitments."
      />
      <div className="notice">
        Monthly-in-arrears fixture: deferred revenue is{" "}
        {money(balances(s, true)["2100"] ?? 0)}. Forecast commitments do not
        post to the ledger.
      </div>
      <section className="panel">
        <Field label="Contract">
          <select
            value={contract}
            onChange={(e) =>
              setParams(e.target.value ? { contract: e.target.value } : {})
            }
          >
            <option value="">All contracts</option>
            {s.contracts
              .filter((c) => c.entity === s.entity)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </Field>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Schedule</th>
                {periods.map((p) => (
                  <th className="numeric" key={p}>
                    {p}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Recognized revenue {selected ? "· customer" : ""}</td>
                {periods.map((p) => (
                  <td key={p} className="numeric">
                    <Link
                      to={`/accounting/ledger?account=4000${selected ? "&q=" + encodeURIComponent(s.customers.find((c) => c.id === selected.customer)?.name || "") : ""}`}
                      onClick={() =>
                        dispatch(command({ kind: "scope", period: p }))
                      }
                    >
                      {money(
                        ledger({ ...s, period: p })
                          .filter(
                            (l) =>
                              l.account === "4000" &&
                              (!selected ||
                                s.invoices.some(
                                  (i) =>
                                    i.id === l.source &&
                                    i.customer === selected.customer,
                                )),
                          )
                          .reduce((v, l) => v + l.credit - l.debit, 0),
                      )}
                    </Link>
                  </td>
                ))}
              </tr>
              {contracts.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link to={`/revenue/contracts/${c.id}`}>{c.name}</Link>
                    <small>Forecast commitment</small>
                  </td>
                  {periods.map((p) => (
                    <td key={p} className="numeric">
                      {money(c.monthly)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
export function BankAccounts() {
  const s = useDemo(),
    b = balances(s, true);
  return (
    <>
      <PageHeader
        title="Bank accounts"
        description="A local snapshot of your operating cash. No live bank connection."
        action={
          <Link className="button primary" to="/integrations">
            Manage demo connections
          </Link>
        }
      />
      <div className="bank-grid">
        {[
          { id: "1000", name: "Operating account", last: "4821" },
          { id: "1010", name: "Savings account", last: "9073" },
        ].map((a) => (
          <section className="panel bank-card" key={a.id}>
            <div className="section-heading">
              <span className="bank-logo">
                <Landmark size={23} />
              </span>
              <Badge>
                {s.integrations.includes("Mercury (demo)")
                  ? "Connected · demo"
                  : "Disconnected"}
              </Badge>
            </div>
            <p className="muted">Mercury ·•• {a.last}</p>
            <h2>{a.name}</h2>
            <strong className="bank-balance">{money(b[a.id] ?? 0)}</strong>
            <p className="muted">USD · Closing book balance</p>
            <hr />
            <p>Last fixture refresh · Sep 30, 2026</p>
            <Link
              className="inline-link"
              to={
                a.id === "1000"
                  ? "/banking/reconciliation"
                  : `/accounting/ledger?account=${a.id}`
              }
            >
              {a.id === "1000"
                ? "Reconcile transactions"
                : "View account activity"}
              <ArrowUpRight size={15} />
            </Link>
          </section>
        ))}
      </div>
    </>
  );
}
export function Reconciliation() {
  const s = useDemo(),
    dispatch = useAppDispatch(),
    toast = useToast(),
    [selected, setSelected] = useState<string>(),
    [status, setStatus] = useState("All");
  const items = s.bank.filter((b) => inScope(s, b)),
    item = items.find((b) => b.id === selected),
    candidate = s.journals.find((j) => j.id === item?.candidate),
    candidateAmount =
      candidate?.lines
        .filter((l) => l.account === "1000")
        .reduce((v, l) => v + l.debit - l.credit, 0) ?? 0;
  return (
    <>
      <PageHeader
        title="Reconciliation"
        description="Compare September statement fixtures with posted book transactions."
      />
      <div className="mini-metrics">
        <div>
          <small>Statement total</small>
          <strong>{money(items.reduce((v, b) => v + b.amount, 0))}</strong>
        </div>
        <div>
          <small>Matched statement amount</small>
          <strong>
            {money(
              items.filter((b) => b.matched).reduce((v, b) => v + b.amount, 0),
            )}
          </strong>
        </div>
        <div>
          <small>Unreconciled amount</small>
          <strong>
            {money(
              items.filter((b) => !b.matched).reduce((v, b) => v + b.amount, 0),
            )}
          </strong>
        </div>
      </div>
      <Tabs
        options={["All", "Unmatched", "Matched"]}
        value={status}
        onChange={setStatus}
      />
      <DataTable
        name="bank transactions"
        data={items.filter(
          (b) => status === "All" || b.matched === (status === "Matched"),
        )}
        onRow={(b) => setSelected(b.id)}
        columns={[
          { key: "description", label: "Statement transaction" },
          { key: "date", label: "Date" },
          {
            key: "matched",
            label: "Status",
            render: (b) => <Badge>{b.matched ? "Matched" : "Unmatched"}</Badge>,
          },
          {
            key: "amount",
            label: "Amount",
            numeric: true,
            render: (b) => <MoneyCell value={b.amount} />,
          },
        ]}
      />
      <Modal
        open={!!item}
        onOpenChange={(v) => !v && setSelected(undefined)}
        title="Match bank transaction"
        drawer
      >
        {item && (
          <>
            <div className="match-card">
              <small>Statement fixture</small>
              <h3>{item.description}</h3>
              <strong>{money(item.amount)}</strong>
              <p>{item.date}</p>
            </div>
            <div className="match-connector">
              <Link2 />
            </div>
            <div className="match-card">
              <small>Suggested ledger match</small>
              {candidate ? (
                <>
                  <Link to={`/accounting/journals/${candidate.id}`}>
                    {candidate.id}
                  </Link>
                  <p>{candidate.memo}</p>
                  <strong>{money(candidateAmount)}</strong>
                </>
              ) : (
                <Empty title="No candidate found" />
              )}
            </div>
            <div className="detail-row">
              <span>Match difference</span>
              <strong>{money(item.amount - candidateAmount)}</strong>
            </div>
            <div className="dialog-actions">
              <Permission>
                <button
                  className="primary"
                  disabled={!candidate || candidateAmount !== item.amount}
                  onClick={() => {
                    dispatch(
                      command({
                        kind: "bankMatch",
                        id: item.id,
                        matched: !item.matched,
                      }),
                    );
                    toast(
                      item.matched
                        ? "Match removed"
                        : "Statement transaction matched",
                    );
                  }}
                >
                  {item.matched ? <Unlink size={15} /> : <Check size={15} />}{" "}
                  {item.matched ? "Unmatch transaction" : "Confirm match"}
                </button>
              </Permission>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
