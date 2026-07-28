/**
 * Detect whether an error indicates Odoo is unreachable because the VPN is off.
 *
 * The `req` helper throws `Error("503: ...VPN...")` for the contracts endpoint
 * when the backend can't reach Odoo, so we treat either a /VPN/i match or a
 * message that starts with "503" as an unreachable-Odoo signal.
 */
export function isUnreachableError(err: unknown): boolean {
  const s = String(err);
  return /VPN/i.test(s) || s.startsWith("503") || s.startsWith("Error: 503");
}

/**
 * Detect whether an error indicates the Odoo session cookie has expired.
 *
 * The contracts endpoint returns HTTP 401 with a "session expired" detail, so
 * `req` throws `Error("401: Odoo session expired — ...")`. A push may instead
 * surface the message in a per-row error string. Match either the phrase or a
 * 401 status (the only 401 the backend raises is session expiry).
 */
export function isSessionExpiredError(err: unknown): boolean {
  const s = String(err);
  return /session expired/i.test(s) || s.startsWith("401") || s.startsWith("Error: 401");
}
