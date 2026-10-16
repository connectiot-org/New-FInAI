import type { DemoState, Journal } from "../types/domain";
export const money = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(cents / 100);
export const shortMoney = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(cents / 100);
export const inScope = (s: DemoState, x: { entity: string; date?: string }) =>
  x.entity === s.entity &&
  (!x.date || s.period === "all" || x.date.startsWith(s.period));
export function ledger(s: DemoState, closing = false) {
  return s.journals
    .filter(
      (j) =>
        j.status === "Posted" &&
        j.entity === s.entity &&
        (s.period === "all" ||
          (closing
            ? j.date.slice(0, 7) <= s.period
            : j.date.startsWith(s.period))),
    )
    .flatMap((j) =>
      j.lines.map((l, i) => ({
        ...l,
        id: `${j.id}-${i}`,
        journal: j.id,
        date: j.date,
        memo: j.memo,
        source: j.source,
      })),
    );
}
export function balances(s: DemoState, closing = false) {
  const result: Record<string, number> = {};
  for (const l of ledger(s, closing))
    result[l.account] = (result[l.account] ?? 0) + l.debit - l.credit;
  return result;
}
export function metrics(s: DemoState) {
  const b = balances(s),
    end = balances(s, true);
  let revenue = 0,
    expenses = 0;
  for (const a of s.accounts) {
    if (a.type === "Revenue") revenue -= b[a.id] ?? 0;
    if (a.type === "Expense") expenses += b[a.id] ?? 0;
  }
  return {
    cash: end["1000"] ?? 0,
    revenue,
    expenses,
    profit: revenue - expenses,
    receivables: end["1100"] ?? 0,
    payables: -(end["2000"] ?? 0),
  };
}
export const balanced = (j: Pick<Journal, "lines">) =>
  j.lines.length >= 2 &&
  j.lines.every(
    (l) =>
      Number.isSafeInteger(l.debit) &&
      Number.isSafeInteger(l.credit) &&
      l.debit >= 0 &&
      l.credit >= 0 &&
      !(l.debit && l.credit),
  ) &&
  j.lines.reduce((v, l) => v + l.debit - l.credit, 0) === 0 &&
  j.lines.some((l) => l.debit > 0);
export function downloadCsv(name: string, rows: (string | number)[][]) {
  const clean = (value: string | number) => {
    let text = String(value);
    if (/^[\s]*[=+@-]/.test(text) && typeof value !== "number")
      text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  const blob = new Blob(
    ["\uFEFF" + rows.map((row) => row.map(clean).join(",")).join("\r\n")],
    { type: "text/csv;charset=utf-8" },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
