import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Download, FileSpreadsheet, Search, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import "./datasets.css";

type PublicDataset = {
  slug: string;
  title: string;
  summary: string;
  category: string;
  version: string;
  format: string;
  license: string;
  licenseUrl: string;
  sourceName: string;
  sourceUrl: string | null;
  recordCount: number;
  updatedAt: string;
};

function isPublicDataset(value: unknown): value is PublicDataset {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.slug === "string" &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.slug) &&
    typeof item.title === "string" &&
    typeof item.summary === "string" &&
    typeof item.category === "string" &&
    typeof item.version === "string" &&
    typeof item.format === "string" &&
    /^[a-zA-Z0-9]+$/.test(item.format) &&
    typeof item.license === "string" &&
    typeof item.licenseUrl === "string" &&
    typeof item.sourceName === "string" &&
    (item.sourceUrl === null || typeof item.sourceUrl === "string") &&
    typeof item.recordCount === "number" &&
    Number.isInteger(item.recordCount) &&
    item.recordCount >= 0 &&
    typeof item.updatedAt === "string"
  );
}

export function DatasetsPage() {
  const [datasets, setDatasets] = useState<PublicDataset[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    async function loadDatasets() {
      try {
        const response = await fetch("/api/v1/public/datasets", {
          method: "GET",
          credentials: "same-origin",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("The data library is temporarily unavailable.");
        const payload: unknown = await response.json();
        if (
          !payload ||
          typeof payload !== "object" ||
          !Array.isArray((payload as { datasets?: unknown }).datasets)
        ) {
          throw new Error("The data library returned an unexpected response.");
        }
        const items = (payload as { datasets: unknown[] }).datasets.filter(isPublicDataset);
        if (active) setDatasets(items);
      } catch (cause) {
        if (active && !(cause instanceof DOMException && cause.name === "AbortError")) {
          setError(cause instanceof Error ? cause.message : "Could not load datasets.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadDatasets();
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  const categories = useMemo(
    () => ["All", ...Array.from(new Set(datasets.map((dataset) => dataset.category))).sort()],
    [datasets],
  );
  const visibleDatasets = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return datasets.filter((dataset) => {
      const matchesCategory = category === "All" || dataset.category === category;
      const matchesQuery =
        !needle ||
        [dataset.title, dataset.summary, dataset.category, dataset.sourceName]
          .some((value) => value.toLowerCase().includes(needle));
      return matchesCategory && matchesQuery;
    });
  }, [datasets, query, category]);

  return (
    <div className="dataset-library">
      <section className="dataset-hero">
        <div className="dataset-hero-inner">
          <span className="dataset-kicker"><FileSpreadsheet size={15} /> FINAI OPEN DATA</span>
          <h1>Useful financial data.<br /><em>Open to everyone.</em></h1>
          <p>
            Download free accounting templates and synthetic financial examples for learning,
            prototypes, analytics, and software testing.
          </p>
          <div className="dataset-hero-actions">
            <a className="dataset-primary-link" href="#available-datasets">
              Browse datasets <ArrowRight size={16} />
            </a>
            <Link to="/welcome" className="dataset-secondary-link">
              Explore the FinAI demo
            </Link>
          </div>
          <div className="dataset-privacy-note">
            <ShieldCheck size={17} />
            Every sample record is synthetic. No real company or customer financial data is published.
          </div>
        </div>
      </section>

      <section className="dataset-section" id="available-datasets">
        <div className="dataset-section-heading">
          <div>
            <span className="dataset-kicker">THE LIBRARY</span>
            <h2>Start with a useful dataset.</h2>
            <p>Open downloads. Clear sources. Simple licensing.</p>
          </div>
          <div className="dataset-count">{datasets.length} published datasets</div>
        </div>

        <div className="dataset-toolbar">
          <label className="dataset-search">
            <Search size={17} />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search datasets"
              aria-label="Search datasets"
            />
          </label>
          <div className="dataset-filters" aria-label="Filter datasets by category">
            {categories.map((item) => (
              <button
                type="button"
                key={item}
                className={category === item ? "active" : ""}
                aria-pressed={category === item}
                onClick={() => setCategory(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="dataset-state" role="status">Loading the free data library…</div>
        ) : error ? (
          <div className="dataset-state dataset-error" role="alert">
            <strong>We couldn’t load the library.</strong>
            <span>{error}</span>
            <button type="button" onClick={() => window.location.reload()}>Try again</button>
          </div>
        ) : visibleDatasets.length === 0 ? (
          <div className="dataset-state">No datasets match that search. Try another term or category.</div>
        ) : (
          <div className="dataset-grid">
            {visibleDatasets.map((dataset) => (
              <article className="dataset-card" key={dataset.slug}>
                <div className="dataset-card-top">
                  <span className="dataset-category">{dataset.category}</span>
                  <span className="dataset-version">v{dataset.version}</span>
                </div>
                <div className="dataset-file-icon"><FileSpreadsheet size={22} /></div>
                <h3>{dataset.title}</h3>
                <p>{dataset.summary}</p>
                <div className="dataset-meta">
                  <span><strong>{dataset.recordCount.toLocaleString("en-US")}</strong> records</span>
                  <span>{dataset.format.toUpperCase()}</span>
                </div>
                <div className="dataset-card-bottom">
                  <div className="dataset-license">
                    <span>Source: {dataset.sourceName}</span>
                    <a href={dataset.licenseUrl} target="_blank" rel="noreferrer">{dataset.license}</a>
                  </div>
                  <a
                    className="dataset-download"
                    href={"/datasets/" + dataset.slug + "." + dataset.format.toLowerCase()}
                    download
                  >
                    <Download size={16} /> Download {dataset.format.toUpperCase()}
                  </a>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="dataset-guidelines">
        <div>
          <span className="dataset-kicker">OPEN BY DESIGN</span>
          <h2>Know what you are downloading.</h2>
        </div>
        <div className="dataset-guideline-list">
          <p><strong>Free to use.</strong> Datasets are published under the licence shown on each card. Check the terms before redistribution.</p>
          <p><strong>Transparent provenance.</strong> Each listing identifies its source and version. Synthetic examples are labelled as such.</p>
          <p><strong>Safe for experimentation.</strong> These examples are not a substitute for verified company records, professional accounting advice, or statutory reporting data.</p>
        </div>
      </section>
    </div>
  );
}
