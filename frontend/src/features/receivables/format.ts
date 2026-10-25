export function decimalCents(cents: number) {
  if (!Number.isSafeInteger(cents) || cents < 0)
    throw new Error("Invalid monetary value.");
  const n = BigInt(cents);
  return `${n / 100n}.${(n % 100n).toString().padStart(2, "0")}`;
}
export function usdCents(cents: number) {
  const [whole, fraction] = decimalCents(cents).split(".");
  return (
    "$" + new Intl.NumberFormat("en-US").format(BigInt(whole)) + "." + fraction
  );
}
export function compareSourceIds(a: string, b: string) {
  const x = new TextEncoder().encode(a),
    y = new TextEncoder().encode(b);
  for (let i = 0; i < Math.min(x.length, y.length); i++)
    if (x[i] !== y[i]) return x[i] - y[i];
  return x.length - y.length;
}
const csvCell = (v: string | number) => {
  let s = String(v);
  if (/^[\s]*[=+@-]/.test(s) && typeof v === "string") s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
};
type ExportPage = {
  entityId: string;
  period: string;
  currency: string;
  source: {
    snapshotId: string;
    version: number;
    sourceName: string;
    sourceCapturedAt: string;
    importedAt: string;
  };
  filters: { status: string; customerId: string | null; search: string };
  total: number;
  nextOffset: number | null;
  items: {
    invoiceId: string;
    customerId: string;
    customerName: string | null;
    issuedOn: string;
    status: string;
    amountCents: number;
    paidCents: number;
    remainingCents: number;
  }[];
};
export function invoiceCsv(page: ExportPage) {
  if (page.items.length !== page.total || page.nextOffset !== null)
    throw new Error("Export is incomplete.");
  const rows: (string | number)[][] = [
    ["Entity ID", page.entityId],
    ["Currency", page.currency],
    ["Snapshot ID", page.source.snapshotId],
    ["Snapshot version", page.source.version],
    ["Source", page.source.sourceName],
    ["Source captured UTC", page.source.sourceCapturedAt],
    ["Imported UTC", page.source.importedAt],
    ["Invoice issue period", page.period],
    ["Status filter", page.filters.status],
    ["Customer filter", page.filters.customerId || ""],
    ["Literal search filter", page.filters.search],
    [],
    [
      "Source invoice ID",
      "Source customer ID",
      "Customer name",
      "Issued on",
      "Status",
      "Amount (USD)",
      "Cumulative paid (USD)",
      "Remaining (USD)",
    ],
    ...page.items.map((r) => [
      r.invoiceId,
      r.customerId,
      r.customerName ?? "Customer unavailable",
      r.issuedOn,
      r.status,
      decimalCents(r.amountCents),
      decimalCents(r.paidCents),
      decimalCents(r.remainingCents),
    ]),
  ];
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}
export function downloadInvoiceCsv(page: ExportPage) {
  const url = URL.createObjectURL(
    new Blob([invoiceCsv(page)], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `receivables-${page.source.snapshotId}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
