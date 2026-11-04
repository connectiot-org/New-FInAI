/** Browser-only invoice samples in separate IndexedDB; no company session, real scanner or financial posting. */
import { z } from "zod";
import {
  dataSchema,
  detailSchema,
  suppliersSchema,
  route as routeSchema,
  type InvoiceData,
} from "./schemas";
import type { PayablesClient } from "./api";
export const developmentBase = "/demo/payables";
export const developmentCompany = "10000000-0000-4000-8000-000000000001";
export const developmentActors = [
  "Reviewer",
  "Verifier",
  "First approver",
  "Second approver",
].map((name, index) => ({
  id: `10000000-0000-4000-8000-00000000000${index + 2}`,
  name,
}));
const caps = (actor: number) => ({
  view: true,
  review: actor === 0,
  verify: actor === 1,
  approve: actor >= 2,
  manage: actor === 0,
});
const chain = z.strictObject({
  verifierId: z.uuid().nullable(),
  approverIds: z.array(z.uuid()).min(1).max(2),
});
const definitionSchema = z.strictObject({
  currency: z.literal("GBP"),
  rules: z
    .array(
      chain.extend({
        priority: z.number().int().positive(),
        minimumGross: z.string().regex(/^[1-9]\d{0,9}$/),
      }),
    )
    .max(10),
  fallback: chain,
});
const documents = detailSchema.shape.documents.element.extend({
  blob: z.instanceof(Blob),
});
const invoiceSchema = detailSchema
  .omit({ supplier: true, totals: true, capabilities: true, payment: true })
  .extend({ documents: z.array(documents) });
