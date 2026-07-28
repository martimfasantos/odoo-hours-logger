import type {
  AnalyticsResponse, ConfigValues, ContractTotal, OdooRef, OverviewResponse, ProposedEntry,
  PushEntry, PushResult, Rule, RuleCreate, TestConnectionResult,
} from "./types";

async function req<T>(url: string, options?: RequestInit): Promise<T> {
  const resp = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`${resp.status}: ${text}`);
  }
  return resp.json() as Promise<T>;
}

export const api = {
  health: () => req<{ status: string }>("/api/health"),
  contracts: (query = "") =>
    req<OdooRef[]>(`/api/odoo/contracts?query=${encodeURIComponent(query)}`),
  events: (start: string, end: string) =>
    req<ProposedEntry[]>(`/api/calendar/events?start=${start}&end=${end}`),
  daily: (start: string, end: string) =>
    req<Record<string, ProposedEntry[]>>(`/api/timesheet/daily?start=${start}&end=${end}`),
  weekly: (start: string, end: string) =>
    req<ContractTotal[]>(`/api/timesheet/weekly?start=${start}&end=${end}`),
  overview: (start: string, end: string) =>
    req<OverviewResponse>(`/api/overview?start=${start}&end=${end}`),
  listRules: () => req<Rule[]>("/api/rules"),
  createRule: (data: RuleCreate) =>
    req<Rule>("/api/rules", { method: "POST", body: JSON.stringify(data) }),
  updateRule: (id: number, data: RuleCreate) =>
    req<Rule>(`/api/rules/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteRule: (id: number) =>
    req<{ status: string }>(`/api/rules/${id}`, { method: "DELETE" }),
  push: (entries: PushEntry[]) =>
    req<{ results: PushResult[] }>("/api/timesheet/push", {
      method: "POST", body: JSON.stringify({ entries }),
    }),
  getColors: () => req<Record<string, string>>("/api/colors"),
  setColor: (contractId: number, color: string) =>
    req<Record<string, string>>(`/api/colors/${contractId}`, {
      method: "PUT", body: JSON.stringify({ color }),
    }),
  testConnection: () =>
    req<TestConnectionResult>(
      "/api/settings/test-connection", { method: "POST" }),
  getIgnoreKeywords: () => req<string[]>("/api/ignore"),
  setIgnoreKeywords: (keywords: string[]) =>
    req<string[]>("/api/ignore", { method: "PUT", body: JSON.stringify({ keywords }) }),
  getConfig: () => req<ConfigValues>("/api/config"),
  saveConfig: (values: Partial<ConfigValues>) =>
    req<ConfigValues>("/api/config", { method: "PUT", body: JSON.stringify(values) }),
  analytics: (start: string, end: string) =>
    req<AnalyticsResponse>(`/api/analytics?start=${start}&end=${end}`),
};
