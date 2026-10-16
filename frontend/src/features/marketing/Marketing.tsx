import { useEffect, useState, type ReactNode } from "react";
import { Link, Outlet, useLocation, useParams } from "react-router-dom";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
  CirclePlay,
  Layers,
  Menu,
  ShieldCheck,
  Sparkles,
  Workflow,
} from "lucide-react";
import { Modal } from "../../components/ui";
import { ProductPreview } from "./ProductPreview";
import { products, questions, type PreviewView } from "./content";
import "../../styles/marketing.css";
export function MarketingLayout() {
  const [mobile, setMobile] = useState(false),
    location = useLocation();
  useEffect(() => {
    setMobile(false);
    if (location.hash) {
      requestAnimationFrame(() =>
        document.getElementById(location.hash.slice(1))?.scrollIntoView(),
      );
    } else window.scrollTo(0, 0);
  }, [location.pathname, location.hash]);
  return (
    <div className="marketing-site">
      <a className="marketing-skip" href="#marketing-content">
        Skip to content
      </a>
      <div className="marketing-announcement">
        <span>Meet your next chapter in accounting.</span>
        <Link to="/welcome">
          Explore the FinAI demo
          <ArrowRight size={12} />
        </Link>
      </div>
      <header className="marketing-header">
        <Link className="marketing-brand" to="/" aria-label="FinAI home">
          <span>F</span>FinAI<span className="marketing-brand-dot">.</span>
        </Link>
        <nav aria-label="Public navigation">
          <Dropdown.Root>
            <Dropdown.Trigger className="marketing-nav-button">
              Product
              <ChevronDown size={13} />
            </Dropdown.Trigger>
            <Dropdown.Portal>
              <Dropdown.Content
                className="marketing-mega"
                sideOffset={23}
                align="start"
              >
                <div className="marketing-menu-title">
                  ONE CONNECTED WORKSPACE
                </div>
                {products.map((p) => (
                  <Dropdown.Item asChild key={p.slug}>
                    <Link to={`/product/${p.slug}`}>
                      <span>
                        <p.icon size={19} />
                      </span>
                      <div>
                        <strong>{p.name}</strong>
                        <small>{p.short}</small>
                      </div>
                      <ArrowUpRight size={14} />
                    </Link>
                  </Dropdown.Item>
                ))}
              </Dropdown.Content>
            </Dropdown.Portal>
          </Dropdown.Root>
          <Link to="/#why-finai">Why FinAI</Link>
          <Link to="/resources">Resources</Link>
          <Link to="/about">Company</Link>
        </nav>
        <div className="marketing-header-actions">
          <Link className="marketing-login" to="/welcome">
            Open workspace
            <ArrowUpRight size={12} />
          </Link>
          <Link className="marketing-button dark small" to="/welcome">
            Explore demo
            <ArrowRight size={13} />
          </Link>
          <button
            className="marketing-mobile-toggle"
            aria-label="Open public navigation"
            onClick={() => setMobile(true)}
          >
            <Menu size={22} />
          </button>
        </div>
      </header>
      <main id="marketing-content" className="marketing-content" tabIndex={-1}>
        <Outlet />
      </main>
      <footer className="marketing-footer">
        <div className="marketing-footer-top">
          <div>
            <Link className="marketing-brand" to="/" aria-label="FinAI home">
              <span>F</span>FinAI<span className="marketing-brand-dot">.</span>
            </Link>
            <p>
              A little clarity.
              <br />A lot of possibility.
            </p>
            <span className="marketing-demo-pill">
              <i />
              Interactive demo workspace
            </span>
          </div>
          <div>
            <h3>Product</h3>
            {products.slice(0, 4).map((p) => (
              <Link key={p.slug} to={`/product/${p.slug}`}>
                {p.name}
              </Link>
            ))}
          </div>
          <div>
            <h3>Explore</h3>
            <Link to="/product/month-end-close">Month-end close</Link>
            <Link to="/product/assistant">FinAI Assistant</Link>
            <Link to="/resources">Workflow guides</Link>
            <Link to="/about">About FinAI</Link>
          </div>
          <div>
            <h3>Your next step</h3>
            <Link to="/welcome">Enter demo workspace</Link>
            <Link to="/resources#demo-details">About the demo</Link>
            <Link to="/#questions">Questions, answered</Link>
          </div>
        </div>
        <div className="marketing-footer-bottom">
          <span>
            © {new Date().getFullYear()} FinAI · Original demonstration
          </span>
          <span>
            Local data. Simulated payments and connections. No live AI.
          </span>
          <a href="#marketing-content">Back to top ↑</a>
        </div>
      </footer>
      <Modal
        title="Explore FinAI"
        open={mobile}
        onOpenChange={setMobile}
        drawer
      >
        <nav
          className="marketing-mobile-nav"
          aria-label="Mobile public navigation"
        >
          {products.map((p) => (
            <Link key={p.slug} to={`/product/${p.slug}`}>
              <p.icon size={18} />
              {p.name}
              <ArrowRight size={15} />
            </Link>
          ))}
          <Link to="/#why-finai">
            Why FinAI
            <ArrowRight size={15} />
          </Link>
          <Link to="/resources">
            Resources
            <ArrowRight size={15} />
          </Link>
          <Link to="/about">
            Company
            <ArrowRight size={15} />
          </Link>
          <Link to="/welcome">
            Enter demo workspace
            <ArrowRight size={15} />
          </Link>
        </nav>
      </Modal>
    </div>
  );
}
function Walkthrough({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
}) {
  const [selected, setSelected] = useState("ledger");
  const steps = [
    {
      key: "ledger",
      title: "Follow a number",
      description:
        "Open the ledger, filter an account, then inspect the journal and source behind it.",
      to: "/accounting/ledger",
      icon: BookOpen,
    },
    {
      key: "close",
      title: "Bring a close together",
      description:
        "Complete a task with evidence, request a review, and see progress update.",
      to: "/close",
      icon: Check,
    },
    {
      key: "assistant",
      title: "Ask a better question",
      description:
        "Try a supported question, inspect its evidence, and preview a local action.",
      to: "/assistant",
      icon: Sparkles,
    },
  ];
  const current = steps.find((s) => s.key === selected)!;
  return (
    <Modal
      title="A closer look at FinAI"
      open={open}
      onOpenChange={onOpenChange}
    >
      <p className="marketing-walkthrough-note">
        Choose a guided starting point. Everything uses fictional, local demo
        data.
      </p>
      <div className="marketing-walkthrough-options">
        {steps.map((s) => (
          <button
            key={s.key}
            className={selected === s.key ? "selected" : ""}
            onClick={() => setSelected(s.key)}
          >
            <s.icon size={20} />
            {s.title}
          </button>
        ))}
      </div>
      <div className="marketing-walkthrough-detail">
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
function FlowArtwork() {
  return (
    <div className="marketing-flow" aria-hidden="true">
      <div className="flow-orbit orbit-one" />
      <div className="flow-orbit orbit-two" />
      <div className="flow-label label-one">
        <ReceiptIcon />
        Invoice issued
        <span>
          <Check size={11} />
        </span>
      </div>
      <div className="flow-center">
        <span>F</span>
      </div>
      <div className="flow-label label-two">
        <BookOpen size={14} />
        Ledger updated
        <span>
          <Check size={11} />
        </span>
      </div>
      <div className="flow-label label-three">
        <Workflow size={14} />
        Ready for review
        <span className="flow-dot" />
      </div>
      <svg viewBox="0 0 600 260" preserveAspectRatio="none">
        <path d="M0 120 H150 Q180 120 180 90 V70 Q180 40 210 40 H280 Q310 40 310 70 V190 Q310 220 340 220 H600" />
        <path d="M0 230 H190 Q225 230 225 195 V170 Q225 140 255 140 H390 Q420 140 420 110 V70 Q420 40 450 40 H600" />
      </svg>
    </div>
  );
}
function ReceiptIcon() {
  return <Layers size={14} />;
}
function CallToAction() {
  return (
    <section className="marketing-final-cta">
      <span className="marketing-kicker">YOUR NEXT CHAPTER</span>
      <h2>
        Make room for
        <br />
        <em>the bigger picture.</em>
      </h2>
      <Link className="marketing-button light" to="/welcome">
        Explore the demo
        <ArrowRight size={16} />
      </Link>
      <p>No sign-in. No bank connection. Just a little more clarity.</p>
      <div className="cta-decoration" aria-hidden="true">
        F
      </div>
    </section>
  );
}
function FeatureFrame({ children }: { children: ReactNode }) {
  return (
    <section className="marketing-section marketing-feature-section">
      {children}
    </section>
  );
}
export function HomePage() {
  const [view, setView] = useState<PreviewView>("overview"),
    [tour, setTour] = useState(false);
  return (
    <>
      <section className="marketing-hero">
        <div className="marketing-hero-topline">
          <span className="marketing-kicker">
            <i />
            ACCOUNTING, ALL TOGETHER
          </span>
          <span className="marketing-edition">A FINAI PRODUCT DEMO — 01</span>
        </div>
        <div className="marketing-hero-copy">
          <h1>
            A clear mind.
            <br />
            <em>A connected ledger.</em>
          </h1>
          <div className="marketing-hero-description">
            <p>
              Your numbers have a story to tell.
              <br />
              Bring your books, workflows, and insights
              <br className="marketing-desktop-break" /> into one thoughtfully
              connected workspace.
            </p>
            <div>
              <Link className="marketing-button dark" to="/welcome">
                Explore the demo
                <ArrowRight size={15} />
              </Link>
              <button
                className="marketing-text-button"
                onClick={() => setTour(true)}
              >
                <CirclePlay size={18} />
                Take a closer look
              </button>
            </div>
            <span>Fictional company. Real, interactive workflows.</span>
          </div>
        </div>
        <FlowArtwork />
        <div
          className="marketing-preview-wrapper"
          id="homepage-product-preview"
        >
          <div className="marketing-preview-caption">
            <span>
              <i />A WORKSPACE THAT CONNECTS THE DOTS
            </span>
            <a href="#product-tour" aria-label="Explore the product preview">
              <ArrowDown size={16} />
            </a>
          </div>
          <ProductPreview view={view} onViewChange={setView} />
        </div>
      </section>
      <section className="marketing-demo-companies">
        <span>MEET THE FICTIONAL BUSINESSES INSIDE THE DEMO</span>
        <div>
          <b>
            acorn<span> / labs</span>
          </b>
          <b className="company-serif">Meridian</b>
          <b>
            <span className="company-orbit">◉</span> orbit
          </b>
          <b className="company-mono">JUNIPER</b>
          <b className="company-serif">cedar.</b>
        </div>
      </section>
      <section className="marketing-section marketing-tour" id="product-tour">
        <div className="marketing-section-intro">
          <span className="marketing-kicker">
            ONE PLACE. THE WHOLE PICTURE.
          </span>
          <h2>
            Built around the way
            <br />
            <em>finance really works.</em>
          </h2>
          <p>
            From the smallest entry to the month-end close,
            <br />
            keep the details connected and the next step clear.
          </p>
        </div>
        <div
          className="marketing-feature-tabs"
          role="tablist"
          aria-label="Product preview views"
        >
          {(
            [
              { key: "overview", label: "Overview", icon: Layers },
              { key: "ledger", label: "General ledger", icon: BookOpen },
              { key: "receivables", label: "Receivables", icon: Layers },
              { key: "close", label: "Month-end close", icon: Check },
              { key: "assistant", label: "FinAI Assistant", icon: Sparkles },
            ] as const
          ).map((t) => (
            <button
              role="tab"
              aria-controls="homepage-product-preview"
              aria-selected={view === t.key}
              key={t.key}
              onClick={() => {
                setView(t.key);
                document
                  .querySelector(".marketing-preview-wrapper")
                  ?.scrollIntoView({
                    block: "center",
                    behavior: window.matchMedia(
                      "(prefers-reduced-motion: reduce)",
                    ).matches
                      ? "instant"
                      : "smooth",
                  });
              }}
            >
              <t.icon size={16} />
              {t.label}
              <ArrowUpRight size={14} />
            </button>
          ))}
        </div>
        <div className="marketing-product-grid">
          {products.map((p) => (
            <Link
              className="marketing-product-card"
              to={`/product/${p.slug}`}
              key={p.slug}
            >
              <span>
                <p.icon size={22} />
              </span>
              <h3>{p.name}</h3>
              <p>{p.short}</p>
              <ArrowUpRight size={18} />
            </Link>
          ))}
        </div>
      </section>
      <FeatureFrame>
        <div className="marketing-feature-copy">
          <span className="marketing-kicker">FROM ENTRY TO UNDERSTANDING</span>
          <h2>
            Every number.
            <br />
            <em>A little more context.</em>
          </h2>
          <p>
            Financial statements are only the beginning. Follow an account to
            its journal, open its source document, and see how everything fits
            together.
          </p>
          <Link
            className="marketing-text-link"
            to="/product/automated-general-ledger"
          >
            Meet your general ledger
            <ArrowRight size={15} />
          </Link>
          <div className="marketing-feature-points">
            <span>
              <Check size={14} />
              Connected source records
            </span>
            <span>
              <Check size={14} />A clear review and audit trail
            </span>
            <span>
              <Check size={14} />
              Entity and period context
            </span>
          </div>
        </div>
        <div className="marketing-evidence-art">
          <div className="evidence-report">
            <div>
              <BookOpen size={15} />
              <span>Profit & loss</span>
              <span>USD</span>
            </div>
            <p>September 2026 · Northstar Analytics</p>
            <div>
              <span>Subscription revenue</span>
              <strong>Posted ledger</strong>
            </div>
            <div className="evidence-highlight">
              <span>4000 · Subscription revenue</span>
              <ArrowUpRight size={14} />
            </div>
            <div>
              <span>Operating expenses</span>
              <strong>Account detail</strong>
            </div>
            <div className="evidence-total">
              <span>One connected view</span>
              <Check size={14} />
            </div>
          </div>
          <div className="evidence-journal">
            <div>
              <span className="evidence-doc-icon">
                <BookOpen size={18} />
              </span>
              <div>
                <strong>A number with a source.</strong>
                <p>Journal → Invoice → Customer</p>
              </div>
              <span className="evidence-check">
                <Check size={13} />
              </span>
            </div>
            <Link to="/reports/profit-and-loss">
              Follow the trail in the demo
              <ArrowRight size={13} />
            </Link>
          </div>
          <span className="marketing-art-caption">
            ILLUSTRATIVE WORKFLOW · DEMO RECORDS
          </span>
        </div>
      </FeatureFrame>
      <section className="marketing-why" id="why-finai">
        <div>
          <span className="marketing-kicker">A BETTER KIND OF BUSY</span>
          <h2>
            Less piecing
            <br />
            things together.
            <br />
            <em>More seeing ahead.</em>
          </h2>
          <Link className="marketing-button light" to="/welcome">
            Find your clarity
            <ArrowRight size={15} />
          </Link>
        </div>
        <div className="marketing-principles">
          {[
            {
              n: "01",
              title: "The details belong together.",
              text: "Give your invoices, bills, journals, and reports the context of a shared ledger.",
            },
            {
              n: "02",
              title: "Keep the next step visible.",
              text: "See what needs coding, which items need review, and what is holding up the close.",
            },
            {
              n: "03",
              title: "Stay in control of the work.",
              text: "Inspect the evidence, review a proposal, and choose when a local action happens.",
            },
          ].map((p) => (
            <div key={p.n}>
              <span>{p.n}</span>
              <div>
                <h3>{p.title}</h3>
                <p>{p.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="marketing-section marketing-assistant-section">
        <div className="marketing-assistant-art">
          <div className="marketing-assistant-query">
            What needs my attention for close?
          </div>
          <div className="marketing-assistant-answer">
            <span>
              <Sparkles size={16} />
              FinAI Assistant<small>Demo</small>
            </span>
            <p>
              Start with the tasks waiting for review.
              <br />
              Your checklist has the supporting evidence.
            </p>
            <Link to="/close">
              <Check size={12} />
              Close checklist
              <ArrowUpRight size={12} />
            </Link>
            <div>
              <span>Proposed local action</span>
              <strong>Prepare a close task for review</strong>
              <span>Always requires your explicit approval</span>
            </div>
          </div>
          <span className="marketing-art-caption">
            DETERMINISTIC DEMO RESPONSES · NO LIVE AI
          </span>
        </div>
        <div className="marketing-feature-copy">
          <span className="marketing-kicker">
            <Sparkles size={14} />
            ANOTHER WAY TO GET THERE
          </span>
          <h2>
            A conversation
            <br />
            <em>with your numbers.</em>
          </h2>
          <p>
            Explore a different way to find answers. Ask a supported question,
            inspect the linked records, and preview the next step before
            deciding.
          </p>
          <Link className="marketing-text-link" to="/product/assistant">
            Explore FinAI Assistant
            <ArrowRight size={15} />
          </Link>
        </div>
      </section>
      <section className="marketing-section marketing-resources-teaser">
        <div>
          <span className="marketing-kicker">GET A FEEL FOR THE FLOW</span>
          <h2>
            A few good
            <br />
            <em>places to begin.</em>
          </h2>
        </div>
        <div>
          {[
            {
              label: "01 / THE FOUNDATIONS",
              title: "From draft to posted journal",
              to: "/accounting/journals",
              icon: BookOpen,
            },
            {
              label: "02 / THE BIG PICTURE",
              title: "See how the statements connect",
              to: "/reports",
              icon: Layers,
            },
            {
              label: "03 / THE FINISHING TOUCHES",
              title: "Bring a month-end close together",
              to: "/close",
              icon: Check,
            },
          ].map((r) => (
            <Link to={r.to} key={r.to}>
              <span>{r.label}</span>
              <h3>{r.title}</h3>
              <r.icon size={23} />
              <ArrowUpRight size={18} />
            </Link>
          ))}
        </div>
      </section>
      <section className="marketing-section marketing-faq" id="questions">
        <div>
          <span className="marketing-kicker">A LITTLE MORE CLARITY</span>
          <h2>
            Good questions.
            <br />
            <em>Straight answers.</em>
          </h2>
        </div>
        <div>
          {questions.map((q) => (
            <details key={q.q}>
              <summary>
                {q.q}
                <span>+</span>
              </summary>
              <p>{q.a}</p>
            </details>
          ))}
        </div>
      </section>
      <CallToAction />
      <Walkthrough open={tour} onOpenChange={setTour} />
    </>
  );
}
export function ProductPage() {
  const { product: slug } = useParams(),
    product = products.find((p) => p.slug === slug),
    [view, setView] = useState<PreviewView>(product?.view || "overview");
  useEffect(() => {
    setView(product?.view || "overview");
  }, [product?.view]);
  if (!product)
    return (
      <section className="marketing-section marketing-product-missing">
        <h1>That page isn’t in this demo.</h1>
        <Link className="marketing-button dark" to="/">
          Return home
          <ArrowRight size={15} />
        </Link>
      </section>
    );
  return (
    <>
      <section className="marketing-product-hero">
        <span className="marketing-kicker">
          <product.icon size={15} />
          {product.name.toUpperCase()}
        </span>
        <h1>{product.title}</h1>
        <p>{product.description}</p>
        <Link className="marketing-button dark" to={product.to}>
          Try this workflow
          <ArrowRight size={15} />
        </Link>
        <span className="marketing-product-note">
          Interactive local demo · No credentials required
        </span>
      </section>
      <div className="marketing-product-page-preview">
        <ProductPreview view={view} onViewChange={setView} />
      </div>
      <section className="marketing-section marketing-benefits">
        {product.benefits.map(([title, description], i) => (
          <div key={title}>
            <span>0{i + 1}</span>
            <h2>{title}</h2>
            <p>{description}</p>
          </div>
        ))}
      </section>
      <CallToAction />
    </>
  );
}
export function ResourcesPage() {
  return (
    <>
      <section className="marketing-product-hero">
        <span className="marketing-kicker">FIND YOUR WAY AROUND</span>
        <h1>
          A few useful paths
          <br />
          through the numbers.
        </h1>
        <p>
          Hands-on starting points for the FinAI demo. Every guide takes you
          directly into a connected local workflow.
        </p>
      </section>
      <section className="marketing-section marketing-resource-guides">
        {products.map((p) => (
          <article key={p.slug}>
            <p.icon size={24} />
            <h2>{p.name}</h2>
            <p>{p.benefits[0][1]}</p>
            <ol>
              {p.benefits.map(([title]) => (
                <li key={title}>{title}</li>
              ))}
            </ol>
            <Link className="marketing-text-link" to={p.to}>
              Open this workflow
              <ArrowRight size={14} />
            </Link>
          </article>
        ))}
      </section>
      <section
        className="marketing-section marketing-demo-details"
        id="demo-details"
      >
        <ShieldCheck size={28} />
        <h2>Your browser. Your demo.</h2>
        <p>
          FinAI is a frontend demonstration with synthetic Northstar Analytics
          records. Business data stays in browser storage. Payments, bank
          connections, automation runs, and assistant responses are simulations.
          No real company, customer, vendor, bank, or AI service is connected.
        </p>
        <p>
          Local PDF and image previews use session-only object URLs; contents
          are never uploaded. You can restore the original dataset at any time
          through Settings → Preferences → Reset demo.
        </p>
        <Link className="marketing-text-link" to="/settings/preferences">
          Open demo preferences
          <ArrowRight size={14} />
        </Link>
      </section>
      <CallToAction />
    </>
  );
}
export function AboutPage() {
  return (
    <>
      <section className="marketing-product-hero">
        <span className="marketing-kicker">THE IDEA BEHIND FINAI</span>
        <h1>
          Good accounting
          <br />
          makes space to think.
        </h1>
        <p>
          A connected workspace for understanding how financial records,
          decisions, and workflows fit together.
        </p>
        <Link className="marketing-button dark" to="/welcome">
          See the idea in action
          <ArrowRight size={15} />
        </Link>
      </section>
      <section className="marketing-section marketing-about-body">
        <div>
          <span className="marketing-kicker">OUR DEMONSTRATION</span>
          <h2>
            Clarity in the details.
            <br />
            <em>Confidence in the whole.</em>
          </h2>
        </div>
        <div>
          <p>
            FinAI brings the everyday work of accounting into a coherent local
            demonstration: the journal behind a number, the invoice behind a
            receivable, and the evidence behind a close.
          </p>
          <p>
            The fictional Northstar Analytics workspace lets you explore six
            months of financial activity across two USD entities. You can
            create, review, post, and trace changes without credentials or
            external connections.
          </p>
          <p>
            This is an original FinAI prototype, with simulated workflows and
            browser-local data. It is not a production accounting service.
          </p>
        </div>
      </section>
      <CallToAction />
    </>
  );
}
