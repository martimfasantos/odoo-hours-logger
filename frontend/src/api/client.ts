import type {
  ContractTotal, OdooRef, ProposedEntry, PushEntry, PushResult, Rule, RuleCreate,
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
  projects: () => req<OdooRef[]>("/api/odoo/projects"),
  tasks: (projectId: number) => req<OdooRef[]>(`/api/odoo/projects/${projectId}/tasks`),
  events: (start: string, end: string) =>
    req<ProposedEntry[]>(`/api/calendar/events?start=${start}&end=${end}`),
  daily: (start: string, end: string) =>
    req<Record<string, ProposedEntry[]>>(`/api/timesheet/daily?start=${start}&end=${end}`),
  weekly: (start: string, end: string) =>
    req<ContractTotal[]>(`/api/timesheet/weekly?start=${start}&end=${end}`),
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
  setColor: (projectId: number, color: string) =>
    req<Record<string, string>>(`/api/colors/${projectId}`, {
      method: "PUT", body: JSON.stringify({ color }),
    }),
  testConnection: () =>
    req<{ odoo: boolean; calendar: boolean; errors: Record<string, string> }>(
      "/api/settings/test-connection", { method: "POST" }),
};
