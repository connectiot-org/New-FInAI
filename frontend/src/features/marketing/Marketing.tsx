import { useEffect, useState } from "react";
import { Link, Outlet, useLocation, useParams } from "react-router-dom";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import {
  ArrowRight,
  ArrowUpRight,
  Building2,
  ChevronDown,
  Check,
  Menu,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Modal, useToast } from "../../components/ui";
import { useDemo } from "../../store";
import { money, inScope } from "../../demo/selectors";
import { ProductPreview } from "./ProductPreview";
import { ProductDetails } from "./ProductDetails";
import { products, questions, type PreviewView } from "./content";
import { ReferenceHome, PreviewExplorer } from "./ReferenceHome";
import "../../styles/marketing.css";
import "../../styles/reference-home.css";
import "../../styles/product-reference.css";

type PublicItem = { label: string; description: string; to: string };
const coreSlugs = [
  "automated-general-ledger",
  "accounts-receivable",
  "accounts-payable",
  "bank-reconciliation",
  "month-end-close",
  "native-integrations",
  "financial-reporting",
];
function PublicMenu({
  label,
  groups,
}: {
  label: string;
  groups: { title: string; items: PublicItem[] }[];
}) {
  return (
    <Dropdown.Root>
      <Dropdown.Trigger className="marketing-nav-button">
        {label}
        <ChevronDown size={13} />
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content
          className={`marketing-mega ${groups.length > 1 ? "has-columns" : ""}`}
          sideOffset={20}
          align="center"
        >
          {groups.map((group) => (
            <div key={group.title}>
              <div className="marketing-menu-title">{group.title}</div>
              {group.items.map((item) => (
                <Dropdown.Item asChild key={item.label}>
                  <Link to={item.to}>
                    <span>
                      <ArrowUpRight size={15} />
                    </span>
                    <div>
                      <strong>{item.label}</strong>
                      <small>{item.description}</small>
                    </div>
                  </Link>
                </Dropdown.Item>
              ))}
            </div>
          ))}
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}
function BookmarkGuide() {
  const toast = useToast();
  const [saved, setSaved] = useState(() => {
    try {
      return localStorage.getItem("finai-public-guide") === "/resources";
    } catch {
      return false;
    }
  });
  return (
    <div className="marketing-guide-bar">
      <div>
        <strong>Keep a useful guide close</strong>
        <span>Save a local shortcut to the FinAI demo workflows</span>
      </div>
      <div>
        {saved ? (
          <Link to="/resources">
            <Check size={14} />
            Workflow guide saved
            <ArrowUpRight size={14} />
          </Link>
        ) : (
          <button
            onClick={() => {
              try {
                localStorage.setItem("finai-public-guide", "/resources");
                setSaved(true);
                toast("Workflow guide saved in this browser");
              } catch {
                toast(
                  "Browser storage is unavailable; open Resources to view the guide.",
                );
              }
            }}
          >
            Save workflow guide
            <ArrowRight size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
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
  const groups = [
    {
      title: "Core features",
      items: products
        .filter((p) => coreSlugs.includes(p.slug))
        .sort((a, b) => coreSlugs.indexOf(a.slug) - coreSlugs.indexOf(b.slug))
        .map((p) => ({
          label: p.name,
          description: p.short,
          to: `/product/${p.slug}`,
        })),
    },
    {
      title: "Advanced features",
      items: products
        .filter((p) => !coreSlugs.includes(p.slug))
        .map((p) => ({
          label: p.name,
          description: p.short,
          to: `/product/${p.slug}`,
        })),
    },
  ];
  return (
    <div className="marketing-site">
      <a className="marketing-skip" href="#marketing-content">
        Skip to content
      </a>
      <header className="marketing-header">
        <Link className="marketing-brand" to="/" aria-label="FinAI home">
          FinAI
        </Link>
        <nav aria-label="Public navigation">
          <PublicMenu label="Product" groups={groups} />
          <PublicMenu
            label="Solutions"
            groups={[
              {
                title: "By role",
                items: [
                  {
                    label: "Finance leaders",
                    description: "Explore financial statements",
                    to: "/reports",
                  },
                  {
                    label: "Accountants",
                    description: "Follow the ledger and journals",
                    to: "/accounting/ledger",
                  },
                  {
                    label: "Reviewers",
                    description: "Bring approvals into view",
                    to: "/close",
                  },
                ],
              },
              {
                title: "By workspace",
                items: [
                  {
                    label: "Growing teams",
                    description: "Connected demo workflows",
                    to: "/welcome",
                  },
                  {
                    label: "Multiple entities",
                    description: "Separate books and a group view",
                    to: "/entities",
                  },
                  {
                    label: "SaaS business",
                    description: "Customers, contracts, and revenue",
                    to: "/revenue/contracts",
                  },
                ],
              },
            ]}
          />
          <Link to="/customers">Customers</Link>
          <PublicMenu
            label="Partners"
            groups={[
              {
                title: "Explore together",
                items: [
                  {
                    label: "About this prototype",
                    description: "The idea behind FinAI",
                    to: "/about",
                  },
                  {
                    label: "Workflow guides",
                    description: "A useful starting point",
                    to: "/resources",
                  },
                ],
              },
            ]}
          />
          <PublicMenu
            label="Resources"
            groups={[
              {
                title: "Learn",
                items: [
                  {
                    label: "Workflow guides",
                    description: "Explore the accounting demo",
                    to: "/resources",
                  },
                  {
                    label: "Interactive preview",
                    description: "Inspect local records",
                    to: "/resources#interactive-preview",
                  },
                  {
                    label: "Questions answered",
                    description: "Honest demo details",
                    to: "/resources#questions",
                  },
                ],
              },
              {
                title: "Company",
                items: [
                  {
                    label: "About FinAI",
                    description: "A connected accounting prototype",
                    to: "/about",
                  },
                  {
                    label: "Public demo",
                    description: "No credentials required",
                    to: "/welcome",
                  },
                  {
                    label: "Local data and privacy",
                    description: "Understand the demo boundaries",
                    to: "/resources#demo-details",
                  },
                ],
              },
            ]}
          />
        </nav>
        <div className="marketing-header-actions">
          <Link className="marketing-login" to="/welcome">
            Log in <span className="sr-only">to demo</span>
          </Link>
          <Link className="marketing-button dark small" to="/welcome">
            Explore the demo
          </Link>
          <button
            className="marketing-mobile-toggle"
            aria-label="Open public navigation"
            onClick={() => setMobile(true)}
          >
            <Menu size={25} />
          </button>
        </div>
      </header>
      <main id="marketing-content" className="marketing-content" tabIndex={-1}>
        <Outlet />
      </main>
      <footer className="marketing-footer">
        <BookmarkGuide />
        <div className="marketing-footer-top">
          <div>
            <h3>PRODUCT</h3>
            {products.map((p) => (
              <Link key={p.slug} to={`/product/${p.slug}`}>
                {p.name}
              </Link>
            ))}
          </div>
          <div>
            <h3>SOLUTIONS</h3>
            <Link to="/reports">Finance leaders</Link>
            <Link to="/accounting/ledger">Accountants</Link>
            <Link to="/close">Reviewers</Link>
            <Link to="/entities">Multi-entity teams</Link>
            <Link to="/customers">Demo customers</Link>
          </div>
          <div>
            <h3>RESOURCES</h3>
            <Link to="/resources">Workflow guides</Link>
            <Link to="/resources#interactive-preview">Interactive preview</Link>
            <Link to="/resources#questions">Questions answered</Link>
            <Link to="/welcome">Public demo</Link>
          </div>
          <div>
            <h3>COMPANY</h3>
            <Link to="/about">About FinAI</Link>
            <Link to="/resources#demo-details">Local data and privacy</Link>
            <Link to="/settings/preferences">Demo preferences</Link>
            <a
              href="https://github.com/connectiot-org/New-FInAI"
              target="_blank"
              rel="noreferrer"
            >
              GitHub
              <ArrowUpRight size={10} />
            </a>
          </div>
        </div>
        <div className="marketing-footer-bottom">
          <Link className="marketing-brand" to="/" aria-label="FinAI home">
            FinAI
          </Link>
          <span>
            © {new Date().getFullYear()} FinAI · Original demonstration ·
            Synthetic records
          </span>
          <span>
            <ShieldCheck size={13} />
            Local demo · No live AI or payments
          </span>
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
          {groups.map((group) => (
            <details key={group.title} open={group.title === "Core features"}>
              <summary>
                {group.title}
                <ChevronDown size={15} />
              </summary>
              {group.items.map((p) => (
                <Link key={p.to} to={p.to}>
                  {p.label}
                  <ArrowRight size={13} />
                </Link>
              ))}
            </details>
          ))}
          <Link to="/customers">
            <Users size={17} />
            Demo customers
            <ArrowRight size={15} />
          </Link>
          <Link to="/resources">
            Resources
            <ArrowRight size={15} />
          </Link>
          <Link to="/about">
            About FinAI
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
function CallToAction() {
  return (
    <section className="marketing-final-cta">
      <h2>Get one step closer to a clearer close</h2>
      <p>Connected records. Reviewable workflows. A bigger picture.</p>
      <Link className="marketing-button light" to="/welcome">
        Explore the demo
        <ArrowRight size={15} />
      </Link>
    </section>
  );
}
export function HomePage() {
  return <ReferenceHome />;
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
    <div className="marketing-product-detail" key={product.slug}>
      <div className="product-reference-hero-background">
        <section className="marketing-product-hero">
          <span className="marketing-kicker">
            <product.icon size={15} />
            {product.name}
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
      </div>
      <section className="marketing-section marketing-benefits">
        {product.benefits.map(([title, description], i) => (
          <div key={title}>
            <span>
              <product.icon size={18} />
              <span className="sr-only">Benefit {i + 1}</span>
            </span>
            <h2>{title}</h2>
            <p>{description}</p>
          </div>
        ))}
      </section>
      <ProductDetails product={product} />
      <CallToAction />
    </div>
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
      <PreviewExplorer />
      <section className="marketing-section marketing-faq" id="questions">
        <div>
          <span className="marketing-kicker">DEMO DETAILS</span>
          <h2>Questions, answered.</h2>
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

export function DemoCustomersPage() {
  const s = useDemo();
  return (
    <>
      <section className="marketing-product-hero">
        <span className="marketing-kicker">
          <Building2 size={15} />
          FICTIONAL DEMO COMPANIES
        </span>
        <h1>Relationships, with the numbers attached.</h1>
        <p>
          Explore the synthetic customers inside Northstar Analytics. These are
          fictional records, not FinAI customer endorsements.
        </p>
      </section>
      <section className="marketing-section marketing-customers-grid">
        {s.customers
          .filter((c) => c.entity === s.entity)
          .map((c) => (
            <Link to={`/receivables/customers/${c.id}`} key={c.id}>
              <span className="demo-company-mark">{c.name[0]}</span>
              <h2>{c.name}</h2>
              <p>{c.contact}</p>
              <strong>
                {money(
                  s.invoices
                    .filter(
                      (i) =>
                        i.customer === c.id &&
                        inScope(s, i) &&
                        i.status !== "Draft",
                    )
                    .reduce((v, i) => v + i.amount - i.paid, 0),
                )}{" "}
                outstanding
              </strong>
              <span>
                View demo profile
                <ArrowRight size={14} />
              </span>
            </Link>
          ))}
      </section>
      <CallToAction />
    </>
  );
}
