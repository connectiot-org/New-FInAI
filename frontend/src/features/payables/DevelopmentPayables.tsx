/** Public invoice sample shell. Its local roles and client never authorize company API access. */
import { useMemo, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import {
  ArrowUpLeft,
  BookOpen,
  Building2,
  ChevronRight,
  Download,
  FileText,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import { BrandMark } from "../../components/shared/BrandMark";
import { WorkspaceViewContext } from "../workspace/context";
import { PayablesClientContext } from "./api";
import { Payables } from "./Payables";
import {
  developmentActors,
  developmentClient,
  developmentCompany,
  resetDevelopment,
} from "./development-store";

export function DevelopmentPayables() {
  const navigate = useNavigate();
  const [actor, setActor] = useState(0),
    [generation, setGeneration] = useState(0),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const client = useMemo(() => developmentClient(actor), [actor]);
  const workspace = useMemo(
    () => ({
      userId: developmentActors[actor].id,
      organisationId: developmentCompany,
      organisationName: "Sample workspace",
      administrator: false,
      revision: (actor + 1).toString().repeat(64),
      entities: [
        {
          id: developmentCompany,
          name: "Sample company",
          canWrite: false,
          canImport: false,
        },
      ],
    }),
    [actor],
  );
  return (
    <div className="invoice-workspace">
      <aside className="invoice-sidebar" aria-label="Invoice workspace sidebar">
        <Link className="brand invoice-brand" to="/">
          <BrandMark />
          FinAI
        </Link>
        <div className="invoice-organization">
          <Building2 size={19} aria-hidden="true" />
          <div>
            <strong>Sample company</strong>
            <span>Finance workspace</span>
          </div>
        </div>
        <span className="invoice-nav-label">WORKSPACE</span>
        <nav aria-label="Invoice workspace">
          {[
            { path: "/invoices", label: "Invoices", Icon: FileText },
            { path: "/suppliers", label: "Suppliers", Icon: Users },
            { path: "/export", label: "Accounting export", Icon: Download },
            {
              path: "/settings/approvals",
              label: "Approval settings",
              Icon: SlidersHorizontal,
            },
          ].map(({ path, label, Icon }) => (
            <NavLink key={path} to={"/demo/payables" + path}>
              <Icon size={18} aria-hidden="true" />
              <span>{label}</span>
              <ChevronRight
                size={14}
                className="invoice-nav-arrow"
                aria-hidden="true"
              />
            </NavLink>
          ))}
        </nav>
        <div className="invoice-sidebar-footer">
          <details className="invoice-guide">
            <summary>
              <BookOpen size={17} aria-hidden="true" />
              Invoice guide
            </summary>
            <ol>
              <li>Add a supplier and invoice details.</li>
              <li>Attach the original supplier PDF.</li>
              <li>Review, verify and approve with the assigned roles.</li>
              <li>Prepare the accounting export.</li>
            </ol>
          </details>
          <div className="invoice-storage-note">
            <ShieldCheck size={17} aria-hidden="true" />
            <span>
              Sample data stays in this browser.
              <br />
              Use sample documents only.
            </span>
          </div>
        </div>
      </aside>
      <header className="invoice-workspace-header">
        <div className="invoice-breadcrumb">
          <Link className="brand invoice-mobile-brand" to="/">
            <BrandMark />
            FinAI
          </Link>
          <span>Payables</span>
          <ChevronRight size={14} aria-hidden="true" />
          <strong>Supplier invoices</strong>
        </div>
        <Link to="/" className="invoice-back-home">
          <ArrowUpLeft size={15} aria-hidden="true" />
          Back to FinAI
        </Link>
      </header>
      <main className="invoice-workspace-main" id="invoice-workspace-content">
        <section className="ap-development" aria-label="Development preview">
          <div className="invoice-sample-copy">
            <span className="invoice-environment">
              <span />
              Sample workspace
            </span>
            <p>Changes are saved in this browser. Use sample PDFs only.</p>
          </div>
          <label>
            View as
            <select
              aria-label="Development role"
              value={actor}
              disabled={busy}
              onChange={(e) => {
                if (
                  document.querySelector(".ap-root dialog[open]") &&
                  !confirm("Switch roles and discard unsaved invoice changes?")
                )
                  return;
                setActor(Number(e.target.value));
              }}
            >
              {developmentActors.map((a, i) => (
                <option value={i} key={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <button
            aria-label="Reset preview"
            title="Reset sample data"
            disabled={busy}
            onClick={async () => {
              if (
                !confirm(
                  "Reset the sample invoices, suppliers, documents and policies saved in this browser?",
                )
              )
                return;
              setBusy(true);
              setError("");
              try {
                await resetDevelopment();
                setActor(0);
                setGeneration((g) => g + 1);
                navigate("/demo/payables/invoices");
              } catch {
                setError("Could not reset this browser’s sample data.");
              } finally {
                setBusy(false);
              }
            }}
          >
            <RotateCcw size={15} aria-hidden="true" />
            <span>Reset sample</span>
          </button>
          {error && <p role="alert">{error}</p>}
        </section>
        <WorkspaceViewContext.Provider value={workspace}>
          <PayablesClientContext.Provider value={client}>
            <Payables key={`${actor}:${generation}`} />
          </PayablesClientContext.Provider>
        </WorkspaceViewContext.Provider>
      </main>
    </div>
  );
}
