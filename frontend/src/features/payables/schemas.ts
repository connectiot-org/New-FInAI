import { z } from "zod";
export const grant = z.strictObject({
  view: z.boolean(),
  review: z.boolean(),
  verify: z.boolean(),
  approve: z.boolean(),
  manage: z.boolean(),
});
export const capabilitiesSchema = z.strictObject({
  capabilities: grant,
  members: z.array(
    z.strictObject({
      id: z.uuid(),
      name: z.string().optional(),
      verify: z.boolean(),
      approve: z.boolean(),
    }),
  ),
  currency: z.literal("GBP"),
});
export const line = z.strictObject({
  description: z.string(),
  quantity: z.string(),
  unitMinor: z.string(),
  taxCode: z.enum(["NONE", "STANDARD"]),
  taxBps: z.union([z.literal(0), z.literal(2000)]),
  recoverable: z.boolean(),
  account: z.string(),
  taxAccount: z.string(),
  payableAccount: z.string(),
  costCentre: z.string(),
});
export const dataSchema = z.strictObject({
  supplierId: z.uuid(),
  reference: z.string(),
  invoiceDate: z.string(),
  dueDate: z.string(),
  currency: z.literal("GBP"),
  declaredGross: z.string(),
  lines: z.array(line),
});
export type InvoiceData = z.infer<typeof dataSchema>;
export const route = z.strictObject({
  policyVersion: z.number().int(),
  reason: z.string(),
  verifierId: z.uuid().nullable(),
  approverIds: z.array(z.uuid()),
  step: z.number().int(),
  verified: z.boolean(),
  submittedBy: z.uuid(),
});
export const detailSchema = z.strictObject({
  id: z.uuid(),
  entityId: z.uuid(),
  data: dataSchema,
  supplier: z.strictObject({
    id: z.uuid(),
    name: z.string(),
    taxId: z.string(),
  }),
  version: z.number().int(),
  revision: z.number().int(),
  state: z.enum(["review", "verify", "approve", "approved", "rejected"]),
  correctionReason: z.string().nullable().optional(),
  route: route.nullable(),
  totals: z.strictObject({
    net: z.string(),
    tax: z.string(),
    gross: z.string(),
    recoverable: z.string(),
    matches: z.boolean(),
    lines: z.array(z.strictObject({ net: z.string(), tax: z.string() })),
  }),
  documents: z.array(
    z.strictObject({
      id: z.uuid(),
      filename: z.string(),
      digest: z.string(),
      scanState: z.string(),
      scanResult: z
        .strictObject({
          status: z.string(),
          engine: z.string(),
          scannedAt: z.string().nullable(),
        })
        .nullable()
        .optional(),
      revision: z.number().int(),
    }),
  ),
  events: z.array(
    z.strictObject({
      id: z.uuid(),
      actorId: z.uuid(),
      revision: z.number().int(),
      action: z.string(),
      reason: z.string().nullable(),
      createdAt: z.string(),
    }),
  ),
  exports: z.array(
    z.strictObject({ id: z.uuid(), revision: z.number().int() }),
  ),
  payment: z.literal("unpaid"),
  capabilities: grant,
});
export const listSchema = z.strictObject({
  counts: z.strictObject({
    all: z.number().int(),
    review: z.number().int(),
    verify: z.number().int(),
    approve: z.number().int(),
    export: z.number().int(),
  }),
  total: z.number().int(),
  offset: z.number().int(),
  limit: z.number().int(),
  items: z.array(
    z.strictObject({
      id: z.uuid(),
      supplier: z.string(),
      reference: z.string(),
      dueDate: z.string(),
      invoiceDate: z.string(),
      gross: z.string(),
      currency: z.literal("GBP"),
      state: z.string(),
      version: z.number().int(),
      owner: z.uuid().optional(),
      attention: z.boolean(),
    }),
  ),
});
export const suppliersSchema = z.strictObject({
  items: z.array(
    z.strictObject({
      id: z.uuid(),
      name: z.string(),
      taxId: z.string(),
      active: z.boolean(),
      version: z.number().int(),
    }),
  ),
});
export const saved = z.strictObject({ id: z.uuid() });
