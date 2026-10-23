import type { DemoState } from "../../types/domain";
import { inScope } from "../../demo/selectors";

export type OutstandingCustomer = {
  customerId: string;
  customerName: string;
  customerAvailable: boolean;
  invoiceCount: number;
  remainingCents: number;
};
export type OutstandingCustomersResult =
  | { available: false }
  | {
      available: true;
      totalCents: number;
      invoiceCount: number;
      customerCount: number;
      rows: OutstandingCustomer[];
    };

/** Current invoice balances, scoped by issue date; not historical aging or ledger AR. */
export function outstandingCustomers(
  state: DemoState,
): OutstandingCustomersResult {
  const entity = state.entities.find((value) => value.id === state.entity);
  if (!entity || entity.currency !== "USD") return { available: false };

  const groups = new Map<
    string,
    { customerId: string; invoiceCount: number; remainingCents: number }
  >();
  let totalCents = 0,
    invoiceCount = 0;
  for (const invoice of state.invoices) {
    if (!inScope(state, invoice)) continue;
    // Validate every scoped invoice, including drafts and fully paid records.
    if (
      !Number.isSafeInteger(invoice.amount) ||
      !Number.isSafeInteger(invoice.paid) ||
      invoice.amount < 0 ||
      invoice.paid < 0 ||
      invoice.paid > invoice.amount
    )
      return { available: false };
    if (!(invoice.status !== "Draft" && invoice.paid < invoice.amount))
      continue;

    const remaining = invoice.amount - invoice.paid;
    const group = groups.get(invoice.customer) || {
      customerId: invoice.customer,
      invoiceCount: 0,
      remainingCents: 0,
    };
    const nextGroup = group.remainingCents + remaining,
      nextTotal = totalCents + remaining;
    if (!Number.isSafeInteger(nextGroup) || !Number.isSafeInteger(nextTotal))
      return { available: false };
    group.remainingCents = nextGroup;
    group.invoiceCount++;
    groups.set(invoice.customer, group);
    totalCents = nextTotal;
    invoiceCount++;
  }

  const rows = [...groups.values()]
    .sort(
      (a, b) =>
        b.remainingCents - a.remainingCents ||
        (a.customerId < b.customerId
          ? -1
          : a.customerId > b.customerId
            ? 1
            : 0),
    )
    .slice(0, 5)
    .map((group) => {
      const customer = state.customers.find(
        (value) => value.id === group.customerId && value.entity === entity.id,
      );
      return {
        ...group,
        customerName: customer?.name ?? "Customer unavailable",
        customerAvailable: !!customer,
      };
    });
  return {
    available: true,
    totalCents,
    invoiceCount,
    customerCount: groups.size,
    rows,
  };
}
