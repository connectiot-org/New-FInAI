import { z } from "zod";
import { apiRequest } from "../../lib/api";
const text = z
  .string()
  .min(1)
  .refine(
    (v) =>
      v === v.trim() &&
      Array.from(v).length <= 200 &&
      Array.from(v).every((c) => {
        const point = c.codePointAt(0)!;
        return (
          point >= 32 && point !== 127 && (point < 0xd800 || point > 0xdfff)
        );
      }),
  );
const row = z.strictObject({
  recordNumber: z.number().int().min(2).max(131073),
  supplierId: text,
  supplierName: text,
  invoiceNumber: text,
  invoiceDate: z
    .string()
    .regex(/^(?!0000)\d{4}-\d{2}-\d{2}$/)
    .refine(
      (v) =>
        Number.isFinite(new Date(`${v}T00:00:00Z`).getTime()) &&
        new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v,
    ),
  amount: z.string().regex(/^(0|[1-9]\d{0,11})\.\d{2}$/),
  currency: z.string().regex(/^[A-Z]{3}$/),
  group: z.number().int().min(1).max(250).nullable(),
  groupSize: z.number().int().min(1).max(500),
});
const result = z
  .strictObject({
    entityId: z.uuid(),
    summary: z.strictObject({
      rowCount: z.number().int().min(1).max(500),
      groupCount: z.number().int().min(0).max(250),
      flaggedRowCount: z.number().int().min(0).max(500),
    }),
    rows: z.array(row).min(1).max(500),
  })
  .refine((data) => {
    const groups = new Map<string, z.infer<typeof row>[]>();
    let previous = 1;
    for (const r of data.rows) {
      if (r.recordNumber <= previous) return false;
      previous = r.recordNumber;
      const key = JSON.stringify([r.supplierId, r.invoiceNumber.toUpperCase()]);
      const group = groups.get(key) || [];
      group.push(r);
      groups.set(key, group);
    }
    let groupCount = 0,
      flaggedRowCount = 0;
    for (const group of groups.values()) {
      const number = group.length > 1 ? ++groupCount : null;
      if (number !== null) flaggedRowCount += group.length;
      if (group.some((r) => r.group !== number || r.groupSize !== group.length))
        return false;
    }
    return (
      data.summary.rowCount === data.rows.length &&
      data.summary.groupCount === groupCount &&
      data.summary.flaggedRowCount === flaggedRowCount
    );
  });
export type CheckResult = z.infer<typeof result>;
export const invoiceApi = {
  entities: (signal: AbortSignal) =>
    apiRequest(
      "/entities",
      z.strictObject({
        items: z.array(z.strictObject({ id: z.uuid(), name: z.string() })),
      }),
      { signal },
    ),
  async check(entityId: string, csv: string, signal: AbortSignal) {
    const data = await apiRequest("/invoice-duplicate-checks", result, {
      method: "POST",
      body: { entityId, csv },
      signal,
    });
    if (data.entityId !== entityId)
      throw new Error(
        "Backend returned records for a different entity. Clear the file and retry.",
      );
    return data;
  },
};
export const template =
  'supplier_id,supplier_name,invoice_number,invoice_date,amount,currency\r\nV001,"Example Supplies, Inc.",INV-100,2026-10-01,125.50,USD\r\nV001,"Example Supplies, Inc.",inv-100,2026-10-02,125.50,USD\r\nV002,Example Services,INV-200,2026-10-03,80.00,EUR\r\n';
// Quote every value and neutralize spreadsheet formulas, including leading whitespace.
const cell = (v: string | number | null) => {
  let value = v === null ? "" : String(v);
  if (/^[\s\uFEFF]*[=+\-@]/u.test(value)) value = "'" + value;
  return '"' + value.replaceAll('"', '""') + '"';
};
export function reportCsv(data: CheckResult) {
  const headers = [
    "record_number",
    "supplier_id",
    "supplier_name",
    "invoice_number",
    "invoice_date",
    "amount",
    "currency",
    "possible_duplicate",
    "group",
    "group_size",
  ];
  return (
    "\uFEFF" +
    [
      headers,
      ...data.rows.map((r) => [
        r.recordNumber,
        r.supplierId,
        r.supplierName,
        r.invoiceNumber,
        r.invoiceDate,
        r.amount,
        r.currency,
        r.group === null ? "No" : "Review",
        r.group,
        r.groupSize,
      ]),
    ]
      .map((values) => values.map(cell).join(","))
      .join("\r\n") +
    "\r\n"
  );
}
export function downloadCsv(value: string, filename: string) {
  const url = URL.createObjectURL(
    new Blob([value], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
