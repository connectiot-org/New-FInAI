import { z } from "zod";
export const sessionSchema = z.strictObject({
  csrfToken: z.string().regex(/^[a-f0-9]{64}$/),
});
export const logoutSchema = z.strictObject({ status: z.literal("signed-out") });
let epoch = 0;
// Identity changes invalidate private views in other tabs without broadcasting tokens or account data.
const changes = (() => {
  try {
    return typeof window !== "undefined" &&
      typeof BroadcastChannel !== "undefined"
      ? new BroadcastChannel("finai-session-changes")
      : undefined;
  } catch {
    return undefined;
  }
})();
const invalidateLocalSession = () => {
  epoch++;
  window.dispatchEvent(new Event("finai-session-expired"));
};
changes?.addEventListener("message", (event) => {
  if (event.data === "changed") invalidateLocalSession();
});
if (import.meta.hot) import.meta.hot.dispose(() => changes?.close());
export const sessionEpoch = () => epoch;
export function authenticateSession() {
  epoch++;
  changes?.postMessage("changed");
}
export function expireSession(requestEpoch = epoch) {
  if (requestEpoch !== epoch) return;
  invalidateLocalSession();
  changes?.postMessage("changed");
}
async function fetchSession() {
  const r = await fetch("/auth/session", {
    credentials: "same-origin",
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) {
    let deploymentMessage: string | undefined;
    if (r.status === 503) {
      const detail = z
        .object({
          code: z.literal("DEPLOYMENT_NOT_CONFIGURED"),
          message: z.string().max(500),
        })
        .safeParse(await r.json().catch(() => null));
      if (detail.success) deploymentMessage = detail.data.message;
    }
    const e = new Error(
      deploymentMessage ||
        (r.status === 401
          ? "Session expired. Sign in again."
          : "Sign-in service is unavailable."),
    );
    Object.assign(e, { status: r.status });
    throw e;
  }
  const value = sessionSchema.safeParse(await r.json());
  if (!value.success)
    throw new Error("Sign-in service returned an invalid response.");
  return value.data;
}

// Only concurrent checks in the same identity epoch share a bounded request.
// Settled responses are never cached, and a new login/logout cannot reuse an old check.
let inFlight:
  { epoch: number; promise: ReturnType<typeof fetchSession> } | undefined;
export async function readSession(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  if (!inFlight || inFlight.epoch !== epoch) {
    const current = { epoch, promise: fetchSession() };
    inFlight = current;
    void current.promise
      .finally(() => {
        if (inFlight === current) inFlight = undefined;
      })
      .catch(() => {});
  }
  const requestedEpoch = epoch;
  const result = await inFlight.promise;
  if (requestedEpoch !== epoch)
    throw new Error("Identity changed. Reload records.");
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  return result;
}
