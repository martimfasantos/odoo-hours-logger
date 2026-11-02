import { AlertTriangle } from "lucide-react";
import type { OdooRef } from "../api/types";
import { contractStatus } from "../lib/contractStatus";
import { formatMonthDay } from "../lib/dates";
import Badge from "./Badge";

interface ContractDateWarningProps {
  contractId: number | null;
  contracts: OdooRef[];
  /** The event's ISO YYYY-MM-DD date. */
  date: string;
}

/** Warns when a Log Hours row's contract isn't running on the event's date. */
export default function ContractDateWarning({
  contractId,
  contracts,
  date,
}: ContractDateWarningProps) {
  if (contractId == null) return null;
  const s = contractStatus(contractId, contracts, date);
  let text: string;
  if (s.kind === "ended") text = `Contract ended ${formatMonthDay(s.endDate)}`;
  else if (s.kind === "not_started") text = `Contract starts ${formatMonthDay(s.startDate)}`;
  else return null;
  return (
    <Badge variant="warning">
      <AlertTriangle size={12} aria-hidden="true" />
      {text}
    </Badge>
  );
}
