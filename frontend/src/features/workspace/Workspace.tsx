import { WorkspaceContext, useWorkspace } from "./context";
import { Component, type ReactNode } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { SessionGate } from "../../components/SessionGate";
import { BrandMark } from "../../components/shared/BrandMark";
import { ImportedOutstandingCustomers } from "../receivables/ImportedOutstandingCustomers";
import "../receivables/outstanding-customers.css";
import "./workspace.css";
export function WorkspaceOverview() {
  return (
    <>
      <h1>Overview</h1>
      <p>
        Your authorized imported accounting data. Each source states its own
        information cutoff.
      </p>
      <ImportedOutstandingCustomers workspace />
    </>
  );
}
export function WorkspaceMissing() {
  return (
    <section className="panel">
      <h1>Workspace page not found</h1>
      <p>This private route is not available.</p>
      <Link to="/workspace/overview">Return to workspace overview</Link>
    </section>
  );
}
class WorkspaceBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <section className="panel">
        <h1>Workspace unavailable</h1>
        <p>
          Reload to try again. No private data has been replaced with
          demonstration records.
        </p>
        <button onClick={() => location.reload()}>Reload workspace</button>
      </section>
    ) : (
      this.props.children
    );
  }
}
function WorkspaceBody() {
  const c = useWorkspace();
  return (
    <>
      <nav aria-label="Workspace navigation">
        <NavLink to="/workspace/overview">Overview</NavLink>
        <NavLink to="/workspace/receivables/invoices">Receivables</NavLink>
        <NavLink to="/workspace/checklist">Monthly checklist</NavLink>
        <NavLink to="/workspace/subscriptions">Subscriptions</NavLink>
        {c.entities.some((e) => e.canImport) && (
          <NavLink to="/workspace/imports">Imports</NavLink>
        )}
        {c.administrator && (
          <NavLink to="/workspace/administration">Administration</NavLink>
        )}
      </nav>
      <Outlet />
    </>
  );
}
export function Workspace() {
  const configured =
    import.meta.env.VITE_AUTH_MODE === "session" &&
    import.meta.env.VITE_API_BASE_URL === "/api/v1" &&
    import.meta.env.VITE_CHECKLIST_MODE === "api" &&
    import.meta.env.VITE_RECEIVABLES_MODE === "api";
  return (
    <div className="app production-workspace">
      <header>
        <Link className="brand" to="/">
          <BrandMark />
          FinAI
        </Link>
        <span>Finance workspace</span>
        <Link to="/welcome">Explore the separate demo</Link>
      </header>
      <main>
        <WorkspaceBoundary>
          {configured ? (
            <SessionGate title="Sign in to your finance workspace">
              <WorkspaceContext>
                <WorkspaceBody />
              </WorkspaceContext>
            </SessionGate>
          ) : (
            <section className="panel">
              <h1>Workspace configuration required</h1>
              <p role="alert">
                This workspace is not configured for authenticated data. Contact
                your administrator.
              </p>
            </section>
          )}
        </WorkspaceBoundary>
      </main>
    </div>
  );
}
