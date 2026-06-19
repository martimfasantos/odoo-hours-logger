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
