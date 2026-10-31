import { OperationalSource } from "../features/assistant/OperationalSource";
import { ProductionAssistant } from "../features/assistant/Assistant";
import { LedgerSource } from "../features/assistant/LedgerSource";
import { Imports } from "../features/workspace/Imports";
import { Administration as WorkspaceAdministration } from "../features/workspace/Administration";
import { BrandMark } from "../components/shared/BrandMark";
import { Component, Suspense, lazy, useEffect, type ReactNode } from "react";
import {
  createBrowserRouter,
  Navigate,
  RouterProvider,
  useNavigate,
  Link,
} from "react-router-dom";
import { ArrowRight, BookOpen, Check, ShieldCheck } from "lucide-react";
import { Shell } from "./Shell";
import {
  MarketingLayout,
  HomePage,
  ProductPage,
  ResourcesPage,
  AboutPage,
  DemoCustomersPage,
} from "../features/marketing/Marketing";
import { useAppDispatch, useDemo, command } from "../store";
import { Overview } from "../features/Overview";
import {
  Accounts,
  Audit,
  JournalDetail,
  Journals,
  Ledger,
  TrialBalance,
} from "../features/Accounting";
import {
  BankAccounts,
  BillDetail,
  Bills,
  ContractDetail,
  Contracts,
  InvoiceDetail,
  Invoices,
  Parties,
  PartyDetail,
  Reconciliation,
  Schedules,
} from "../features/Operations";
import { Close } from "../features/Close";
import { SubscriptionRenewals } from "../features/subscriptions/SubscriptionRenewals";
import { MonthlyChecklist } from "../features/checklist/MonthlyChecklist";
import {
  Consolidation,
  Entities,
  Reports,
  Statement,
} from "../features/Reports";
import { Assistant } from "../features/Assistant";
import {
  AutomationDetail,
  Automations,
  Integrations,
  Settings,
} from "../features/Administration";
import {
  Workspace,
  WorkspaceOverview,
  WorkspaceMissing,
} from "../features/workspace/Workspace";
import { ReceivablesRegister } from "../features/workspace/ReceivablesRegister";
function Welcome() {
  useEffect(() => {
    document.title = "Welcome · FinAI";
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute(
        "content",
        "Enter the FinAI accounting demo with fictional Northstar Analytics records. No sign-in or credentials required.",
      );
  }, []);
  const s = useDemo(),
    dispatch = useAppDispatch(),
    navigate = useNavigate();
  return (
    <div className="welcome">
      <div className="welcome-story">
        <Link to="/welcome" className="brand">
          <BrandMark />
          FinAI
        </Link>
        <div>
          <span className="eyebrow">THE BIG PICTURE. THE SMALL DETAILS.</span>
          <h1>
            Your books.
            <br />A clearer perspective.
          </h1>
          <p>
            A connected accounting workspace for the people moving business
            forward.
          </p>
          <div className="welcome-art">
            <div>
              <BookOpen size={24} />
              <span>One source of truth</span>
              <strong>Balanced by design</strong>
            </div>
            <div>
              <Check size={18} />
              Revenue recognized
            </div>
            <div>
              <Check size={18} />
              Close with confidence
            </div>
          </div>
        </div>
        <p>Original FinAI demo · Synthetic Northstar Analytics data</p>
      </div>
      <div className="welcome-entry">
        <span className="tag">Demo workspace</span>
        <h2>Make yourself at home.</h2>
        <p>
          Explore Northstar Analytics with six months of connected accounting
          data.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const profile = String(
              new FormData(e.currentTarget).get("profile"),
            );
            dispatch(command({ kind: "enter", profile }));
            navigate("/overview");
          }}
        >
          <label className="field">
            <span>Your demo name (optional)</span>
            <input
              name="profile"
              placeholder="Alex Morgan"
              defaultValue={s.entered ? s.profile : ""}
            />
          </label>
          <button className="primary" type="submit">
            Enter demo workspace
            <ArrowRight size={16} />
          </button>
        </form>
        <p>
          <Link to="/workspace">Sign in to your finance workspace</Link>
        </p>
        <div className="welcome-note">
          <ShieldCheck size={20} />
          <p>
            No sign-in, credentials, or backend required.
            <br />
            Everything stays in this browser.
          </p>
        </div>
      </div>
    </div>
  );
}
function NotFound() {
  return (
    <div className="empty">
      <h1>Page not found</h1>
      <p>The route does not exist in this demo.</p>
      <Link className="button primary" to="/overview">
        Go to overview
      </Link>
    </div>
  );
}
const ImportChanges = lazy(() =>
  import("../features/workspace/ImportChanges").then((module) => ({
    default: module.ImportChanges,
  })),
);
const LegacyAssistant = lazy(() =>
  import("../features/LegacyAssistant").then((module) => ({
    default: module.LegacyAssistant,
  })),
);
const router = createBrowserRouter([
  {
    path: "/",
    element: <MarketingLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "product/:product", element: <ProductPage /> },
      { path: "resources", element: <ResourcesPage /> },
      { path: "about", element: <AboutPage /> },
      { path: "customers", element: <DemoCustomersPage /> },
    ],
  },
  { path: "/welcome", element: <Welcome /> },
  {
    path: "/assistant",
    element: <Navigate to="/demo/assistant" replace />,
  },
  {
    path: "/workspace/assistant",
    element: <Navigate to="/demo/assistant" replace />,
  },
  {
    path: "/workspace",
    element: <Workspace />,
    children: [
      { path: "assistant/records", element: <ProductionAssistant /> },
      { path: "assistant/source", element: <OperationalSource /> },
      { path: "ledger", element: <LedgerSource /> },
      { path: "imports", element: <Imports /> },
      { path: "administration", element: <WorkspaceAdministration /> },
      { index: true, element: <Navigate to="/workspace/overview" replace /> },
      { path: "overview", element: <WorkspaceOverview /> },
      {
        path: "receivables/invoices",
        element: <ReceivablesRegister view="invoice" />,
      },
      {
        path: "receivables/changes",
        element: (
          <Suspense fallback={<p role="status">Opening import comparison…</p>}>
            <ImportChanges />
          </Suspense>
        ),
      },
      {
        path: "receivables/customers",
        element: <ReceivablesRegister view="customer" />,
      },
      {
        path: "receivables/periods",
        element: <ReceivablesRegister view="issue-period" />,
      },
      { path: "checklist", element: <MonthlyChecklist workspace /> },
      { path: "subscriptions", element: <SubscriptionRenewals /> },
      { path: "*", element: <WorkspaceMissing /> },
    ],
  },
  {
    element: <Shell />,
    children: [
      { path: "overview", element: <Overview /> },
      { path: "accounting/ledger", element: <Ledger /> },
      { path: "accounting/journals", element: <Journals /> },
      { path: "accounting/journals/:id", element: <JournalDetail /> },
      { path: "accounting/accounts", element: <Accounts /> },
      { path: "accounting/trial-balance", element: <TrialBalance /> },
      { path: "receivables/invoices", element: <Invoices /> },
      { path: "receivables/invoices/:id", element: <InvoiceDetail /> },
      { path: "receivables/customers", element: <Parties /> },
      { path: "receivables/customers/:id", element: <PartyDetail /> },
      { path: "revenue/contracts", element: <Contracts /> },
      { path: "revenue/contracts/:id", element: <ContractDetail /> },
      { path: "revenue/schedules", element: <Schedules /> },
      { path: "payables/bills", element: <Bills /> },
      { path: "payables/bills/:id", element: <BillDetail /> },
      { path: "payables/vendors", element: <Parties vendor /> },
      { path: "payables/vendors/:id", element: <PartyDetail vendor /> },
      { path: "banking/accounts", element: <BankAccounts /> },
      { path: "banking/reconciliation", element: <Reconciliation /> },
      { path: "close", element: <Close /> },
      { path: "close/checklist", element: <MonthlyChecklist /> },
      { path: "tools/subscriptions", element: <SubscriptionRenewals /> },
      { path: "reports", element: <Reports /> },
      {
        path: "reports/profit-and-loss",
        element: <Statement kind="profit-and-loss" />,
      },
      {
        path: "reports/balance-sheet",
        element: <Statement kind="balance-sheet" />,
      },
      { path: "reports/cash-flow", element: <Statement kind="cash-flow" /> },
      { path: "entities", element: <Entities /> },
      { path: "entities/consolidation", element: <Consolidation /> },
      { path: "demo/assistant", element: <Assistant /> },
      {
        path: "demo/assistant/offline",
        element: (
          <Suspense fallback={<p role="status">Opening example…</p>}>
            <LegacyAssistant />
          </Suspense>
        ),
      },
      { path: "automations", element: <Automations /> },
      { path: "automations/:id", element: <AutomationDetail /> },
      { path: "integrations", element: <Integrations /> },
      { path: "audit-log", element: <Audit /> },
      {
        path: "settings",
        element: <Navigate to="/settings/workspace" replace />,
      },
      { path: "settings/:section", element: <Settings /> },
      { path: "*", element: <NotFound /> },
    ],
  },
]);
export class AppBoundary extends Component<
  { children: ReactNode },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <div className="empty">
        <h1>Unable to display the demo</h1>
        <p>
          Try reloading. If local data is damaged, reset the demo to recover.
        </p>
        <button onClick={() => location.reload()}>Reload</button>
        <button
          onClick={() => {
            localStorage.removeItem("finai-demo-v1");
            location.assign("/welcome");
          }}
        >
          Reset local demo
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}
export function AppRouter() {
  return (
    <AppBoundary>
      <RouterProvider router={router} />
    </AppBoundary>
  );
}
