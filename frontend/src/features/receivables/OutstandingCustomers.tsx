import { useId } from "react";
import { Link } from "react-router-dom";
import { useDemo } from "../../store";
import { money } from "../../demo/selectors";
import { outstandingCustomers } from "./outstandingCustomers";
import "./outstanding-customers.css";

import { ImportedOutstandingCustomers } from "./ImportedOutstandingCustomers";

export function OutstandingCustomers() {
  const mode = import.meta.env.VITE_RECEIVABLES_MODE || "demo";
  if (mode === "api") return <ImportedOutstandingCustomers />;
  if (mode !== "demo")
    return (
      <section className="panel outstanding-customers">
        <h2>Outstanding by customer</h2>
        <p role="alert">
          Receivables is not configured correctly. Contact your administrator.
        </p>
      </section>
    );
  return <DemoOutstandingCustomers />;
}
function DemoOutstandingCustomers() {
  const state = useDemo(),
    result = outstandingCustomers(state),
    titleId = useId();
  return (
    <section className="panel outstanding-customers" aria-labelledby={titleId}>
      <div className="section-heading">
        <h2 id={titleId}>Outstanding by customer</h2>
        {result.available && (
          <Link
            className="inline-link"
            to="/receivables/invoices?status=Outstanding"
          >
            View outstanding invoices
          </Link>
        )}
      </div>
      {result.available && (
        <p className="outstanding-customers-basis">
          Current balances for invoices issued in the selected period · USD ·
          Demo
        </p>
      )}
      {!result.available ? (
        <p role="status">
          Outstanding balances are unavailable for this selection.
        </p>
      ) : (
        <>
          <dl className="outstanding-customers-totals">
            <div>
              <dt>Total current outstanding</dt>
              <dd>{money(result.totalCents)}</dd>
            </div>
            <div>
              <dt>Outstanding invoices</dt>
              <dd>{result.invoiceCount}</dd>
            </div>
            <div>
              <dt>Customers</dt>
              <dd>{result.customerCount}</dd>
            </div>
          </dl>
          {result.rows.length ? (
            <table>
              <caption>
                Largest balances · showing {result.rows.length} of{" "}
                {result.customerCount} customers
              </caption>
              <thead>
                <tr>
                  <th scope="col">Customer</th>
                  <th scope="col">Outstanding invoices</th>
                  <th scope="col">Amount due</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row) => (
                  <tr key={row.customerId}>
                    <td>
                      {row.customerAvailable ? (
                        <Link
                          to={`/receivables/customers/${encodeURIComponent(row.customerId)}`}
                        >
                          {row.customerName}
                        </Link>
                      ) : (
                        row.customerName
                      )}
                    </td>
                    <td>{row.invoiceCount}</td>
                    <td>{money(row.remainingCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>No outstanding invoices in this selection.</p>
          )}
        </>
      )}
      <p className="outstanding-customers-note">
        This summarizes current invoice balances and may differ from the
        ledger-based receivables KPI.
      </p>
    </section>
  );
}
