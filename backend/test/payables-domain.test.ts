import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  fields,
  totals,
  csv,
  policySchema,
  routePolicy,
  actionSchema,
  fingerprint,
  referenceKey,
} from "../src/payables/domain";
const first = randomUUID(),
  second = randomUUID(),
  submitter = randomUUID();
const bill = fields.parse({
  supplierId: randomUUID(),
  reference: "INV-001",
  invoiceDate: "2026-11-01",
  dueDate: "2026-12-01",
  currency: "GBP",
  declaredGross: "12000",
  lines: [
    {
      description: "Services",
      quantity: "1",
      unitMinor: "10000",
      taxCode: "STANDARD",
      taxBps: 2000,
      recoverable: true,
      account: "6000",
      taxAccount: "2200",
      payableAccount: "2100",
      costCentre: "Operations",
    },
  ],
});
test("exact GBP totals preserve declared mismatch and per-line half-up rounding", () => {
  assert.equal(totals(bill).gross, "12000");
  assert.equal(totals(bill).matches, true);
  assert.equal(totals({ ...bill, declaredGross: "12001" }).matches, false);
  assert.equal(
    totals({
      ...bill,
      lines: [
        {
          ...bill.lines[0],
          quantity: "0.0001",
          unitMinor: "5000",
          taxCode: "NONE",
          taxBps: 0,
        },
      ],
    }).net,
    "1",
  );
  assert.throws(() =>
    totals({ ...bill, lines: [{ ...bill.lines[0], quantity: "0" }] }),
  );
  assert.throws(() =>
    totals({
      ...bill,
      lines: [
        { ...bill.lines[0], quantity: "999999", unitMinor: "9999999999" },
      ],
    }),
  );
});
test("CSV balances recoverable and nonrecoverable tax and escapes formula references", () => {
  for (const recoverable of [true, false]) {
    const data = csv(
      {
        ...bill,
        reference: "=SUM(A1)",
        lines: [{ ...bill.lines[0], recoverable }],
      },
      3,
    );
    const rows = data
      .trim()
      .split("\r\n")
      .slice(1)
      .map((s) => s.split(",").map((v) => v.slice(1, -1)));
    assert.equal(
      rows.reduce((s, r) => s + BigInt(r[5]) - BigInt(r[6]), 0n),
      0n,
    );
    assert.ok(data.includes("'=SUM(A1)"));
    assert.equal(rows.length, recoverable ? 3 : 2);
  }
});
test("priority routing, fallback, snapshot and no self approval", () => {
  const p = policySchema.parse({
    currency: "GBP",
    rules: [
      {
        priority: 1,
        minimumGross: "50000",
        verifierId: null,
        approverIds: [first, second],
      },
    ],
    fallback: { verifierId: second, approverIds: [first] },
  });
  const route = routePolicy(p, "50000", 4, submitter);
  assert.equal(route.approverIds.length, 2);
  assert.equal(route.policyVersion, 4);
  assert.equal(route.verified, true);
  assert.equal(routePolicy(p, "12000", 4, submitter).verified, false);
  assert.throws(() => routePolicy(p, "50000", 4, first));
  assert.equal(
    policySchema.safeParse({
      ...p,
      fallback: { verifierId: null, approverIds: [] },
    }).success,
    false,
  );
});
test("strict payloads, reasons, currency and canonical retry identity", () => {
  assert.equal(fields.safeParse({ ...bill, approved: true }).success, false);
  assert.equal(fields.safeParse({ ...bill, currency: "USD" }).success, false);
  assert.equal(
    actionSchema.safeParse({
      operationId: randomUUID(),
      expectedVersion: 1,
      action: "challenge",
    }).success,
    false,
  );
  assert.equal(fingerprint({ a: 1, b: 2 }), fingerprint({ b: 2, a: 1 }));
  assert.equal(referenceKey("  ＡＢＣ-1  "), "abc-1");
});
