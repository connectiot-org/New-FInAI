import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { Identity } from "./config";
export const requestAuditContext = new AsyncLocalStorage<{
  requestId: string;
}>();
const keys = new Set([
  "version",
  "count",
  "completed",
  "archived",
  "active",
  "administrator",
  "canWrite",
  "canImport",
  "targetUserId",
  "reasonCode",
  "rowCount",
  "nextVersion",
]);
export async function recordAudit(
  tx: Prisma.TransactionClient,
  identity: Identity,
  action: string,
  reference: string,
  entityId?: string,
  metadata: Record<string, string | number | boolean> = {},
) {
  for (const [k, v] of Object.entries(metadata))
    if (
      !keys.has(k) ||
      (typeof v === "string" &&
        (v.length > 100 || /[\u0000-\u001f\u007f]/.test(v))) ||
      (typeof v === "number" && !Number.isSafeInteger(v))
    )
      throw new Error("Unsafe audit metadata.");
  return tx.serverAudit.create({
    data: {
      id: randomUUID(),
      organisationId: identity.organisationId,
      actorId: identity.userId,
      entityId: entityId || null,
      requestId: requestAuditContext.getStore()?.requestId || randomUUID(),
      action,
      reference,
      outcome: "success",
      metadata,
    },
  });
}
