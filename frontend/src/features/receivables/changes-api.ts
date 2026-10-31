import { apiRequest } from "../../lib/api";
import { changesSchema } from "./changes";
export { usdChangeCents } from "./changes";
export type { ChangesPage, ChangeRecord } from "./changes";
export type ChangesScope = {
  entityId: string;
  fromSnapshotId: string;
  toSnapshotId: string;
  offset: number;
  limit: number;
};
export const receivablesChangesApi = {
  async compare(s: ChangesScope, signal: AbortSignal) {
    const q = new URLSearchParams({
      entityId: s.entityId,
      fromSnapshotId: s.fromSnapshotId,
      toSnapshotId: s.toSnapshotId,
      offset: String(s.offset),
      limit: String(s.limit),
    });
    const v = await apiRequest(`/receivables/changes?${q}`, changesSchema, {
      signal,
    });
    if (
      v.entityId !== s.entityId ||
      v.fromSource.snapshotId !== s.fromSnapshotId ||
      v.toSource.snapshotId !== s.toSnapshotId ||
      v.offset !== s.offset ||
      v.limit !== s.limit
    )
      throw new Error("Backend returned a different comparison scope.");
    return v;
  },
};
