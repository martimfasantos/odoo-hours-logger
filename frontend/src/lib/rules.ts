import type { OdooRef, ProposedEntry, Rule, RuleCreate } from "../api/types";
import type { RowState } from "../state/LogHoursContext";
import { rowKey } from "./rows";

export type RuleSavePlan =
  | { kind: "create"; payload: RuleCreate }
  | { kind: "update"; id: number; payload: RuleCreate }
  | { kind: "exists"; name: string };

/**
 * How to remember `keyword` -> `contract`: extend the contract's lowest-id
 * active rule, or create a new rule. Inactive rules are skipped because a
 * keyword added to one would never match.
 */
export function planRuleSave(
  rules: Rule[],
  keyword: string,
  contract: OdooRef,
): RuleSavePlan {
  const existing = rules
    .filter((r) => r.active && r.contract_id === contract.id)
    .sort((a, b) => a.id - b.id)[0];
  if (!existing) {
    return {
      kind: "create",
      payload: {
        name: contract.name,
        keywords: [keyword],
        contract_id: contract.id,
        contract_name: contract.name,
        active: true,
      },
    };
  }
  const { id, ...rule } = existing;
  if (rule.keywords.some((k) => k.toLowerCase() === keyword.toLowerCase())) {
    return { kind: "exists", name: rule.name };
  }
  return {
    kind: "update",
    id,
    payload: { ...rule, keywords: [...rule.keywords, keyword] },
  };
}

/**
 * Give `contractId` to every loaded row the keyword matches (case-insensitive
 * substring, like the backend's match_title). Rows that already have a
 * contract are left alone, and so are logged rows, which are locked.
 */
export function assignByKeyword(
  proposals: ProposedEntry[],
  rows: Record<string, RowState>,
  keyword: string,
  contractId: number,
): Record<string, RowState> {
  const needle = keyword.toLowerCase();
  const next = { ...rows };
  for (const p of proposals) {
    const key = rowKey(p);
    if (
      !p.already_logged &&
      next[key]?.contractId === null &&
      p.event.title.toLowerCase().includes(needle)
    ) {
      next[key] = { ...next[key], contractId };
    }
  }
  return next;
}
