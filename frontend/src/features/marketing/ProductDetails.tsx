import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Building2,
  Check,
  CheckSquare,
  FileCheck2,
  History,
  Layers,
} from "lucide-react";
import { useDemo } from "../../store";
import {
  inScope,
  ledger,
  metrics,
  money,
  shortMoney,
} from "../../demo/selectors";
import { products } from "./content";

type Product = (typeof products)[number];

function RecordIllustration({ product }: { product: Product }) {
  const s = useDemo();
  const rows = ledger(s).slice(0, 4);
  return (
    <div
      className="product-feature-art product-art-records"
      aria-label="Posted ledger records from the active demo entity"
    >
      <div className="product-art-sheet">
        <div className="product-art-toolbar">
          <BookOpen size={15} />
          <strong>Connected books</strong>
          <span>USD</span>
        </div>
        <div className="product-art-column-labels">
          <span>Journal entry</span>
          <span>Debit</span>
        </div>
        {rows.map((row) => (
          <Link key={row.id} to={`/accounting/journals/${row.journal}`}>
            <span>
              {row.journal}
              <small>{row.memo}</small>
            </span>
            <b>{money(row.debit)}</b>
          </Link>
        ))}
        {rows.length === 0 && <p>No posted entries in this period.</p>}
        <div className="product-art-bottom">
          <Check size={12} />
          Canonical local records
          <Link to={product.to}>
            Open workflow <ArrowUpRight size={12} />
          </Link>
        </div>
      </div>
      <span className="product-art-floating">
        <FileCheck2 size={15} />
        Source records attached
      </span>
    </div>
  );
}
function ReviewIllustration() {
  const s = useDemo();
  const tasks = s.tasks
    .filter(
      (t) =>
        t.entity === s.entity &&
        (s.period === "all" || t.due.startsWith(s.period)),
    )
    .slice(0, 3);
  return (
    <div
      className="product-feature-art product-art-review"
      aria-label="Close tasks from the active demo entity"
    >
      <div className="product-art-sheet">
        <div className="product-art-toolbar">
          <CheckSquare size={15} />
          <strong>A clear review path</strong>
        </div>
        {tasks.map((task) => (
          <Link className="product-art-task" key={task.id} to="/close">
            <span
              className={
                task.status === "Approved" || task.status === "Complete"
                  ? "is-done"
                  : ""
              }
            >
              <Check size={12} />
            </span>
            <span>
              {task.title}
              <small>{task.owner}</small>
            </span>
            <em>{task.status}</em>
          </Link>
        ))}
        {tasks.length === 0 && <p>No close tasks in this period.</p>}
        <div className="product-art-role">
          <span>Current persona</span>
          <strong>{s.role}</strong>
          <span>Local UI permissions</span>
        </div>
      </div>
      <div className="product-art-review-stamp">
        <Check size={21} />
        <span>
          Evidence stays
          <br />
          with the work
        </span>
      </div>
    </div>
  );
}
function EntityIllustration() {
  const s = useDemo(),
    m = metrics(s),
    entity = s.entities.find((e) => e.id === s.entity);
  return (
    <div
      className="product-feature-art product-art-entities"
      aria-label="Active entity and cash balance from the demo books"
    >
      <div className="product-art-entity-card">
        <span>
          <Building2 size={20} />
        </span>
        <small>ACTIVE DEMO ENTITY</small>
        <strong>{entity?.name}</strong>
        <p>{entity?.country}</p>
        <div>
          <span>Closing cash</span>
          <b>{shortMoney(m.cash)}</b>
        </div>
      </div>
      <div className="product-art-entity-branch">
        <i />
        <span />
        <i />
      </div>
      <div className="product-art-entity-nodes">
        {s.entities.map((e) => (
          <Link to="/entities" key={e.id}>
            <Building2 size={17} />
            <span>
              {e.id.toUpperCase()}
              <small>{e.currency} functional</small>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
function HistoryIllustration() {
  const s = useDemo(),
    scoped = s.journals.filter((j) => inScope(s, j)),
    posted = scoped.filter((j) => j.status === "Posted").length;
  return (
    <div
      className="product-feature-art product-art-history"
      aria-label="Journal status counts from the active demo entity"
    >
      <div className="product-art-sheet">
        <div className="product-art-toolbar">
          <History size={15} />
          <strong>Every step has context</strong>
        </div>
        <div className="product-art-history-total">
          <small>POSTED JOURNALS</small>
          <strong>{posted}</strong>
          <span>Entity and period scoped</span>
        </div>
        <div className="product-art-statuses">
          {["Draft", "In review", "Approved", "Posted"].map((status) => (
            <div key={status}>
              <span>{status}</span>
              <b>{scoped.filter((j) => j.status === status).length}</b>
              <i />
            </div>
          ))}
        </div>
      </div>
      <Link className="product-art-history-link" to="/accounting/journals">
        <BookOpen size={14} />
        Inspect the journals
        <ArrowUpRight size={13} />
      </Link>
    </div>
  );
}

export function ProductDetails({ product }: { product: Product }) {
  const s = useDemo(),
    entity = s.entities.find((e) => e.id === s.entity),
    journal = s.journals.find(
      (j) => inScope(s, j) && j.status === "Posted" && j.source,
    ),
    amount = journal?.lines.reduce((sum, line) => sum + line.debit, 0) ?? 0;
  const featureCopy = [
    [
      "Connected source records",
      "The product preview uses the same fictional workspace as the ledger. Open a posted entry and inspect the records behind the number.",
    ],
    [
      "A visible review path",
      "Explore close tasks, owners, evidence, and status. The local Accountant and Reviewer personas keep each decision visible.",
    ],
    [
      "Your entities, in context",
      "Keep the active entity and period in view. Both demo entities use functional USD, with separate records and financial statements.",
    ],
    [
      "Traceable posted history",
      "Drafts and posted entries have different roles. Follow journal status and source links without losing the accounting context.",
    ],
  ];
  return (
    <>
      <section className="product-reference-features marketing-section">
        <div className="product-reference-heading">
          <h2>Built for the detail behind every workflow</h2>
          <p>
            Connected records, clear reviews, and a shared set of demo books.
          </p>
        </div>
        <div className="product-reference-feature-grid">
          {featureCopy.map(([title, description], index) => (
            <article key={title}>
              {index === 0 ? (
                <RecordIllustration product={product} />
              ) : index === 1 ? (
                <ReviewIllustration />
              ) : index === 2 ? (
                <EntityIllustration />
              ) : (
                <HistoryIllustration />
              )}
              <div className="product-reference-feature-copy">
                <h3>{title}</h3>
                <p>{description}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section
        className="product-reference-story marketing-section"
        aria-label="A local workflow example"
      >
        <div className="product-reference-story-panel">
          <div className="product-reference-story-art">
            <BookOpen size={30} />
            <span>ONE CONNECTED RECORD</span>
            <strong>{journal?.id ?? "Your demo books"}</strong>
            <p>{journal?.memo ?? "Explore the current entity’s books."}</p>
            <div>
              <span>Posted debit total</span>
              <b>{money(amount)}</b>
            </div>
            <small>Fictional records · Active entity and period</small>
          </div>
          <div className="product-reference-story-copy">
            <span>INSIDE THE LOCAL DEMO</span>
            <h2>Follow a number all the way to its source.</h2>
            <p>
              {entity?.name} is a fictional company. Its journals, records, and
              financial statements form one connected demo, so you can inspect
              the details as you explore {product.name.toLowerCase()}.
            </p>
            <div>
              <span>
                <strong>A workflow you can inspect</strong>
                <small>No customer endorsement or live account</small>
              </span>
              <Link
                to={journal ? `/accounting/journals/${journal.id}` : product.to}
              >
                Explore the record <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </div>
      </section>
      <RelatedProducts product={product} />
    </>
  );
}
function RelatedProducts({ product }: { product: Product }) {
  const rail = useRef<HTMLDivElement>(null),
    [position, setPosition] = useState({ left: true, right: false });
  const updatePosition = () => {
    const e = rail.current;
    if (e)
      setPosition({
        left: e.scrollLeft <= 2,
        right: e.scrollLeft + e.clientWidth >= e.scrollWidth - 2,
      });
  };
  const scroll = (direction: number) => {
    const e = rail.current;
    if (e)
      e.scrollBy({
        left: direction * (e.clientWidth * 0.8),
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
  };
  return (
    <section className="product-reference-related marketing-section">
      <div className="product-reference-heading">
        <span>
          <Layers size={12} />
          Connected workflows
        </span>
        <h2>Explore more of FinAI</h2>
      </div>
      <div
        className="product-reference-related-rail"
        ref={rail}
        onScroll={updatePosition}
        id="related-product-workflows"
      >
        {products
          .filter((p) => p.slug !== product.slug)
          .map((p) => (
            <Link key={p.slug} to={`/product/${p.slug}`}>
              <div>
                <h3>{p.name}</h3>
                <ArrowUpRight size={17} />
              </div>
              <p>{p.short}</p>
              <div className="product-related-illustration" aria-hidden="true">
                <p.icon size={38} />
                <span />
                <span />
                <span />
              </div>
              <small>
                Explore this workflow <ArrowRight size={13} />
              </small>
            </Link>
          ))}
      </div>
      <div className="product-reference-related-controls">
        <button
          aria-label="Previous related workflows"
          aria-controls="related-product-workflows"
          disabled={position.left}
          onClick={() => scroll(-1)}
        >
          <ArrowLeft size={16} />
        </button>
        <button
          aria-label="Next related workflows"
          aria-controls="related-product-workflows"
          disabled={position.right}
          onClick={() => scroll(1)}
        >
          <ArrowRight size={16} />
        </button>
      </div>
    </section>
  );
}
