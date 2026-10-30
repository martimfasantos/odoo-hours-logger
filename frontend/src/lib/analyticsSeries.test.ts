import { describe, it, expect } from "vitest";
import type { AnalyticsEntry, AnalyticsProject } from "../api/types";
import { buildSeries, type SeriesOptions } from "./analyticsSeries";

function project(id: number, external_rate: number | null): AnalyticsProject {
  return {
    contract_id: id, contract_name: `P${id}`, hours: 0,
    internal_rate: 40, external_rate, revenue: 0, cost: 0, margin: 0, margin_pct: null,
  };
}

const PROJECTS = [project(1, 100), project(2, 0), project(3, null)];

const ENTRIES: AnalyticsEntry[] = [
  { date: "2026-06-29", contract_id: 1, hours: 2, revenue: 200, cost: 80 },
  { date: "2026-06-30", contract_id: 2, hours: 1, revenue: 0, cost: 50 },
  { date: "2026-07-01", contract_id: 1, hours: 3, revenue: 300, cost: 120 },
  { date: "2026-07-01", contract_id: 3, hours: 1.5, revenue: 0, cost: 60 },
  { date: "2026-07-08", contract_id: 1, hours: 1, revenue: 100, cost: 40 },
];

// Sunday Jun 28 .. Thursday Jul 9 2026 crosses a month boundary.
const BASE: SeriesOptions = {
  granularity: "day",
  groupBy: "project",
  metric: "hours",
  from: "2026-06-28",
  to: "2026-07-09",
  colors: {},
};

const run = (o: Partial<SeriesOptions>) => buildSeries(ENTRIES, PROJECTS, { ...BASE, ...o });
const valuesById = (r: ReturnType<typeof run>) =>
  Object.fromEntries(r.series.map((s) => [s.id, s.values]));

describe("buildSeries", () => {
  it("buckets by day with every empty day present", () => {
    const r = run({});
    expect(r.periods.map((p) => p.key)).toEqual([
      "2026-06-28", "2026-06-29", "2026-06-30", "2026-07-01", "2026-07-02", "2026-07-03",
      "2026-07-04", "2026-07-05", "2026-07-06", "2026-07-07", "2026-07-08", "2026-07-09",
    ]);
    expect(valuesById(r)).toEqual({
      "1": [0, 2, 0, 3, 0, 0, 0, 0, 0, 0, 1, 0],
      "2": [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      "3": [0, 0, 0, 1.5, 0, 0, 0, 0, 0, 0, 0, 0],
    });
  });

  it("buckets by Monday-start week, starting at the week containing `from`", () => {
    const r = run({ granularity: "week" });
    expect(r.periods.map((p) => p.key)).toEqual(["2026-06-22", "2026-06-29", "2026-07-06"]);
    expect(valuesById(r)).toEqual({ "1": [0, 5, 1], "2": [0, 1, 0], "3": [0, 1.5, 0] });
  });

  it("buckets by month across the boundary, single total series", () => {
    const r = run({ granularity: "month", groupBy: "none" });
    expect(r.periods.map((p) => p.key)).toEqual(["2026-06-01", "2026-07-01"]);
    expect(r.series).toEqual([
      { id: "total", label: "Total", color: "var(--color-secondary)", values: [3, 5.5] },
    ]);
  });

  it("groups billable (external_rate > 0) vs internal, margin = revenue - cost", () => {
    const r = run({ granularity: "month", groupBy: "billable", metric: "margin" });
    expect(valuesById(r)).toEqual({ billable: [120, 240], internal: [-50, -60] });
  });

  it("drops an all-zero series (internal has no revenue)", () => {
    const r = run({ granularity: "month", groupBy: "billable", metric: "revenue" });
    expect(valuesById(r)).toEqual({ billable: [200, 400] });
  });

  it("only counts entries of the projects passed in, in every grouping", () => {
    const shown = PROJECTS.filter((p) => p.contract_id !== 2);
    const runShown = (o: Partial<SeriesOptions>) =>
      buildSeries(ENTRIES, shown, { ...BASE, granularity: "month", ...o });
    expect(valuesById(runShown({}))).toEqual({ "1": [2, 4], "3": [0, 1.5] });
    expect(valuesById(runShown({ groupBy: "none", metric: "cost" }))).toEqual({ total: [80, 220] });
  });
});
