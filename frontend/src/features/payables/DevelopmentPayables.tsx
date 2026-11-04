/** Public invoice sample shell. Its local roles and client never authorize company API access. */
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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
import "../workspace/workspace.css";
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
      organisationName: "Development preview",
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
    <div className="app production-workspace">
      <header>
        <Link className="brand" to="/">
          <BrandMark />
          FinAI
        </Link>
        <span>Supplier invoices</span>
        <Link to="/">Back to FinAI</Link>
      </header>
      <main>
        <section className="ap-development" aria-label="Development preview">
          <div>
            <strong>Development preview</strong>
            <p>
              Try supplier invoices without signing in. Sample data and changes
              stay in this browser. Use sample PDFs only.
            </p>
          </div>
          <label>
            Development role
            <select
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
            disabled={busy}
            onClick={async () => {
              if (
                !confirm(
                  "Reset the development invoices, suppliers, documents and policies saved in this browser?",
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
                setError("Could not reset this browser’s development data.");
              } finally {
                setBusy(false);
              }
            }}
          >
            Reset preview
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
