/** Distinct, accessible palette used to color contracts deterministically. */
export const PALETTE: string[] = [
  "#3B82F6",
  "#D97706",
  "#15803D",
  "#9333EA",
  "#DC2626",
  "#0891B2",
  "#DB2777",
  "#65A30D",
  "#7C3AED",
  "#0D9488",
];

/** Neutral gray for events without a resolved contract. */
export const UNASSIGNED_COLOR = "#94A3B8";

/**
 * Resolve a display color for a contract.
 * - `null` contractId -> the neutral unassigned gray.
 * - A stored override (`stored[String(contractId)]`) wins if present.
 * - Otherwise a deterministic palette color keyed off the contractId.
 */
export function colorForContract(
  contractId: number | null,
  stored: Record<string, string>,
): string {
  if (contractId == null) return UNASSIGNED_COLOR;
  const override = stored[String(contractId)];
  if (override) return override;
  return PALETTE[Math.abs(contractId) % PALETTE.length];
}
