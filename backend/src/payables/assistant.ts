import { z } from "zod";
import { id, text, version } from "./domain";
export const invoiceIntent = z.enum([
  "review",
  "verify",
  "approve",
  "correction",
  "challenge",
  "reject",
  "export",
]);
export const invoiceCommand = z.strictObject({
  operationId: id,
  entityId: id,
  expectedVersion: version,
  action: invoiceIntent,
  reason: text.optional(),
});
export const invoiceProposal = invoiceCommand.omit({ reason: true }).extend({
  invoiceId: z.uuid(),
  reference: z.string().max(200),
  revision: z.number().int().min(1),
  title: z.string().max(160),
  description: z.string().max(500),
  reasonRequired: z.boolean(),
  sourceId: z.string().max(80),
});
export type InvoiceProposal = z.infer<typeof invoiceProposal>;
export const titles: Record<z.infer<typeof invoiceIntent>, string> = {
  review: "Submit invoice for review",
  verify: "Verify delivery",
  approve: "Approve invoice",
  correction: "Request correction",
  challenge: "Challenge invoice",
  reject: "Reject invoice",
  export: "Prepare accounting export",
};

export const confirmedInvoiceCommand = invoiceCommand.refine(
  (v) =>
    ["correction", "challenge", "reject"].includes(v.action)
      ? !!v.reason
      : v.reason === undefined,
  "Provide a reason only for correction, challenge or rejection.",
);
