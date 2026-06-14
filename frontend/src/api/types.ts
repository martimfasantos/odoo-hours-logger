export interface OdooRef { id: number; name: string; }

export interface CalendarEvent {
  uid: string;
  title: string;
  start: string;
  end: string;
  hours: number;
  date: string;
}

export interface MatchResult {
  rule_id: number | null;
  contract_id: number | null;
  contract_name: string | null;
  alternative_rule_ids: number[];
}

export interface ProposedEntry {
  event: CalendarEvent;
  match: MatchResult;
  already_logged: boolean;
  overlaps: boolean;
}

export interface Rule {
  id: number;
  name: string;
  keywords: string[];
  contract_id: number;
  contract_name: string;
  priority: number;
  active: boolean;
}

export type RuleCreate = Omit<Rule, "id">;

export interface PushEntry {
  uid: string;
  start: string;
  end: string;
  description: string;
  contract_id: number;
}

export interface PushResult {
  uid: string;
  start: string;
  success: boolean;
  odoo_id: number | null;
  error: string | null;
}

export interface ContractTotal {
  contract_id: number;
  contract_name: string;
  hours: number;
}
