import type { Prisma } from "@prisma/client";
import type { Identity } from "../config";
import { ApiError } from "../errors";
export async function requireImport(
  tx: Prisma.TransactionClient,
  identity: Identity,
  entityId: string,
) {
  const a = await tx.entityAccess.findUnique({
    where: { organisationId_userId_entityId: { ...identity, entityId } },
    include: { membership: true },
  });
  if (!a?.membership.active)
    throw new ApiError(404, "NOT_FOUND", "Resource not found.");
  if (!a.canImport)
    throw new ApiError(403, "FORBIDDEN", "Import permission is required.");
}
export async function requireAdministrator(
  tx: Prisma.TransactionClient,
  identity: Identity,
) {
  const m = await tx.membership.findUnique({
    where: { organisationId_userId: identity },
  });
  if (!m?.active || !m.isAdministrator)
    throw new ApiError(
      403,
      "FORBIDDEN",
      "Administrator permission is required.",
    );
  return m;
}
