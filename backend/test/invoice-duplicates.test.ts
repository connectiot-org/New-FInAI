import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeInvoiceCsv, MAX_CSV_BYTES } from "../src/invoice-duplicates";
import { ApiError } from "../src/errors";
const header =
  "supplier_id,supplier_name,invoice_number,invoice_date,amount,currency";
const row = "V001,Example,INV-01,2028-02-29,00012.5,USD";
const csv = (...rows: string[]) => [header, ...rows].join("\n");
function rejects(value: string, message: RegExp) {
  assert.throws(
    () => analyzeInvoiceCsv(value),
    (error) =>
      error instanceof ApiError &&
      error.status === 422 &&
      message.test(error.message),
  );
}
test("CSV quoting/BOM/reordered headers/line endings and exact money strings", () => {
  const result = analyzeInvoiceCsv(
    '\uFEFFcurrency,amount,invoice_date,invoice_number,supplier_name,supplier_id\r\nUSD,00012.5,2028-02-29,"INV,01","Example ""quoted"" company",001\r\n\r\nEUR,999999999999.99,0001-01-01,INV-02,Other,002\r',
  );
  assert.deepEqual(result.summary, {
    rowCount: 2,
    groupCount: 0,
    flaggedRowCount: 0,
  });
  assert.equal(result.rows[0].supplierName, 'Example "quoted" company');
  assert.equal(result.rows[0].invoiceNumber, "INV,01");
  assert.equal(result.rows[0].supplierId, "001");
  assert.equal(result.rows[0].amount, "12.50");
  assert.equal(result.rows[1].amount, "999999999999.99");
  assert.equal(result.rows[1].recordNumber, 4);
});
test("duplicate groups flag all matching keys, preserve zeros/punctuation/case-sensitive supplier IDs, ignore money/date/name", () => {
  const result = analyzeInvoiceCsv(
    csv(
      row,
      " V001 , Different name , inv-01 ,2026-10-02,0,EUR",
      "v001,Example,INV-01,2026-10-01,12,USD",
      "V001,Example,INV01,2026-10-01,12,USD",
      "V001,Example,INV-001,2026-10-01,12,USD",
      "V002,Example,REF,2026-10-01,12,USD",
      "V002,Example,REF,2026-10-01,12,USD",
      "V001,Example,INV-01,2026-10-01,12,GBP",
    ),
  );
  assert.deepEqual(result.summary, {
    rowCount: 8,
    groupCount: 2,
    flaggedRowCount: 5,
  });
  assert.deepEqual(
    result.rows.map((v) => [v.group, v.groupSize]),
    [
      [1, 3],
      [1, 3],
      [null, 1],
      [null, 1],
      [null, 1],
      [2, 2],
      [2, 2],
      [1, 3],
    ],
  );
});
test("invalid CSV grammar, headers, record width and empty uploads fail as a whole", () => {
  for (const input of [
    "",
    header,
    "\n" + csv(row),
    csv('"V001,Example,INV-01,2026-01-01,1,USD'),
    csv('V0"01,Example,INV-01,2026-01-01,1,USD'),
    csv('"V001"x,Example,INV-01,2026-01-01,1,USD'),
    csv(row + ",extra"),
    csv(row, "wrong"),
    csv(" "),
    header.replace("currency", "amount") + "\n" + row,
    header + ",unknown\n" + row,
  ])
    rejects(input, /CSV/);
});
test("invalid fields return record/field diagnostics without echoing uploaded values", () => {
  for (const [index, value, name] of [
    [0, "", "supplier_id"],
    [1, "secret\tvalue", "supplier_name"],
    [2, "x".repeat(201), "invoice_number"],
    [3, "2026-02-29", "invoice_date"],
    [3, "0000-01-01", "invoice_date"],
    [3, "2026-13-01", "invoice_date"],
    [4, "-1", "amount"],
    [4, "1e2", "amount"],
    [4, "1.001", "amount"],
    [4, "1000000000000", "amount"],
    [5, "usd", "currency"],
  ] as const) {
    const fields = row.split(",");
    fields[index] = value;
    rejects(csv(fields.join(",")), new RegExp(`record 2, ${name}:`));
  }
  rejects(
    csv('V001,"secret\nvalue",INV-01,2026-01-01,1,USD'),
    /record 2, supplier_name:/,
  );
  rejects(csv(row.replace("Example", "\ud800")), /Unicode/);
});
test("500-row and UTF-8 byte bounds are enforced before expensive parsing", () => {
  assert.equal(
    analyzeInvoiceCsv(csv(...Array(500).fill(row))).summary.flaggedRowCount,
    500,
  );
  rejects(csv(...Array(501).fill(row)), /500/);
  rejects("é".repeat(MAX_CSV_BYTES / 2 + 1), /128 KiB/);
  const base = csv(row);
  assert.equal(
    analyzeInvoiceCsv(
      base + "\n".repeat(MAX_CSV_BYTES - Buffer.byteLength(base)),
    ).summary.rowCount,
    1,
  );
  rejects(base + "\n".repeat(MAX_CSV_BYTES), /128 KiB/);
});
