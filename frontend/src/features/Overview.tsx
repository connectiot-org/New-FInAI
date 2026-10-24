import { Link } from "react-router-dom";
import { ArrowRight, Plus } from "lucide-react";
import { useDemo } from "../store";
import { FinanceSnapshot } from "../components/shared/FinanceSnapshot";
import { PageHeader } from "../components/shared/Common";
import { OutstandingCustomers } from "./receivables/OutstandingCustomers";
export function Overview() {
  const s = useDemo();
  return (
    <div className="reference-app-overview">
      <PageHeader
        title="Overview"
        description="Your books, your workflows, and the context behind every number."
        action={
          <Link className="button primary" to="/accounting/journals?new=1">
            <Plus size={15} />
            New journal entry
          </Link>
        }
      />
      <FinanceSnapshot />
      <OutstandingCustomers />
      <section className="panel activity-panel">
        <div className="section-heading">
          <h2>Recent activity</h2>
          <Link className="inline-link" to="/audit-log">
            View all
            <ArrowRight size={14} />
          </Link>
        </div>
        {s.audit.slice(0, 4).map((a) => (
          <div className="activity-item" key={a.id}>
            <span className="activity-dot" />
            <div>
              <strong>{a.action}</strong>
              <p>
                {a.actor} · {a.object}
              </p>
            </div>
            <time>{new Date(a.date).toLocaleDateString()}</time>
          </div>
        ))}
      </section>
    </div>
  );
}
