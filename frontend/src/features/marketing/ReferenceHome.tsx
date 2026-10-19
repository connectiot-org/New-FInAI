import { BrandMark } from "../../components/shared/BrandMark";
import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Bell,
  BookOpen,
  Building2,
  Check,
  CheckSquare,
  ChevronDown,
  CirclePlay,
  FileCheck2,
  History,
  Home,
  Layers,
  ListChecks,
  Menu,
  Receipt,
  Search,
  ShieldCheck,
  Sparkles,
  Wallet,
} from "lucide-react";
import { FinanceSnapshot } from "../../components/shared/FinanceSnapshot";
import { useDemo } from "../../store";
import {
  balances,
  ledger,
  metrics,
  money,
  shortMoney,
} from "../../demo/selectors";
import { Modal } from "../../components/ui";
import { ProductPreview } from "./ProductPreview";
import type { PreviewView } from "./content";

const platform = [
  {
    title: (
      <>
        FinAI
        <br />
        Intelligence
      </>
    ),
    description: "Put the demo books to work",
    kind: "intelligence",
    to: "/product/assistant",
  },
  {
    title: (
      <>
        Perpetual
        <br />
        general ledger
      </>
    ),
    description: "One connected, traceable system of record",
    kind: "ledger",
    to: "/product/automated-general-ledger",
  },
  {
    title: (
      <>
        Revenue
        <br />
        recognition
      </>
    ),
    description: "Contracts, schedules, and posted revenue",
    kind: "revenue",
    to: "/product/advanced-revenue-recognition",
  },
  {
    title: (
      <>
        Native
        <br />
        integrations
      </>
    ),
    description: "Explore a simulated connected stack",
    kind: "integrations",
    to: "/product/native-integrations",
  },
  {
    title: (
      <>
        Multi-entity &<br />
        group reporting
      </>
    ),
    description: "Separate books. Shared view.",
    kind: "entities",
    to: "/product/multi-entity",
  },
  {
    title: (
      <>
        Close
        <br />
        management
      </>
    ),
    description: "Bring your close together.",
    kind: "close",
    to: "/product/month-end-close",
  },
  {
    title: (
      <>
        Real-time
        <br />
        reporting
      </>
    ),
    description: "Trace every number to its source",
    kind: "reporting",
    to: "/product/real-time-reporting",
  },
  {
    title: (
      <>
        Roles and
        <br />
        review controls
      </>
    ),
    description: "Local roles, reviews, and audit activity",
    kind: "security",
    to: "/product/security-permissions",
  },
];
const journeys = [
  {
    title: "Follow a number",
    description:
      "Filter the ledger, open a journal, then inspect its source record.",
    view: "ledger" as PreviewView,
    to: "/accounting/ledger",
    icon: BookOpen,
  },
  {
    title: "Bring a close together",
    description:
      "Add evidence, request a review, and approve a close task locally.",
    view: "close" as PreviewView,
    to: "/close",
    icon: CheckSquare,
  },
  {
    title: "Ask a demo question",
    description:
      "Explore deterministic answers, linked evidence, and explicit local approval.",
    view: "assistant" as PreviewView,
    to: "/assistant",
    icon: Sparkles,
  },
];
export function ReferenceWalkthrough({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [step, setStep] = useState(0);
  const current = journeys[step];
  return (
    <Modal
      title="A closer look at FinAI"
      open={open}
      onOpenChange={onOpenChange}
    >
      <p className="reference-tour-note">
        Choose a workflow and follow its records, reviews, and next steps in the
        fictional Northstar Analytics workspace.
      </p>
      <div className="reference-tour-tabs">
        {journeys.map((j, i) => (
          <button
            key={j.title}
            aria-pressed={step === i}
            onClick={() => setStep(i)}
          >
            <j.icon size={18} />
            {j.title}
          </button>
        ))}
      </div>
      <div className="reference-tour-body">
        <h3>{current.title}</h3>
        <p>{current.description}</p>
        <Link
          className="button primary"
          to={current.to}
          onClick={() => onOpenChange(false)}
        >
          Start this walkthrough
          <ArrowRight size={14} />
        </Link>
      </div>
    </Modal>
  );
}
function HeroWorkspace() {
  return (
    <div className="reference-workspace">
      <aside className="reference-rail">
        <Link
          to="/overview"
          className="reference-rail-logo"
          aria-label="Open FinAI overview"
        >
          <BrandMark />
        </Link>
        {[
          {
            to: "/accounting/ledger",
            icon: Search,
            label: "Search the ledger",
          },
          { to: "/overview", icon: Home, label: "Overview" },
          { to: "/assistant", icon: Sparkles, label: "FinAI Assistant" },
          { to: "/receivables/invoices", icon: Receipt, label: "Invoices" },
          { to: "/payables/bills", icon: Wallet, label: "Bills" },
          {
            to: "/accounting/journals",
            icon: BookOpen,
            label: "Journal entries",
          },
          { to: "/reports", icon: Layers, label: "Reports" },
          { to: "/close", icon: ListChecks, label: "Close checklist" },
        ].map((l) => (
          <Link key={l.to} to={l.to} aria-label={l.label} title={l.label}>
            <l.icon size={14} />
          </Link>
        ))}
        <div className="reference-rail-bottom">
          <Link to="/audit-log" aria-label="Audit log">
            <History size={13} />
          </Link>
          <Link
            to="/settings/notifications"
            aria-label="Notification preferences"
          >
            <Bell size={13} />
          </Link>
          <Link
            className="reference-profile"
            to="/settings/members"
            aria-label="Demo personas"
          >
            AM
          </Link>
        </div>
      </aside>
      <div className="reference-dashboard">
        <div className="reference-dashboard-tools">
          <span>Local demo</span>
          <span>M</span>
          <span>S</span>
          <span>G</span>
          <Link to="/settings/preferences" aria-label="Demo preferences">
            <Menu size={11} />
          </Link>
        </div>
        <FinanceSnapshot compact />
      </div>
    </div>
  );
}
function PlatformArt({ kind }: { kind: string }) {
  const s = useDemo(),
    m = metrics(s),
    b = balances(s),
    tasks = s.tasks.filter(
      (t) =>
        t.entity === s.entity &&
        t.due.startsWith(s.period === "all" ? "2026-09" : s.period),
    );
  if (kind === "intelligence")
    return (
      <div className="platform-art intelligence-art">
        <span>
          <Sparkles size={49} />
        </span>
      </div>
    );
  if (kind === "integrations" || kind === "security")
    return (
      <div className={`platform-art orbit-art ${kind}`}>
        <i />
        <i />
        <i />
        <strong>
          <BrandMark />
        </strong>
        {(kind === "integrations"
          ? [
              "Banking",
              "Payments",
              "Expenses",
              "Payroll",
              "Notifications",
              "CRM",
            ]
          : ["Alex · Admin", "Taylor · Accountant", "Jordan · Reviewer"]
        ).map((name, i) => (
          <span key={name} className={`orbit-node node-${i}`}>
            {kind === "security" ? (
              <span className="orbit-person">{name[0]}</span>
            ) : null}
            {name}
          </span>
        ))}
      </div>
    );
  if (kind === "ledger")
    return (
      <div className="platform-art mini-ledger">
        <div className="mini-ledger-head">
          <b>
            <BrandMark />
          </b>
          <span>Welcome</span>
        </div>
        <div className="mini-ledger-metrics">
          <div>
            Revenue<strong>{shortMoney(m.revenue)}</strong>
          </div>
          <div>
            Cash balance<strong>{shortMoney(m.cash)}</strong>
          </div>
          <div>
            Receivables<strong>{shortMoney(m.receivables)}</strong>
          </div>
        </div>
        <h4>Workflow snapshot</h4>
        {ledger(s)
          .slice(0, 3)
          .map((l) => (
            <div className="mini-record" key={l.id}>
              <span>{l.journal}</span>
              <b>{money(l.debit || l.credit)}</b>
            </div>
          ))}
        <h4>Connected demo books</h4>
        <div className="mini-ledger-connections">
          <span>
            Banking
            <Check size={9} />
          </span>
          <span>
            Invoices
            <Check size={9} />
          </span>
        </div>
      </div>
    );
  if (kind === "revenue")
    return (
      <div className="platform-art mini-waterfall">
        <strong>Revenue waterfall</strong>
        <div className="mini-waterfall-head">
          <span>Customer</span>
          <span>Apr</span>
          <span>May</span>
          <span>Jun</span>
        </div>
        {s.customers
          .filter((c) => c.entity === s.entity)
          .slice(0, 5)
          .map((c) => (
            <div key={c.id}>
              <span>{c.name}</span>
              <i />
              <i />
              <i />
            </div>
          ))}
        <section>
          <strong>Deferred revenue</strong>
          <p>{money(b["2100"] || 0)} · Monthly billing fixture</p>
          <div>
            <i />
            <i />
            <i />
          </div>
        </section>
      </div>
    );
  if (kind === "entities")
    return (
      <div className="platform-art mini-entities">
        <div>
          <span>Apr – Sep</span>
          <b>US</b>
          <b>UK</b>
        </div>
        <h4>Revenue</h4>
        {s.entities.map((e) => (
          <div key={e.id}>
            <span>{e.name}</span>
            <strong>
              {shortMoney(metrics({ ...s, entity: e.id }).revenue)}
            </strong>
          </div>
        ))}
        <div className="mini-entity-total">
          <span>Functional currency</span>
          <b>USD</b>
        </div>
        <h4>Separate, connected books</h4>
        <div>
          <i />
          <i />
          <i />
        </div>
      </div>
    );
  if (kind === "close")
    return (
      <div className="platform-art mini-close">
        {tasks.slice(0, 6).map((t) => (
          <div key={t.id}>
            <span>{t.title}</span>
            <i />
            <b className={t.status === "Approved" ? "done" : ""}>
              {t.status === "Approved" ? (
                <Check size={11} />
              ) : (
                <ChevronDown size={9} />
              )}
            </b>
          </div>
        ))}
      </div>
    );
  return (
    <div className="platform-art mini-report">
      {s.accounts
        .filter((a) => a.type === "Expense")
        .slice(0, 6)
        .map((a) => (
          <div key={a.id}>
            <span>{a.id}</span>
            <strong>{a.name}</strong>
            <i />
            <b>{money(b[a.id] || 0)}</b>
          </div>
        ))}
      <span className="mini-report-shield">
        <ShieldCheck size={42} />
      </span>
    </div>
  );
}
const aiSections = [
  {
    id: "assistant",
    label: "FINAI ASSISTANT",
    title: "Ask anything",
    description:
      "Explore cash, revenue, open invoices, and close tasks. Supported demo answers link to the records behind the number.",
    to: "/assistant",
  },
  {
    id: "agents",
    label: "REVIEW WORKFLOWS",
    title: "Review repeatable work",
    description:
      "Set a trigger, choose an amount condition, and preview which local records a rule will flag before running it.",
    to: "/automations",
  },
  {
    id: "close",
    label: "CLOSE INSIGHTS",
    title: "Keep the whole close in view",
    description:
      "See tasks, evidence, owners, and reviews together. Your team decides when a task is complete and ready to approve.",
    to: "/close",
  },
  {
    id: "records",
    label: "LINKED RECORDS",
    title: "Follow the source",
    description:
      "Move from a financial statement to an account, journal, invoice, or bill in the same connected demo workspace.",
    to: "/reports",
  },
];
function AssistantIllustration({ index }: { index: number }) {
  const s = useDemo(),
    m = metrics(s);
  return (
    <div className={`ai-visual ai-visual-${index}`}>
      <div className="ai-visual-window">
        <div className="ai-example-question">
          {
            [
              "Which invoices are still outstanding?",
              "Review invoices above the threshold",
              "What is left on my close?",
              "Where does this cash balance come from?",
            ][index]
          }
        </div>
        <div className="ai-example-answer">
          <Sparkles size={26} />
          <div>
            <strong>
              {
                [
                  "Reviewing the local records",
                  "Previewing a local review rule",
                  "Opening the close checklist",
                  "Following the ledger evidence",
                ][index]
              }
            </strong>
            <p>
              {
                [
                  "Answers are grounded in synthetic fixture data.",
                  "Nothing runs before you explicitly choose to proceed.",
                  "Owners, evidence, and approvals stay connected.",
                  `Closing cash: ${money(m.cash)}.`,
                ][index]
              }
            </p>
          </div>
        </div>
        <div className="ai-example-composer">
          <span>Explore the demo…</span>
          <span>
            Demo responses
            <ChevronDown size={12} />
          </span>
          <i>
            <Sparkles size={17} />
          </i>
        </div>
      </div>
    </div>
  );
}
function WorkflowStories() {
  const [active, setActive] = useState(0);
  const s = useDemo(),
    invoice = s.invoices.find((i) => i.entity === s.entity)!;
  const stories = [
    {
      tag: "RECEIVABLES",
      title: "An invoice. A receipt. A clear trail.",
      description:
        "Open a customer invoice and trace the source journals. Apply a demo receipt to see the cash and receivable balances change together.",
      to: `/receivables/invoices/${invoice.id}`,
      label: "Open the invoice",
      icon: Receipt,
    },
    {
      tag: "ACCOUNTING",
      title: "A number with a source behind it.",
      description:
        "Follow every posted line to a journal, inspect its accounts, and see the local actions that shaped it in the audit log.",
      to: "/accounting/ledger",
      label: "Explore the ledger",
      icon: BookOpen,
    },
    {
      tag: "CLOSE",
      title: "Evidence stays with the work.",
      description:
        "Bring the checklist, supporting note, and review into one clear sequence. Approvals update the close progress across the demo.",
      to: "/close",
      label: "Open the close",
      icon: CheckSquare,
    },
  ];
  const story = stories[active];
  return (
    <section
      className="reference-stories reference-container"
      id="workflow-stories"
    >
      <div className="reference-heading">
        <span>04 WORKFLOWS</span>
        <h2>
          Workflows you can
          <br />
          try for yourself
        </h2>
      </div>
      <div
        className="reference-story-window"
        aria-live="polite"
        aria-atomic="true"
      >
        <div className="reference-story-art">
          <story.icon size={64} />
          <div className="story-trail">
            <span>Source record</span>
            <ArrowRight size={19} />
            <span>Journal</span>
            <ArrowRight size={19} />
            <span>Ledger</span>
            <Check size={19} />
          </div>
          <span>SYNTHETIC DEMO RECORDS</span>
        </div>
        <div className="reference-story-copy">
          <span>{story.tag} · LOCAL DEMO</span>
          <h3>{story.title}</h3>
          <p>{story.description}</p>
          <Link to={story.to}>
            {story.label}
            <ArrowUpRight size={15} />
          </Link>
        </div>
      </div>
      <div className="reference-story-controls">
        <span>0{active + 1} / 03</span>
        <button
          aria-label="Previous workflow"
          onClick={() => setActive((v) => (v + 2) % 3)}
        >
          <ArrowLeft size={17} />
        </button>
        <button
          aria-label="Next workflow"
          onClick={() => setActive((v) => (v + 1) % 3)}
        >
          <ArrowRight size={17} />
        </button>
      </div>
    </section>
  );
}
export function ReferenceHome() {
  const [tour, setTour] = useState(false);
  const s = useDemo();
  const companies = s.customers
    .filter((c) => c.entity === s.entity)
    .slice(0, 12);
  return (
    <div className="reference-home">
      <section className="reference-hero reference-grid-background">
        <div className="reference-container">
          <div className="reference-hero-copy">
            <div className="reference-proof">
              <span>
                <ShieldCheck size={17} />
                LOCAL DEMO
              </span>
              <span>Connected books. Fictional records.</span>
            </div>
            <div className="reference-hero-columns">
              <h1>
                Clearer books.
                <br />
                Closer together.
              </h1>
              <div>
                <p>
                  Explore a connected FinAI workspace to review the books,
                  follow the numbers, and bring your close together.
                </p>
                <Link to="/welcome" className="reference-button">
                  Explore the demo
                </Link>
              </div>
            </div>
          </div>
          <div className="reference-hero-art">
            <img src="/visuals/finai-city.svg" alt="" fetchPriority="high" />
            <div className="reference-hero-panel">
              <HeroWorkspace />
            </div>
          </div>
        </div>
      </section>
      <section className="reference-companies reference-container">
        <h2>Explore our fictional demo companies</h2>
        <div className="reference-company-grid">
          {companies.map((c, i) => (
            <Link
              to={`/receivables/customers/${c.id}`}
              className={
                i % 3 === 1
                  ? "company-geometric"
                  : i % 3 === 2
                    ? "company-bold"
                    : ""
              }
              key={c.id}
            >
              {
                [
                  <Layers size={21} />,
                  <Building2 size={20} />,
                  <Sparkles size={20} />,
                ][i % 3]
              }
              {c.name.replace(
                / (Analytics|Commerce|Systems|Learning|Logistics)$/,
                "",
              )}
            </Link>
          ))}
        </div>
        <p>
          Fictional names and original marks for sample records, not customer
          endorsements.
        </p>
      </section>
      <section
        className="reference-platform reference-grid-background"
        id="product-tour"
      >
        <div className="reference-container">
          <div className="reference-heading">
            <span>01 PLATFORM</span>
            <h2>
              Built for the details
              <br />
              behind every month-end close
            </h2>
            <p>
              Keep every entry traceable to its source, every review connected,
              and the next step in your close in view.
            </p>
          </div>
          <div className="reference-platform-grid">
            {platform.map((p) => (
              <Link to={p.to} className="reference-platform-card" key={p.kind}>
                <div>
                  <h3>{p.title}</h3>
                  <span className="platform-card-arrow">
                    <ArrowUpRight size={14} />
                  </span>
                  <p>{p.description}</p>
                </div>
                <div className="platform-art-frame">
                  <PlatformArt kind={p.kind} />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>
      <section className="reference-live-demo reference-container">
        <div>
          <h2>See the FinAI workspace in action</h2>
          <p>
            Explore a local walkthrough with connected accounting records and a
            complete audit trail.
          </p>
        </div>
        <button className="reference-button" onClick={() => setTour(true)}>
          <CirclePlay size={15} />
          Take a guided tour
        </button>
      </section>
      <section className="reference-ai" id="why-finai">
        <div className="reference-container">
          <div className="reference-ai-heading">
            <span>02 FINAI INTELLIGENCE</span>
            <h2>
              Offload the busy work.
              <br />
              Keep the control.
            </h2>
            <p>
              Explore local demo answers, review rules, and inspectable
              evidence. No live AI connection; every action stays under your
              control.
            </p>
          </div>
          <div className="reference-ai-body">
            <nav aria-label="FinAI intelligence capabilities">
              {aiSections.map((a) => (
                <a href={`#ai-${a.id}`} key={a.id}>
                  {a.label}
                </a>
              ))}
            </nav>
            <div>
              {aiSections.map((a, i) => (
                <article id={`ai-${a.id}`} key={a.id}>
                  <div>
                    <span>{a.label}</span>
                    <h3>{a.title}</h3>
                    <p>{a.description}</p>
                    <Link to={a.to}>
                      Explore this workflow
                      <ArrowUpRight size={13} />
                    </Link>
                  </div>
                  <AssistantIllustration index={i} />
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>
      <section className="reference-integrations reference-container reference-grid-background">
        <div className="reference-heading">
          <span>03 INTEGRATIONS</span>
          <h2>
            Bring the tools you use
            <br />
            into a connected workspace
          </h2>
          <p>
            Explore a simulated integration catalog. No accounts or credentials
            are connected.
          </p>
        </div>
        <div className="reference-integration-grid">
          {Array.from({ length: 51 }, (_, i) => {
            const categories: Record<
              number,
              { name: string; icon: typeof Wallet }
            > = {
              2: { name: "Banking", icon: Building2 },
              9: { name: "Payments", icon: Wallet },
              15: { name: "Expenses", icon: Receipt },
              29: { name: "Payroll", icon: FileCheck2 },
              38: { name: "CRM", icon: Layers },
              46: { name: "Notifications", icon: Bell },
            };
            const category = categories[i];
            return category ? (
              <Link
                key={i}
                to="/integrations"
                className="integration-tile"
                aria-label={`Explore ${category.name} demo integrations`}
              >
                <category.icon size={22} aria-hidden="true" />
              </Link>
            ) : (
              <div key={i} aria-hidden="true" />
            );
          })}
        </div>
        <div className="reference-integrations-more">
          <span>Want to see how connections work?</span>
          <Link to="/integrations">
            View all demo integrations
            <ArrowRight size={14} />
          </Link>
        </div>
      </section>
      <WorkflowStories />
      <div className="reference-workflow-badges reference-container">
        {[
          {
            label: "Balanced journals",
            to: "/accounting/trial-balance",
            icon: BookOpen,
          },
          {
            label: "Connected invoices",
            to: "/receivables/invoices",
            icon: Receipt,
          },
          {
            label: "Local approvals",
            to: "/payables/bills",
            icon: CheckSquare,
          },
          { label: "Reviewable actions", to: "/assistant", icon: Sparkles },
          { label: "Traceable history", to: "/audit-log", icon: FileCheck2 },
        ].map((v) => (
          <Link key={v.label} to={v.to}>
            <v.icon size={25} />
            <span>{v.label}</span>
            <small>DEMO WORKFLOW</small>
          </Link>
        ))}
      </div>
      <section className="reference-final-cta">
        <div className="reference-grid-background">
          <h2>Get one step closer to a clearer close</h2>
          <p>Connected books. Reviewable workflows. Numbers you can trace.</p>
          <div>
            <Link className="reference-button is-white" to="/welcome">
              Explore the demo
            </Link>
            <button
              className="reference-button is-outline"
              onClick={() => setTour(true)}
            >
              <CirclePlay size={14} />
              See it in action
            </button>
          </div>
        </div>
      </section>
      <ReferenceWalkthrough open={tour} onOpenChange={setTour} />
    </div>
  );
}

export function PreviewExplorer() {
  const [preview, setPreview] = useState<PreviewView>("overview");
  const tabs = useRef<HTMLDivElement>(null);
  const views = [
    { key: "overview", label: "Overview" },
    { key: "ledger", label: "General ledger" },
    { key: "receivables", label: "Receivables" },
    { key: "close", label: "Month-end close" },
    { key: "assistant", label: "FinAI Assistant" },
  ] as const;
  return (
    <section
      className="reference-preview-explorer reference-container"
      id="interactive-preview"
    >
      <div className="reference-heading">
        <span>EXPLORE THE RECORDS</span>
        <h2>
          From the big picture
          <br />
          to the smallest entry
        </h2>
      </div>
      <div
        className="reference-preview-tabs"
        ref={tabs}
        role="tablist"
        aria-label="Product preview views"
      >
        {views.map((v, index) => (
          <button
            role="tab"
            id={`preview-tab-${v.key}`}
            tabIndex={preview === v.key ? 0 : -1}
            onKeyDown={(event) => {
              const last = views.length - 1;
              const next =
                event.key === "ArrowRight"
                  ? (index + 1) % views.length
                  : event.key === "ArrowLeft"
                    ? (index + last) % views.length
                    : event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? last
                        : -1;
              if (next < 0) return;
              event.preventDefault();
              setPreview(views[next].key);
              const buttons =
                tabs.current?.querySelectorAll<HTMLButtonElement>("[role=tab]");
              buttons?.[next]?.focus();
            }}
            aria-selected={preview === v.key}
            aria-controls="reference-product-preview"
            key={v.key}
            onClick={() => setPreview(v.key)}
          >
            {v.label}
          </button>
        ))}
      </div>
      <div
        id="reference-product-preview"
        role="tabpanel"
        aria-labelledby={`preview-tab-${preview}`}
        tabIndex={0}
      >
        <ProductPreview view={preview} onViewChange={setPreview} />
      </div>
    </section>
  );
}
