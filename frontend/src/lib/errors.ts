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
 * Detect whether an error indicates Odoo rejected our credentials: an expired
 * session cookie or a rejected API key.
 *
 * The contracts endpoint returns HTTP 401 with the backend's message, so `req`
 * throws `Error("401: Odoo session expired — ...")` (or "Odoo rejected your API
 * key — ..."). A push may instead surface the message in a per-row error
 * string. Match either phrase or a 401 status (the only 401 the backend raises
 * is an auth failure).
 */
export function isSessionExpiredError(err: unknown): boolean {
  const s = String(err);
  return (
    /session expired/i.test(s) ||
    isApiKeyError(s) ||
    s.startsWith("401") ||
    s.startsWith("Error: 401")
  );
}

/** Whether an auth failure is a rejected Odoo API key (not an expired session). */
export function isApiKeyError(err: unknown): boolean {
  return /rejected your API key/i.test(String(err));
}
