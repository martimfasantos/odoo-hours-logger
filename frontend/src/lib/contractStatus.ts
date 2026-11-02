import type { OdooRef } from "../api/types";
import { formatMonthDay } from "./dates";

export type ContractStatus =
  | { kind: "ok" }
  | { kind: "missing" }
  | { kind: "ended"; endDate: string }
  | { kind: "not_started"; startDate: string };

/** The contract's end date if it ended before `onDate`, else null. Dates are inclusive ISO YYYY-MM-DD. */
export function endedOn(c: OdooRef, onDate: string): string | null {
  return c.end_date && c.end_date < onDate ? c.end_date : null;
}

/** Whether `contractId` is a usable contract on `onDate` (ISO YYYY-MM-DD). */
export function contractStatus(
  contractId: number,
  contracts: OdooRef[],
  onDate: string,
): ContractStatus {
  const c = contracts.find((x) => x.id === contractId);
  if (!c) return { kind: "missing" };
  const ended = endedOn(c, onDate);
  if (ended) return { kind: "ended", endDate: ended };
  if (c.start_date && onDate < c.start_date) {
    return { kind: "not_started", startDate: c.start_date };
  }
  return { kind: "ok" };
}

/** Contract `<option>` label, suffixed when the contract ended before `onDate`. */
export function contractOptionLabel(c: OdooRef, onDate: string): string {
  const ended = endedOn(c, onDate);
  return ended ? `${c.name} (ended ${formatMonthDay(ended)})` : c.name;
}
