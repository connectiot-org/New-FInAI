import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowUpRight, FileText, Upload } from "lucide-react";
import { Field, Modal } from "../ui";
import { useAppDispatch, useDemo, command } from "../../store";
import { money } from "../../demo/selectors";
import { periods } from "../../demo/seed";
export { PageHeader } from "./PageHeader";
export function Tabs({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="tabs" role="tablist">
      {options.map((v) => (
        <button
          key={v}
          role="tab"
          aria-selected={v === value}
          className={v === value ? "active" : ""}
          onClick={() => onChange(v)}
        >
          {v}
        </button>
      ))}
    </div>
  );
}
export function PeriodSelector() {
  const s = useDemo(),
    dispatch = useAppDispatch();
  return (
    <select
      aria-label="Accounting period"
      value={s.period}
      onChange={(e) =>
        dispatch(command({ kind: "scope", period: e.target.value }))
      }
    >
      <option value="all">Apr – Sep 2026</option>
      {periods.map((p) => (
        <option key={p} value={p}>
          {new Date(`${p}-02`).toLocaleDateString("en-US", {
            month: "long",
            year: "numeric",
          })}
        </option>
      ))}
    </select>
  );
}
export function MoneyCell({ value }: { value: number }) {
  return <span className="money">{money(value)}</span>;
}
export function Metric({
  label,
  value,
  note,
  to,
  trend,
}: {
  label: string;
  value: number;
  note: string;
  to: string;
  trend?: string;
}) {
  return (
    <Link to={to} className="metric">
      <div className="metric-label">
        {label}
        <ArrowUpRight size={15} />
      </div>
      <strong>{money(value)}</strong>
      <div className="metric-note">
        {trend && <span>{trend}</span>}
        {note}
      </div>
    </Link>
  );
}
export function Back({ to, label }: { to: string; label: string }) {
  return (
    <Link className="back-link" to={to}>
      <ArrowLeft size={14} />
      {label}
    </Link>
  );
}
export function Missing({ label = "Record" }: { label?: string }) {
  const navigate = useNavigate();
  return (
    <div className="empty">
      <FileText />
      <h2>{label} not found in this entity</h2>
      <p>It may belong to another entity or the demo has been reset.</p>
      <button onClick={() => navigate("/overview")}>Return to overview</button>
    </div>
  );
}
export function DocumentPreview({
  title,
  amount,
  party,
  onEvidence,
}: {
  title: string;
  amount?: number;
  party?: string;
  onEvidence?: (name: string) => void;
}) {
  const [url, setUrl] = useState(""),
    [name, setName] = useState(""),
    [error, setError] = useState("");
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  return (
    <section className="document">
      <div className="section-heading">
        <h3>Document preview</h3>
        <span className="tag">Local only</span>
      </div>
      <Field label="Attach local PDF or image">
        <input
          type="file"
          accept="application/pdf,image/png,image/jpeg"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            if (
              !["application/pdf", "image/png", "image/jpeg"].includes(
                f.type,
              ) ||
              f.size > 10 * 1024 * 1024
            ) {
              setError("Choose a PDF, PNG or JPG under 10 MB.");
              return;
            }
            setError("");
            setName(f.name);
            setUrl(URL.createObjectURL(f));
            onEvidence?.(f.name);
          }}
        />
      </Field>
      {error && <p className="error">{error}</p>}
      {url ? (
        <>
          <p className="muted">{name} · preview lasts for this session</p>
          {name.toLowerCase().endsWith(".pdf") ? (
            <iframe title="Local PDF preview" src={url} />
          ) : (
            <img alt="Local attachment preview" src={url} />
          )}
        </>
      ) : (
        <div className="document-paper">
          <div className="wordmark">
            northstar<span> / analytics</span>
          </div>
          <p className="eyebrow">SYNTHETIC DEMO DOCUMENT</p>
          <h3>{title}</h3>
          <p>{party || "Northstar Analytics"}</p>
          <hr />
          <div className="detail-row">
            <span>Platform services</span>
            <strong>{money(amount ?? 0)}</strong>
          </div>
          <p className="muted">
            This fixture is a visual sample. Upload a local document to preview
            it here. Document contents are never sent to a server.
          </p>
          <Upload size={22} />
        </div>
      )}
    </section>
  );
}
export function Help() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Help & shortcuts</button>
      <Modal
        title="Your FinAI demo workspace"
        open={open}
        onOpenChange={setOpen}
      >
        <p>
          All records and actions stay in this browser. No bank, payment or AI
          services are connected.
        </p>
        <p>
          Use the entity and period selectors to scope reports. Switch demo
          roles under your profile. Reset the workspace in Settings →
          Preferences.
        </p>
        <p>
          Keyboard: Tab moves between controls, Enter activates, Escape closes
          dialogs. Every table supports column sorting, search, selection and
          CSV export.
        </p>
      </Modal>
    </>
  );
}