const stateSchema = z.object({
  format: z.literal(1),
  sampleVersion: z.literal(2).optional(),
  suppliers: suppliersSchema.shape.items,
  invoices: z.array(invoiceSchema),
  policy: z.object({
    version: z.number(),
    draft: definitionSchema,
    published: definitionSchema.nullable(),
    publishedVersion: z.number().nullable(),
  }),
  files: z.array(z.object({ id: z.uuid(), blob: z.instanceof(Blob) })),
  operations: z.record(
    z.string(),
    z.object({ digest: z.string(), result: z.unknown() }),
  ),
});
type State = z.infer<typeof stateSchema>;
type Invoice = z.infer<typeof invoiceSchema>;
type Definition = z.infer<typeof definitionSchema>;
const uuid = () => crypto.randomUUID();
const supplierId = "20000000-0000-4000-8000-000000000001";
function samplePdf(reference = "DEV-1001", gross = "12000") {
  const amount = `${BigInt(gross) / 100n}.${(BigInt(gross) % 100n).toString().padStart(2, "0")}`;
  const stream = `BT /F1 18 Tf 40 740 Td (FinAI sample supplier invoice) Tj 0 -30 Td /F1 12 Tf (${reference} - GBP ${amount}) Tj 0 -22 Td (Development sample only) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((n) => String(n).padStart(10, "0") + " 00000 n \n")
    .join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([pdf], { type: "application/pdf" });
}
const sampleDigests = [
  "b4d889e3e42c3d45d48368bbb5fc9ab21f85eb7494681ad32ef56e37d4660499",
  "d6021027d85b3d345b944122bd0f8fc18f82c219977c15b7edd22f97ace782ec",
  "7a85a37d2d46c8d5c31514a3c86789215ea93211dfdc093ed49abefca7133c96",
  "c2b5162fa899cd85495697baeab6126404c644645a506d40940182cde5b66e90",
  "6c1b1796335cc60ebc4aa879cb3b7ae4f216fddaafe5a5ae4901c74e3ed3208f",
  "d10277737e073ece50e93b36fc5652cc997ed65b816e84b375039c4ca57bf1c8",
];
function seed(): State {
  const definition: Definition = {
    currency: "GBP",
    rules: [
      {
        priority: 1,
        minimumGross: "50000",
        verifierId: developmentActors[1].id,
        approverIds: [developmentActors[2].id, developmentActors[3].id],
      },
    ],
    fallback: { verifierId: null, approverIds: [developmentActors[2].id] },
  };
  const suppliers = [
    {
      id: supplierId,
      name: "Sample Studio Supplier",
      taxId: "SAMPLE-STUDIO",
      active: true,
      version: 1,
    },
    {
      id: "20000000-0000-4000-8000-000000000002",
      name: "Sample Cloud Hosting",
      taxId: "SAMPLE-CLOUD",
      active: true,
      version: 1,
    },
    {
      id: "20000000-0000-4000-8000-000000000003",
      name: "Sample Office Supplies",
      taxId: "SAMPLE-OFFICE",
      active: true,
      version: 1,
    },
  ];
  const samples = [
    {
      reference: "DEV-1001",
      supplier: 0,
      net: "10000",
      state: "review",
      description: "Brand design services",
    },
    {
      reference: "DEV-1002",
      supplier: 1,
      net: "100000",
      state: "verify",
      description: "Quarterly cloud hosting",
    },
    {
      reference: "DEV-1003",
      supplier: 2,
      net: "37500",
      state: "approve",
      description: "Office equipment",
    },
    {
      reference: "DEV-1004",
      supplier: 0,
      net: "20000",
      state: "approved",
      description: "Website maintenance",
    },
    {
      reference: "DEV-1005",
      supplier: 1,
      net: "25000",
      state: "rejected",
      description: "Duplicate hosting request",
    },
    {
      reference: "DEV-1006",
      supplier: 2,
      net: "10000",
      state: "review",
      description: "Office stationery - check document total",
    },
  ] as const;
  const invoices: Invoice[] = samples.map((sample, index) => {
    const gross = String((BigInt(sample.net) * 120n) / 100n);
    const data: InvoiceData = {
      supplierId: suppliers[sample.supplier].id,
      reference: sample.reference,
      invoiceDate: "2026-11-01",
      dueDate: "2026-12-01",
      currency: "GBP",
      declaredGross: index === 5 ? "12100" : gross,
      lines: [
        {
          description: sample.description,
          quantity: "1",
          unitMinor: sample.net,
          taxCode: "STANDARD",
          taxBps: 2000,
          recoverable: true,
          account: "6000",
          taxAccount: "2200",
          payableAccount: "2100",
          costCentre: "Operations",
        },
      ],
    };
    const assignment =
      sample.state === "verify" ? definition.rules[0] : definition.fallback;
    return {
      id: `30000000-0000-4000-8000-00000000000${index + 1}`,
      entityId: developmentCompany,
      data,
      version: 1,
      revision: 1,
      state: sample.state,
      correctionReason: null,
      route:
        sample.state === "review"
          ? null
          : {
              policyVersion: 1,
              reason:
                sample.state === "verify"
                  ? "Amount threshold GBP500"
                  : "Mandatory fallback",
              verifierId: assignment.verifierId,
              approverIds: assignment.approverIds,
              step: sample.state === "approved" ? 1 : 0,
              verified: sample.state !== "verify",
              submittedBy: developmentActors[0].id,
            },
      documents: [
        {
          id: uuid(),
          filename:
            index === 0
              ? "sample-invoice.pdf"
              : `${sample.reference.toLowerCase()}.pdf`,
          digest: sampleDigests[index],
          scanState: "development",
          revision: 1,
          blob: samplePdf(sample.reference, gross),
        },
      ],
      events: [
        {
          id: uuid(),
          actorId: developmentActors[0].id,
          revision: 1,
          action: "sample-loaded",
          reason:
            sample.state === "rejected"
              ? "Sample rejection: duplicate request"
              : "Preloaded development example",
          createdAt: "2026-11-03T09:00:00.000Z",
        },
      ],
      exports: [],
    };
  });
  return {
    format: 1,
    sampleVersion: 2,
    suppliers,
    invoices,
    policy: {
      version: 1,
      draft: definition,
      published: structuredClone(definition),
      publishedVersion: 1,
    },
    files: [],
    operations: {},
  };
}

async function transaction<T>(
  run: (state: State) => T,
  reset = false,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("finai-invoices-development-v1", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("workspace");
    open.onerror = () =>
      reject(
        new Error(
          "Browser storage is unavailable. Enable local storage to use this development preview.",
        ),
      );
    open.onblocked = () =>
      reject(new Error("Close other preview tabs and reload."));
    open.onsuccess = () => {
      const db = open.result,
        tx = db.transaction("workspace", "readwrite"),
        store = tx.objectStore("workspace");
      let result: T, error: unknown;
      const request = store.get("state");
      request.onsuccess = () => {
        try {
          const state =
            reset || request.result === undefined
              ? seed()
              : stateSchema.parse(request.result);
          if (!state.sampleVersion) {
            const samples = seed();
            for (const supplier of samples.suppliers)
              if (!state.suppliers.some((s) => s.id === supplier.id))
                state.suppliers.push(supplier);
            for (const invoice of samples.invoices)
              if (!state.invoices.some((n) => n.id === invoice.id))
                state.invoices.push(invoice);
            state.sampleVersion = 2;
          }
          result = run(state);
          store.put(state, "state");
        } catch (e) {
          error = e;
          tx.abort();
        }
      };
      tx.oncomplete = () => {
        db.close();
        resolve(result);
      };
      tx.onabort = tx.onerror = () => {
        db.close();
        reject(
          error ||
            new Error("Could not save development data in this browser."),
        );
      };
    };
  });
}
export async function resetDevelopment() {
  await transaction(() => undefined, true);
}
const failure = (message: string, rejected = false): never => {
  throw Object.assign(new Error(message), { rejected });
};
function permission(actor: number, capability: keyof ReturnType<typeof caps>) {
  if (!caps(actor)[capability])
    failure(
      `Switch to the ${capability === "verify" ? "Verifier" : capability === "approve" ? "assigned approver" : "Reviewer"} development role for this action.`,
    );
}
function total(data: InvoiceData) {
  const rows = data.lines.map((l) => {
    if (
      !/^(0|[1-9]\d{0,5})(\.\d{1,4})?$/.test(l.quantity) ||
      !/^(0|[1-9]\d{0,9})$/.test(l.unitMinor)
    )
      failure("Enter a valid quantity and unit price.");
    const [whole, fraction = ""] = l.quantity.split(".");
    const quantity = BigInt(whole) * 10000n + BigInt(fraction.padEnd(4, "0"));
    const net = (quantity * BigInt(l.unitMinor) + 5000n) / 10000n;
    const tax = (net * BigInt(l.taxBps) + 5000n) / 10000n;
    return { net, tax, recoverable: l.recoverable ? tax : 0n };
  });
  const net = rows.reduce((n, l) => n + l.net, 0n),
    tax = rows.reduce((n, l) => n + l.tax, 0n);
  if (net + tax <= 0n || net + tax > 1000000000n)
    failure("The invoice must be positive and at most GBP10m.");
  return {
    net: String(net),
    tax: String(tax),
    gross: String(net + tax),
    recoverable: String(rows.reduce((n, l) => n + l.recoverable, 0n)),
    matches: String(net + tax) === data.declaredGross,
    lines: rows.map((l) => ({ net: String(l.net), tax: String(l.tax) })),
  };
}
function validateData(value: unknown) {
  const data = dataSchema.parse(value);
  if (
    !data.lines.length ||
    data.lines.length > 50 ||
    !/^[1-9]\d{0,9}$/.test(data.declaredGross)
  )
    failure("Enter 1–50 lines and a positive document total.");
  z.iso.date().parse(data.invoiceDate);
  z.iso.date().parse(data.dueDate);
  if (data.dueDate < data.invoiceDate)
    failure("The due date must follow the invoice date.");
  for (const text of [
    data.reference,
    ...data.lines.flatMap((l) => [l.description, l.costCentre]),
  ])
    if (!text.trim() || text.length > 200)
      failure(
        "Complete the reference, descriptions and cost centres (up to200 characters).",
      );
  for (const line of data.lines) {
    for (const code of [line.account, line.taxAccount, line.payableAccount])
      if (!/^[A-Z0-9-]{1,20}$/.test(code))
        failure("Complete all account codes.");
    if (
      (line.taxCode === "NONE" && line.taxBps !== 0) ||
      (line.taxCode === "STANDARD" && line.taxBps !== 2000)
    )
      failure("Confirm the supported tax treatment.");
  }
  if (new Set(data.lines.map((l) => l.taxCode)).size > 1)
    failure("Use one supported tax treatment per invoice.");
  total(data);
  return data;
}
// Only input validation before a new operation is a definite rejection.
// Receipt conflicts and storage failures may follow a committed write.
function checkedData(value: unknown) {
  try {
    return validateData(value);
  } catch (error) {
    throw Object.assign(error as Error, { rejected: true });
  }
}
const normalized = (s: string) => s.normalize("NFKC").trim().toLowerCase();
function validateSupplier(state: State, data: InvoiceData, exclude?: string) {
  if (!state.suppliers.some((s) => s.id === data.supplierId && s.active))
    failure("Choose an active supplier.", true);
  if (
    state.invoices.some(
      (n) =>
        n.id !== exclude &&
        n.data.supplierId === data.supplierId &&
        normalized(n.data.reference) === normalized(data.reference),
    )
  )
    failure("This supplier reference already exists.", true);
}
function version(n: { version: number }, expected: number) {
  if (n.version !== expected)
    failure("This record changed. Reload before trying again.");
}
function event(
  n: Invoice,
  actor: number,
  action: string,
  reason: string | null = null,
) {
  n.events.unshift({
    id: uuid(),
    actorId: developmentActors[actor].id,
    revision: n.revision,
    action,
    reason,
    createdAt: new Date().toISOString(),
  });
}
function revise(n: Invoice) {
  n.revision++;
  n.version++;
  n.state = "review";
  n.route = null;
  n.correctionReason = null;
}
function validatePolicy(value: unknown) {
  const policy = definitionSchema.parse(value),
    ordered = [...policy.rules].sort((a, b) => a.priority - b.priority);
  if (
    new Set(ordered.map((r) => r.priority)).size !== ordered.length ||
    ordered.some(
      (r, i) =>
        i && BigInt(r.minimumGross) >= BigInt(ordered[i - 1].minimumGross),
    )
  )
    failure("Use distinct priorities and decreasing thresholds.");
  for (const c of [...ordered, policy.fallback]) {
    if (
      new Set(c.approverIds).size !== c.approverIds.length ||
      c.approverIds.some(
        (id) => !developmentActors.slice(2).some((a) => a.id === id),
      ) ||
      (c.verifierId !== null && c.verifierId !== developmentActors[1].id)
    )
      failure("Choose eligible, distinct development approvers and verifier.");
  }
  return policy;
}
function csv(n: Invoice) {
  const t = total(n.data),
    rows = [
      [
        "reference",
        "revision",
        "currency",
        "account",
        "cost_centre",
        "debit_minor",
        "credit_minor",
      ],
    ];
  n.data.lines.forEach((line, i) => {
    const v = t.lines[i];
    rows.push([
      n.data.reference,
      String(n.revision),
      "GBP",
      line.account,
      line.costCentre,
      String(BigInt(v.net) + (line.recoverable ? 0n : BigInt(v.tax))),
      "0",
    ]);
    if (line.recoverable && v.tax !== "0")
      rows.push([
        n.data.reference,
        String(n.revision),
        "GBP",
        line.taxAccount,
        line.costCentre,
        v.tax,
        "0",
      ]);
    rows.push([
      n.data.reference,
      String(n.revision),
      "GBP",
      line.payableAccount,
      line.costCentre,
      "0",
      String(BigInt(v.net) + BigInt(v.tax)),
    ]);
  });
  return (
    rows
      .map((row) =>
        row
          .map(
            (cell) =>
              `"${(/^[=+@\-\t\r]/.test(cell) ? "'" : "") + cell.replaceAll('"', '""')}"`,
          )
          .join(","),
      )
      .join("\r\n") + "\r\n"
  );
}
function once(
  state: State,
  actor: number,
  key: string,
  input: unknown,
  run: () => unknown,
) {
  const name = `${actor}:${key}`,
    digest = JSON.stringify(input),
    old = state.operations[name];
  if (old) {
    if (old.digest !== digest)
      failure("This retry has different data. Reload before trying again.");
    return old.result;
  }
  const result = run();
  state.operations[name] = { digest, result };
  return result;
}
export function developmentClient(actor: number): PayablesClient {
  const request: PayablesClient["request"] = async (
    path,
    schema,
    options = {},
  ) => {
    options.signal?.throwIfAborted();
    const url = new URL(path, "https://development.invalid"),
      parts = url.pathname.split("/").filter(Boolean),
      method = options.method || "GET";
    const result = await transaction((state) => {
      const body = z.record(z.string(), z.unknown()).parse(options.body || {}),
        b = body;
      if (parts[0] === "capabilities" && method === "GET")
        return {
          capabilities: caps(actor),
          members: developmentActors.map((a, i) => ({
            ...a,
            verify: i === 1,
            approve: i >= 2,
          })),
          currency: "GBP",
        };
      if (parts[0] === "suppliers") {
        if (method === "GET") return { items: state.suppliers };
        permission(actor, "review");
        if (method === "POST")
          return once(state, actor, `supplier:${b.id}`, b, () => {
            const input = suppliersSchema.shape.items.element
              .pick({ id: true, name: true, taxId: true })
              .parse({ id: b.id, name: b.name, taxId: b.taxId });
            if (!input.name.trim() || input.name.length > 200)
              failure("Enter a supplier name (up to200 characters).");
            if (state.suppliers.length >= 500)
              failure("The development supplier limit is500.");
            if (state.suppliers.some((s) => s.id === input.id))
              failure("Supplier already exists.");
            state.suppliers.push({ ...input, active: true, version: 1 });
            return { id: input.id };
          });
        const s =
          state.suppliers.find((s) => s.id === parts[1]) ||
          failure("Supplier not found.");
        version(s, z.number().parse(b.expectedVersion));
        const input = suppliersSchema.shape.items.element
          .pick({ name: true, taxId: true, active: true })
          .parse({ name: b.name, taxId: b.taxId, active: b.active });
        if (!input.name.trim() || input.name.length > 200)
          failure("Enter a supplier name (up to200 characters).");
        Object.assign(s, input);
        s.version++;
        return { id: s.id };
      }
      if (parts[0] === "approval-policies") {
        if (method === "GET") return { item: state.policy };
        permission(actor, "manage");
        return once(state, actor, z.uuid().parse(b.operationId), b, () => {
          version(state.policy, z.number().parse(b.expectedVersion));
          const p = validatePolicy(b.definition);
          state.policy.draft = p;
          state.policy.version++;
          if (b.publish) {
            state.policy.published = structuredClone(p);
            state.policy.publishedVersion = state.policy.version;
          }
          return { version: state.policy.version };
        });
      }
      if (parts[0] !== "invoices")
        return failure(
          "This action is unavailable in the development preview.",
        );
      if (!parts[1]) {
        if (method === "POST") {
          permission(actor, "review");
          return once(state, actor, `invoice:${b.id}`, b, () => {
            const { id, entityId: _entity, ...fields } = b;
            void _entity;
            const data = checkedData(fields);
            validateSupplier(state, data);
            const n: Invoice = {
              id: z.uuid().parse(id),
              entityId: developmentCompany,
              data,
              state: "review",
              version: 1,
              revision: 1,
              correctionReason: null,
              route: null,
              documents: [],
              events: [],
              exports: [],
            };
            event(n, actor, "created");
            state.invoices.unshift(n);
            return { id: n.id };
          });
        }
        const filtered = state.invoices.filter((n) => {
          const supplier = state.suppliers.find(
            (s) => s.id === n.data.supplierId,
          )!;
          const search = (url.searchParams.get("search") || "").toLowerCase(),
            status = url.searchParams.get("status"),
            due = url.searchParams.get("dueBefore"),
            month = url.searchParams.get("month"),
            assignee = url.searchParams.get("assignee");
          return (
            (!search ||
              `${supplier.name} ${n.data.reference}`
                .toLowerCase()
                .includes(search)) &&
            (!status || n.state === status) &&
            (!due || n.data.dueDate <= due) &&
            (!month || n.data.invoiceDate.slice(0, 7) === month) &&
            (!assignee ||
              n.route?.verifierId === assignee ||
              n.route?.approverIds[n.route.step] === assignee)
          );
        });
        const belongs = (n: Invoice, queue: string) =>
          queue === "all" ||
          (queue === "export"
            ? n.state === "approved"
            : queue === "verify"
              ? n.state === "verify" &&
                n.route?.verifierId === developmentActors[actor].id
              : queue === "approve"
                ? n.state === "approve" &&
                  n.route?.approverIds[n.route.step] ===
                    developmentActors[actor].id
                : n.state === "review");
        const counts = {
          all: filtered.length,
          review: filtered.filter((n) => belongs(n, "review")).length,
          verify: filtered.filter((n) => belongs(n, "verify")).length,
          approve: filtered.filter((n) => belongs(n, "approve")).length,
          export: filtered.filter((n) => belongs(n, "export")).length,
        };
        const rows = filtered.filter((n) =>
            belongs(n, url.searchParams.get("queue") || "all"),
          ),
          offset = Number(url.searchParams.get("offset") || 0),
          limit = Math.min(50, Number(url.searchParams.get("limit") || 20));
        return {
          counts,
          total: rows.length,
          offset,
          limit,
          items: rows.slice(offset, offset + limit).map((n) => ({
            id: n.id,
            supplier: state.suppliers.find((s) => s.id === n.data.supplierId)!
              .name,
            reference: n.data.reference,
            invoiceDate: n.data.invoiceDate,
            dueDate: n.data.dueDate,
            gross: total(n.data).gross,
            currency: "GBP",
            state: n.state,
            version: n.version,
            attention:
              !n.documents.length ||
              !total(n.data).matches ||
              !!n.correctionReason,
            ...(n.route && ["verify", "approve"].includes(n.state)
              ? {
                  owner:
                    n.state === "verify"
                      ? n.route.verifierId || undefined
                      : n.route.approverIds[n.route.step],
                }
              : {}),
          })),
        };
      }
      const n =
        state.invoices.find((n) => n.id === parts[1]) ||
        failure("Development invoice not found.");
      if (method === "GET")
        return {
          ...n,
          documents: n.documents.map(({ blob: _blob, ...d }) => {
            void _blob;
            return d;
          }),
          supplier: (() => {
            const supplier = state.suppliers.find(
              (s) => s.id === n.data.supplierId,
            )!;
            return {
              id: supplier.id,
              name: supplier.name,
              taxId: supplier.taxId,
            };
          })(),
          totals: total(n.data),
          payment: "unpaid",
          capabilities: caps(actor),
        };
      if (method === "PATCH") {
        permission(actor, "review");
        version(n, z.number().parse(b.expectedVersion));
        if (n.state === "rejected")
          failure("Rejected invoices cannot be reopened.");
        const { expectedVersion: _version, ...fields } = b;
        void _version;
        const data = checkedData(fields);
        validateSupplier(state, data, n.id);
        n.data = data;
        revise(n);
        event(n, actor, "revised");
        return { id: n.id };
      }
      return once(
        state,
        actor,
        z.uuid().parse(b.operationId),
        [path, b],
        () => {
          version(n, z.number().parse(b.expectedVersion));
          if (parts[2] === "exports") {
            permission(actor, "review");
            if (n.state !== "approved")
              failure("Approve the current revision first.");
            const old = n.exports.find((e) => e.revision === n.revision);
            if (old) return { id: old.id };
            const id = uuid();
            state.files.push({
              id,
              blob: new Blob([csv(n)], { type: "text/csv;charset=utf-8" }),
            });
            n.exports.push({ id, revision: n.revision });
            event(n, actor, "exported");
            return { id };
          }
          const action = z.string().parse(b.action),
            reason = typeof b.reason === "string" ? b.reason.trim() : "";
          if (["challenge", "reject", "correction"].includes(action) && !reason)
            failure("Enter a reason.");
          if (action === "review") {
            permission(actor, "review");
            if (
              n.state !== "review" ||
              n.correctionReason ||
              !total(n.data).matches ||
              !n.documents.length
            )
              failure(
                "Correct findings, confirm totals and add a sample PDF before submitting.",
              );
            const published =
                state.policy.published ||
                failure("Publish an approval policy first."),
              rule = [...published.rules]
                .sort((a, b) => a.priority - b.priority)
                .find(
                  (r) => BigInt(total(n.data).gross) >= BigInt(r.minimumGross),
                );
            const chosen = rule || published.fallback;
            if (chosen.approverIds.includes(developmentActors[actor].id))
              failure("The submitter cannot approve their own invoice.");
            n.route = routeSchema.parse({
              verifierId: chosen.verifierId,
              approverIds: chosen.approverIds,
              policyVersion: state.policy.publishedVersion,
              reason: rule
                ? `Amount threshold GBP${Number(rule.minimumGross) / 100}`
                : "Mandatory fallback",
              step: 0,
              verified: !chosen.verifierId,
              submittedBy: developmentActors[actor].id,
            });
            n.state = chosen.verifierId ? "verify" : "approve";
          } else if (action === "correction") {
            permission(actor, "review");
            if (n.state !== "review") failure("The invoice must be in review.");
            n.correctionReason = reason;
          } else {
            const route =
                n.route || failure("Submit the invoice for review first."),
              assigned =
                n.state === "verify"
                  ? route.verifierId
                  : route.approverIds[route.step];
            if (assigned !== developmentActors[actor].id)
              failure("Switch to the currently assigned development role.");
            if (action === "verify" && n.state === "verify") {
              permission(actor, "verify");
              route.verified = true;
              n.state = "approve";
            } else if (action === "approve" && n.state === "approve") {
              permission(actor, "approve");
              route.step++;
              if (route.step === route.approverIds.length) n.state = "approved";
            } else if (
              action === "challenge" &&
              ["verify", "approve"].includes(n.state)
            ) {
              revise(n);
              n.version--;
            } else if (action === "reject" && n.state === "approve")
              n.state = "rejected";
            else failure("This action is not available in the current state.");
          }
          n.version++;
          event(n, actor, action, reason || null);
          return { id: n.id, state: n.state, version: n.version };
        },
      );
    });
    options.signal?.throwIfAborted();
    return schema.parse(result);
  };
  const binary: PayablesClient["binary"] = async (path, file, preview) => {
    const url = new URL(path, "https://development.invalid"),
      parts = url.pathname.split("/").filter(Boolean);
    if (file) {
      permission(actor, "review");
      if (file.size > 1048576 || !file.name.toLowerCase().endsWith(".pdf"))
        failure("Choose a sample PDF up to1MiB.");
      const bytes = new Uint8Array(await file.arrayBuffer()),
        text = new TextDecoder().decode(bytes);
      if (!text.startsWith("%PDF-") || !text.slice(-1024).includes("%%EOF"))
        failure("This is not an ordinary PDF file.");
      const digest = [
        ...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      ]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      await transaction((state) =>
        once(
          state,
          actor,
          url.searchParams.get("operationId") ||
            failure("Missing upload operation."),
          [path, digest],
          () => {
            const n =
              state.invoices.find((n) => n.id === parts[1]) ||
              failure("Invoice not found.");
            version(n, Number(url.searchParams.get("expectedVersion")));
            if (n.state === "rejected" || n.documents.length >= 20)
              failure("This invoice cannot receive another document.");
            revise(n);
            n.documents.unshift({
              id: uuid(),
              filename: file.name,
              digest,
              scanState: "development",
              revision: n.revision,
              blob: new Blob([bytes], { type: "application/pdf" }),
            });
            event(n, actor, "development-document-added");
            return { status: "saved" };
          },
        ),
      );
      return;
    }
    const blob = await transaction((state) =>
      parts[0] === "exports"
        ? state.files.find((f) => f.id === parts[1])?.blob ||
          failure("Export not found.")
        : state.invoices
            .find((n) => n.id === parts[1])
            ?.documents.find((d) => d.id === parts[3])?.blob ||
          failure("Document not found."),
    );
    if (preview) return blob;
    const href = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = href;
    a.download =
      parts[0] === "exports"
        ? "development-invoice-export.csv"
        : "development-invoice.pdf";
    a.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  };
  return { request, binary, basePath: developmentBase, development: true };
}
