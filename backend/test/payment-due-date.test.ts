import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calculatePaymentDueDate,
  paymentDueDateInput,
} from "../src/payment-due-date";
import { parse } from "../src/validation";
const entityId = "22222222-2222-4222-8222-222222222222";
test("payment due-date arithmetic: Net 0/30/365, year/month/leap boundaries, early years and status signs", () => {
  const cases: [string, number, string, string, number, string][] = [
    ["2026-10-01", 30, "2026-11-02", "2026-10-31", -2, "overdue"],
    ["2026-10-01", 0, "2026-10-01", "2026-10-01", 0, "due_today"],
    ["2026-10-01", 7, "2026-10-01", "2026-10-08", 7, "not_due"],
    ["2026-01-31", 30, "2026-01-31", "2026-03-02", 30, "not_due"],
    ["2026-12-31", 1, "2027-01-01", "2027-01-01", 0, "due_today"],
    ["2028-02-28", 1, "2028-02-29", "2028-02-29", 0, "due_today"],
    ["2028-02-29", 1, "2028-03-02", "2028-03-01", -1, "overdue"],
    ["1900-02-28", 1, "1900-03-01", "1900-03-01", 0, "due_today"],
    ["2000-02-28", 1, "2000-02-28", "2000-02-29", 1, "not_due"],
    ["0001-01-01", 0, "0001-01-01", "0001-01-01", 0, "due_today"],
    ["0001-01-01", 365, "0002-01-01", "0002-01-01", 0, "due_today"],
    ["0099-12-31", 1, "0100-01-01", "0100-01-01", 0, "due_today"],
    ["2028-01-01", 365, "2028-01-01", "2028-12-31", 365, "not_due"],
    ["9999-12-31", 0, "9999-12-30", "9999-12-31", 1, "not_due"],
    ["2026-03-07", 2, "2026-03-09", "2026-03-09", 0, "due_today"],
  ];
  for (const [
    invoiceDate,
    termsDays,
    asOfDate,
    dueDate,
    daysUntilDue,
    status,
  ] of cases) {
    const input = { entityId, invoiceDate, termsDays, asOfDate };
    assert.deepEqual(
      calculatePaymentDueDate(parse(paymentDueDateInput, input)),
      { ...input, dueDate, daysUntilDue, status },
    );
  }
});
test("payment due-date validation rejects rollover/unsupported dates, overflow and noninteger terms", () => {
  const input = {
    entityId,
    invoiceDate: "2026-10-01",
    termsDays: 30,
    asOfDate: "2026-11-02",
  };
  for (const extra of [
    { invoiceDate: "1900-02-29" },
    { invoiceDate: "0000-01-01" },
    { invoiceDate: "2026-04-31" },
    { asOfDate: "2026-02-29" },
    { invoiceDate: "2026-1-01" },
    { invoiceDate: "2026-10-01T00:00:00Z" },
    { termsDays: "30" },
    { termsDays: 0.1 },
    { termsDays: -1 },
    { termsDays: 366 },
    { entityId: "bad" },
    { role: "Admin" },
  ])
    assert.throws(() => parse(paymentDueDateInput, { ...input, ...extra }));
  assert.throws(
    () =>
      calculatePaymentDueDate({
        ...input,
        invoiceDate: "9999-12-31",
        termsDays: 1,
      }),
    (error: any) => error.status === 422 && /9999/.test(error.message),
  );
});
