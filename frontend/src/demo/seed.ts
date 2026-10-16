import type { Account, DemoState, Journal } from "../types/domain";
export const periods = [
  "2026-04",
  "2026-05",
  "2026-06",
  "2026-07",
  "2026-08",
  "2026-09",
];
const accountNames: [string, string, Account["type"]][] = [
  ["1000", "Operating cash", "Asset"],
  ["1010", "Savings", "Asset"],
  ["1020", "Payment clearing", "Asset"],
  ["1100", "Accounts receivable", "Asset"],
  ["1200", "Prepaid expenses", "Asset"],
  ["1210", "Prepaid insurance", "Asset"],
  ["1300", "Equipment", "Asset"],
  ["1310", "Accumulated depreciation", "Asset"],
  ["1400", "Security deposits", "Asset"],
  ["1500", "Intangible assets", "Asset"],
  ["2000", "Accounts payable", "Liability"],
  ["2010", "Accrued expenses", "Liability"],
  ["2020", "Payroll payable", "Liability"],
  ["2030", "Sales tax payable", "Liability"],
  ["2100", "Deferred revenue", "Liability"],
  ["2200", "Credit card payable", "Liability"],
  ["2300", "Long-term debt", "Liability"],
  ["3000", "Common stock", "Equity"],
  ["3100", "Retained earnings", "Equity"],
  ["3200", "Additional paid-in capital", "Equity"],
  ["4000", "Subscription revenue", "Revenue"],
  ["4010", "Implementation revenue", "Revenue"],
  ["4020", "Usage revenue", "Revenue"],
  ["4030", "Consulting revenue", "Revenue"],
  ["4100", "Interest income", "Revenue"],
  ["5000", "Cloud infrastructure", "Expense"],
  ["5010", "Customer support", "Expense"],
  ["5020", "Payment processing", "Expense"],
  ["6000", "Salaries and wages", "Expense"],
  ["6010", "Benefits", "Expense"],
  ["6020", "Payroll taxes", "Expense"],
  ["6100", "Software subscriptions", "Expense"],
  ["6110", "Office rent", "Expense"],
  ["6120", "Insurance", "Expense"],
  ["6130", "Professional services", "Expense"],
  ["6140", "Travel", "Expense"],
  ["6150", "Meals", "Expense"],
  ["6200", "Marketing", "Expense"],
  ["6210", "Advertising", "Expense"],
  ["6300", "Research and development", "Expense"],
  ["6400", "Depreciation", "Expense"],
  ["6500", "Bank fees", "Expense"],
  ["6600", "Utilities", "Expense"],
  ["6700", "Other operating expenses", "Expense"],
];
export function seed(): DemoState {
  const state: DemoState = {
    version: 1,
    entered: false,
    profile: "Alex Morgan",
    entity: "us",
    period: "all",
    role: "Admin",
    accounts: accountNames.map(([id, name, type]) => ({
      id,
      name,
      type,
      active: id !== "6700",
    })),
    entities: [
      {
        id: "us",
        name: "Northstar Analytics, Inc.",
        currency: "USD",
        country: "United States",
      },
      {
        id: "uk",
        name: "Northstar Europe Ltd.",
        currency: "USD",
        country: "United Kingdom · USD functional currency",
      },
    ],
    customers: [],
    vendors: [],
    journals: [],
    invoices: [],
    bills: [],
    contracts: [],
    bank: [],
    tasks: [],
    automations: [
      {
        id: "auto-1",
        name: "Review high-value invoices",
        trigger: "Invoice issued",
        threshold: 500000,
        action: "Flag for review",
        enabled: true,
        runs: [],
      },
      {
        id: "auto-2",
        name: "Review cloud spend",
        trigger: "Bill received",
        threshold: 100000,
        action: "Flag for review",
        enabled: false,
        runs: [],
      },
    ],
    integrations: ["Mercury (demo)"],
    syncLog: ["Seed fixture loaded · September 30, 2026"],
    audit: [],
    locked: [],
    notifications: true,
    compact: false,
    workspace: "Northstar Analytics",
    approvalThreshold: 500000,
    dimensions: ["Engineering", "Sales", "Operations"],
  };
  const names = [
    "Acorn Labs",
    "Meridian Health",
    "Orbit Studio",
    "Juniper Systems",
    "Cedar Commerce",
    "Atlas Learning",
    "Harbor Robotics",
    "Lumen Design",
    "Pioneer Mobility",
    "Evergreen Energy",
    "Canvas Media",
    "Summit Logistics",
    "Mosaic Research",
    "Kite Analytics",
    "Copper Works",
    "Tide Software",
    "Birch Ventures",
    "Helix Digital",
    "Fieldstone AI",
    "Aster Networks",
    "Prism Data",
    "Nimble Health",
    "Sable Finance",
    "Verde Supply",
  ];
  const vendors = [
    "Nimbus Cloud",
    "Folio Software",
    "Elm Offices",
    "Beacon Legal",
    "Forma Benefits",
    "Trellis Marketing",
    "Quill Consulting",
    "Slate Hardware",
    "Daylight Design",
    "Cove Security",
    "Vector Telecom",
    "Vista Travel",
    "Flint Support",
    "Meadow Insurance",
    "Arc Recruiting",
    "Bloom Learning",
  ];
  state.customers = names.map((name, i) => ({
    id: `cus-${i + 1}`,
    name,
    contact: ["Sam Rivera", "Taylor Chen", "Jordan Ellis"][i % 3],
    email: `accounts@customer${i + 1}.example`,
    entity: i < 18 ? "us" : "uk",
  }));
  state.vendors = vendors.map((name, i) => ({
    id: `ven-${i + 1}`,
    name,
    contact: "Casey Brooks",
    email: `billing@vendor${i + 1}.example`,
    entity: i < 12 ? "us" : "uk",
  }));
  const add = (journal: Journal) => state.journals.push(journal);
  for (const entity of state.entities) {
    add({
      id: `OPEN-${entity.id}`,
      entity: entity.id,
      date: "2026-04-01",
      memo: "Opening balances · capital and retained earnings",
      status: "Posted",
      lines: [
        {
          account: "1000",
          debit: entity.id === "us" ? 50000000 : 15000000,
          credit: 0,
        },
        {
          account: "3000",
          debit: 0,
          credit: entity.id === "us" ? 40000000 : 12000000,
        },
        {
          account: "3100",
          debit: 0,
          credit: entity.id === "us" ? 10000000 : 3000000,
        },
      ],
    });
  }
  for (let m = 0; m < 6; m++) {
    for (let i = 0; i < 12; i++) {
      const n = m * 12 + i + 1,
        entity = i < 9 ? "us" : "uk",
        customer =
          state.customers[entity === "us" ? (i + m) % 18 : 18 + ((i + m) % 6)],
        amount = (2400 + ((i * 719 + m * 331) % 8500)) * 100,
        date = `${periods[m]}-${String(3 + i * 2).padStart(2, "0")}`,
        id = `INV-${String(1000 + n)}`;
      const paid =
        i % 4 === 0 ? 0 : i % 4 === 1 ? Math.floor(amount / 2) : amount;
      state.invoices.push({
        id,
        entity,
        customer: customer.id,
        date,
        due: `${periods[Math.min(m + 1, 5)]}-28`,
        description: "Northstar platform · monthly subscription",
        amount,
        paid,
        status: paid === amount ? "Paid" : paid ? "Partial" : "Issued",
        department: i % 2 ? "Sales" : "Engineering",
      });
      add({
        id: `J-${id}`,
        entity,
        date,
        memo: `Subscription · ${customer.name}`,
        status: "Posted",
        source: id,
        lines: [
          { account: "1100", debit: amount, credit: 0 },
          { account: "4000", debit: 0, credit: amount },
        ],
      });
      if (paid) {
        const jid = `PAY-${id}`;
        add({
          id: jid,
          entity,
          date,
          memo: `Receipt · ${customer.name}`,
          status: "Posted",
          source: id,
          lines: [
            { account: "1000", debit: paid, credit: 0 },
            { account: "1100", debit: 0, credit: paid },
          ],
        });
        if (m === 5)
          state.bank.push({
            id: `bank-${n}`,
            entity,
            date,
            description: `Transfer · ${customer.name}`,
            amount: paid,
            candidate: jid,
            matched: i % 3 === 0,
          });
      }
    }
    for (let i = 0; i < 8; i++) {
      const entity = i < 6 ? "us" : "uk",
        id = `BILL-${2001 + m * 8 + i}`,
        amount = (450 + ((i * 337 + m * 157) % 3600)) * 100,
        date = `${periods[m]}-${String(5 + i * 3).padStart(2, "0")}`,
        account = ["5000", "6100", "6110", "6130"][i % 4],
        status = m === 5 && i < 2 ? "Inbox" : i % 3 ? "Paid" : "Approved";
      state.bills.push({
        id,
        entity,
        vendor:
          state.vendors[entity === "us" ? (i + m) % 12 : 12 + ((i + m) % 4)].id,
        date,
        due: `${periods[m]}-28`,
        amount,
        account,
        status,
        department: "Operations",
      });
      if (status !== "Inbox") {
        add({
          id: `J-${id}`,
          entity,
          date,
          memo: `Vendor expense · ${id}`,
          status: "Posted",
          source: id,
          lines: [
            { account, debit: amount, credit: 0 },
            { account: "2000", debit: 0, credit: amount },
          ],
        });
        if (status === "Paid")
          add({
            id: `PAY-${id}`,
            entity,
            date,
            memo: `Payment · ${id}`,
            status: "Posted",
            source: id,
            lines: [
              { account: "2000", debit: amount, credit: 0 },
              { account: "1000", debit: 0, credit: amount },
            ],
          });
      }
    }
  }
  state.contracts = [
    ...state.customers.slice(0, 8),
    ...state.customers.slice(18, 22),
  ].map((c, i) => ({
    id: `CON-${301 + i}`,
    entity: c.entity,
    customer: c.id,
    name: `${c.name} · annual platform`,
    start: "2026-04-01",
    end: "2027-03-31",
    monthly: (2500 + i * 175) * 100,
    months: 12,
  }));
  for (const entity of state.entities)
    for (const period of periods)
      state.tasks.push(
        ...[
          "Reconcile operating bank account",
          "Review accounts receivable aging",
          "Approve accrual journal entries",
          "Review deferred revenue schedule",
          "Review financial statements",
          "Finalize period close",
        ].map((title, i) => ({
          id: `task-${entity.id}-${period}-${i}`,
          entity: entity.id,
          title,
          owner: ["Alex Morgan", "Taylor Chen", "Jordan Ellis"][i % 3],
          due: `${period}-30`,
          status: i < 2 ? ("Approved" as const) : ("To do" as const),
          evidence: i < 2 ? "Fixture reconciliation summary" : "",
        })),
      );
  state.bank.push({
    id: "bank-exception",
    entity: "us",
    date: "2026-09-29",
    description: "Unidentified transfer · needs review",
    amount: 50000,
    candidate: "",
    matched: false,
  });
  state.audit = [
    {
      id: "audit-seed",
      date: "2026-09-30T09:00:00Z",
      actor: "FinAI demo",
      action: "Workspace initialized",
      object: "Northstar Analytics",
      before: "Empty",
      after: "Balanced six-month fixture",
    },
  ];
  return state;
}
