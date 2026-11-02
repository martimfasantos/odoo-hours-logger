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
 * Detect whether an error indicates Odoo sign-in failed: no login/API key set
 * yet, or a rejected API key.
 *
 * The contracts endpoint returns HTTP 401 with the backend's message, so `req`
 * throws `Error("401: ...")`. A push instead surfaces the backend message in a
 * per-row error string, so match either message as well as a 401 status (the
 * only 401 the backend raises is a sign-in failure).
 */
export function isOdooAuthError(err: unknown): boolean {
  const s = String(err);
  return (
    /rejected your API key|Odoo login and API key/i.test(s) ||
    s.startsWith("401") ||
    s.startsWith("Error: 401")
  );
}
