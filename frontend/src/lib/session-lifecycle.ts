// Coordinate expiry without storing credentials or allowing old replies to end a new session.
let revision = 0;
export const sessionRevision = () => revision;
export function sessionChanged() {
  revision++;
}
export function sessionExpired(requestRevision: number) {
  if (requestRevision !== revision) return;
  revision++;
  window.dispatchEvent(new Event("finai:session-expired"));
}
