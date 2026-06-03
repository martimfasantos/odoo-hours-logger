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
  project_id: number | null;
  project_name: string | null;
  task_id: number | null;
  task_name: string | null;
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
  project_id: number;
  project_name: string;
  task_id: number | null;
  task_name: string | null;
  priority: number;
  active: boolean;
}

export type RuleCreate = Omit<Rule, "id">;

export interface PushEntry {
  uid: string;
  start: string;
  date: string;
  hours: number;
  description: string;
  project_id: number;
  task_id: number | null;
}

export interface PushResult {
  uid: string;
  start: string;
  success: boolean;
  odoo_line_id: number | null;
  error: string | null;
}

export interface ContractTotal {
  project_id: number;
  project_name: string;
  task_id: number | null;
  task_name: string | null;
  hours: number;
}
