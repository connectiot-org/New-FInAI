import { Component, useEffect, type ReactNode } from "react";
import {
  BrowserRouter,
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { BrandMark } from "../components/shared/BrandMark";
import { SessionGate } from "../components/SessionGate";
import { ToastProvider } from "../components/ui/primitives";
import { MonthlyChecklist } from "../features/checklist/MonthlyChecklist";
import { SubscriptionRenewals } from "../features/subscriptions/SubscriptionRenewals";
import { PaymentDueDate } from "../features/payment-due-date/PaymentDueDate";
import "./product.css";
const links = [
  ["/tools/payment-due-date", "Payment due-date calculator"],
  ["/tools/subscriptions", "Subscription renewals"],
  ["/close/checklist", "Monthly checklist"],
] as const;
function Workspace() {
  const { pathname } = useLocation();
  useEffect(() => {
    document.title = `${links.find(([path]) => path === pathname)?.[1] || "Finance tools"} · FinAI`;
  }, [pathname]);
  return (
    <div className="product-workspace">
      <a className="product-skip" href="#product-main">
        Skip to content
      </a>
      <header className="product-header">
        <Link className="brand" to="/">
          <BrandMark />
          FinAI
        </Link>
        <nav aria-label="Finance tools">
          {links.map(([to, text]) => (
            <NavLink key={to} to={to}>
              {text}
            </NavLink>
          ))}
        </nav>
      </header>
      <main id="product-main" className="product-main" tabIndex={-1}>
        <SessionGate title="Sign in to FinAI">
          <Routes>
            <Route
              path="/"
              element={<Navigate to="/tools/payment-due-date" replace />}
            />
            <Route
              path="/welcome"
              element={<Navigate to="/tools/payment-due-date" replace />}
            />
            <Route
              path="/tools/payment-due-date"
              element={<PaymentDueDate />}
            />
            <Route
              path="/tools/subscriptions"
              element={<SubscriptionRenewals />}
            />
            <Route path="/close/checklist" element={<MonthlyChecklist />} />
            <Route
              path="*"
              element={
                <section className="panel">
                  <h1>Page unavailable</h1>
                  <p>This page is not available in your FinAI workspace.</p>
                  <Link className="button primary" to="/">
                    Go to finance tools
                  </Link>
                </section>
              }
            />
          </Routes>
        </SessionGate>
      </main>
    </div>
  );
}
class ProductBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main className="empty" role="alert">
        <h1>Unable to display FinAI</h1>
        <p>
          Reload the page to try again. Your saved records remain on the server.
        </p>
        <button onClick={() => location.reload()}>Reload</button>
      </main>
    ) : (
      this.props.children
    );
  }
}
export function ProductApp() {
  return (
    <ProductBoundary>
      <ToastProvider>
        <BrowserRouter>
          <Workspace />
        </BrowserRouter>
      </ToastProvider>
    </ProductBoundary>
  );
}
