export interface OdooRef {
  id: number;
  name: string;
  /** ISO YYYY-MM-DD, inclusive. */
  start_date?: string | null;
  end_date?: string | null;
}

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
  active: boolean;
}

export type RuleCreate = Omit<Rule, "id">;

export interface PreferencesBundle {
  version: number;
  rules: Rule[];
  filter_words: string[];
  colors: Record<string, string>;
}

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

export interface OverviewBlock {
  contract_id: number | null;
  contract_name: string;
  title: string;
  start: string;
  end: string;
  hours: number;
  status: "logged" | "to_log";
}

export interface ContractOverview {
  contract_id: number;
  contract_name: string;
  logged_hours: number;
  to_log_hours: number;
}

export interface OverviewResponse {
  by_contract: ContractOverview[];
  blocks: OverviewBlock[];
}

export interface RemovedEvent {
  uid: string;
  start: string;
  end: string;
  title: string;
  date: string;
}

export interface TestConnectionResult {
  odoo: boolean;
  calendar: boolean;
  odoo_unreachable: boolean;
  errors: Record<string, string>;
}

export interface AnalyticsProject {
  contract_id: number;
  contract_name: string;
  hours: number;
  internal_rate: number | null;
  external_rate: number | null;
  revenue: number;
  cost: number;
  margin: number;
  margin_pct: number | null;
}

export interface AnalyticsEntry {
  date: string; // local YYYY-MM-DD of the entry start
  contract_id: number;
  hours: number;
  revenue: number;
  cost: number;
}

export interface AnalyticsResponse {
  projects: AnalyticsProject[];
  entries: AnalyticsEntry[];
  currency: string;
}

export interface ConfigValues {
  GOOGLE_CALENDAR_URL: string;
  ODOO_URL: string;
  ODOO_DB: string;
  ODOO_USERNAME: string;
  ODOO_API_KEY: string;
  ODOO_NETWORK_MEMBER_ID: number | null;
  LOCAL_TZ: string;
  USER_EMAIL: string;
  DEMO_MODE: boolean;
}
