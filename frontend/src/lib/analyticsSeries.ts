import type { AnalyticsEntry, AnalyticsProject } from "../api/types";
import { colorForContract } from "./colors";
import { addDays, addMonths, startOfWeek } from "./dates";

export type Granularity = "day" | "week" | "month";
export type GroupBy = "project" | "billable" | "none";
export type Metric = "hours" | "revenue" | "cost" | "margin";

export interface Period {
  key: string; // YYYY-MM-DD the period starts on
  label: string;
}

export interface Series {
  id: string;
  label: string;
  color: string;
  values: number[]; // aligned to periods
}

export interface SeriesOptions {
  granularity: Granularity;
  groupBy: GroupBy;
  metric: Metric;
  from: string;
  to: string;
  colors: Record<string, string>;
}

const METRIC: Record<Metric, (e: AnalyticsEntry) => number> = {
  hours: (e) => e.hours,
  revenue: (e) => e.revenue,
  cost: (e) => e.cost,
  margin: (e) => e.revenue - e.cost,
};

function periodKey(iso: string, g: Granularity): string {
  if (g === "day") return iso;
  if (g === "week") return startOfWeek(new Date(`${iso}T00:00:00`));
  return `${iso.slice(0, 7)}-01`;
}

function nextPeriod(key: string, g: Granularity): string {
  if (g === "day") return addDays(key, 1);
  if (g === "week") return addDays(key, 7);
  return addMonths(key, 1);
}

function periodLabel(key: string, g: Granularity): string {
  return new Date(`${key}T00:00:00`).toLocaleDateString(
    undefined,
    g === "month" ? { month: "short", year: "numeric" } : { month: "short", day: "numeric" },
  );
}

/** The stacked series for a grouping, and which series a contract's entries fall into. */
function grouping(
  projects: AnalyticsProject[],
  groupBy: GroupBy,
  colors: Record<string, string>,
): { defs: Omit<Series, "values">[]; seriesIdOf: (cid: number) => string } {
  switch (groupBy) {
    case "project":
      return {
        defs: projects.map((p) => ({
          id: String(p.contract_id),
          label: p.contract_name,
          color: colorForContract(p.contract_id, colors),
        })),
        seriesIdOf: String,
      };
    case "billable": {
      const billable = new Set(
        projects.filter((p) => (p.external_rate ?? 0) > 0).map((p) => p.contract_id),
      );
      return {
        defs: [
          { id: "billable", label: "Billable", color: "var(--color-secondary)" },
          { id: "internal", label: "Internal", color: "#D97706" },
        ],
        seriesIdOf: (cid) => (billable.has(cid) ? "billable" : "internal"),
      };
    }
    case "none":
      return {
        defs: [{ id: "total", label: "Total", color: "var(--color-secondary)" }],
        seriesIdOf: () => "total",
      };
  }
}

/** Bucket the entries of `projects` into every period of [from, to] and split them into stacked series. */
export function buildSeries(
  entries: AnalyticsEntry[],
  projects: AnalyticsProject[],
  opts: SeriesOptions,
): { periods: Period[]; series: Series[] } {
  const g = opts.granularity;
  const periods: Period[] = [];
  for (let k = periodKey(opts.from, g); k <= opts.to; k = nextPeriod(k, g)) {
    periods.push({ key: k, label: periodLabel(k, g) });
  }
  const periodIndex = new Map(periods.map((p, i) => [p.key, i]));

  const included = new Set(projects.map((p) => p.contract_id));
  const { defs, seriesIdOf } = grouping(projects, opts.groupBy, opts.colors);
  const values = new Map(defs.map((d) => [d.id, periods.map(() => 0)]));
  for (const e of entries) {
    const i = periodIndex.get(periodKey(e.date, g));
    if (i === undefined || !included.has(e.contract_id)) continue;
    values.get(seriesIdOf(e.contract_id))![i] += METRIC[opts.metric](e);
  }

  const series = defs
    .map((d) => ({ ...d, values: values.get(d.id)!.map((v) => Math.round(v * 100) / 100) }))
    .filter((s) => s.values.some((v) => v !== 0));
  return { periods, series };
}
