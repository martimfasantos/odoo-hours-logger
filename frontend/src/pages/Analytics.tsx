import { useEffect, useState } from "react";
import { BarChart3, RefreshCw } from "lucide-react";
import { api } from "../api/client";
import type { AnalyticsResponse } from "../api/types";
import { useToast } from "../components/Toast";
import Button from "../components/Button";
import Spinner from "../components/Spinner";
import StackedColumnChart from "../components/StackedColumnChart";
import VpnModal from "../components/VpnModal";
import { buildSeries, type Granularity, type GroupBy, type Metric } from "../lib/analyticsSeries";
import { colorForContract } from "../lib/colors";
import { isUnreachableError } from "../lib/errors";

/** Local YYYY-MM-DD (avoids UTC off-by-one from toISOString). */
function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function firstOfMonthISO(): string {
  const d = new Date();
  return isoDate(new Date(d.getFullYear(), d.getMonth(), 1));
}

interface ChartState {
  granularity: Granularity;
  groupBy: GroupBy;
  metric: Metric;
  excluded: ReadonlySet<number>; // contract ids filtered out of chart and table
  hidden: ReadonlySet<string>; // series ids hidden via the legend
}

const GRANULARITIES: [Granularity, string][] = [["day", "Day"], ["week", "Week"], ["month", "Month"]];
const GROUPS: [GroupBy, string][] = [["project", "Project"], ["billable", "Billable"], ["none", "None"]];
const METRICS: [Metric, string][] = [
  ["hours", "Hours"], ["revenue", "Revenue"], ["cost", "Cost"], ["margin", "Margin"],
];

function toggled<T>(set: ReadonlySet<T>, v: T): Set<T> {
  const next = new Set(set);
  if (!next.delete(v)) next.add(v);
  return next;
}

function Segmented<T extends string>({ label, options, value, onChange }: {
  label: string;
  options: [T, string][];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="view-toggle view-toggle--sm" role="group" aria-label={label}>
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          className={`view-toggle__btn${v === value ? " is-active" : ""}`}
          aria-pressed={v === value}
          onClick={() => onChange(v)}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

export default function Analytics() {
  const toast = useToast();
  const [from, setFrom] = useState(firstOfMonthISO());
  const [to, setTo] = useState(isoDate(new Date()));
  // The range is kept with the response so the chart's periods match the data, not unsaved picker edits.
  const [data, setData] = useState<{ response: AnalyticsResponse; from: string; to: string } | null>(null);
  const [colors, setColors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [vpnOpen, setVpnOpen] = useState(false);
  const [chart, setChart] = useState<ChartState>({
    granularity: "week",
    groupBy: "project",
    metric: "hours",
    excluded: new Set(),
    hidden: new Set(),
  });

  useEffect(() => {
    api.getColors().then(setColors).catch(() => setColors({}));
  }, []);

  async function load() {
    if (from > to) {
      toast.error('"From" must be on or before "To".');
      return;
    }
    setLoading(true);
    try {
      setData({ response: await api.analytics(from, to), from, to });
    } catch (e) {
      if (isUnreachableError(e)) setVpnOpen(true);
      toast.error(`Failed to load analytics: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  // Initial load once.
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currency = data?.response.currency ?? "EUR";
  const money = (n: number) =>
    new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(n);
  const rate = (n: number | null) =>
    n === null
      ? "—"
      : new Intl.NumberFormat(undefined, {
          style: "currency",
          currency,
          maximumFractionDigits: 2,
        }).format(n);
  const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n)}%`);

  const compactMoney = (n: number) =>
    new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(n);
  const isHours = chart.metric === "hours";

  const shown = data ? data.response.projects.filter((p) => !chart.excluded.has(p.contract_id)) : [];
  const sum = (k: "hours" | "revenue" | "cost") => shown.reduce((acc, p) => acc + p[k], 0);
  const totals = { hours: sum("hours"), revenue: sum("revenue"), cost: sum("cost") };
  const totalMargin = totals.revenue - totals.cost;
  const { periods, series } = data
    ? buildSeries(data.response.entries, data.response.projects, {
        granularity: chart.granularity,
        groupBy: chart.groupBy,
        metric: chart.metric,
        includedIds: new Set(shown.map((p) => p.contract_id)),
        from: data.from,
        to: data.to,
        colors,
      })
    : { periods: [], series: [] };

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <h1 className="page__title">Analytics</h1>
          <p className="page__subtitle">
            Per-project hours &amp; money from your logged entries.
          </p>
        </div>
      </header>

      <div className="card">
        <div className="card__pad">
          <div className="toolbar">
            <div className="field">
              <label className="field__label" htmlFor="an-from">
                From
              </label>
              <input
                id="an-from"
                type="date"
                className="input"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="an-to">
                To
              </label>
              <input
                id="an-to"
                type="date"
                className="input"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
            <Button variant="primary" onClick={load} loading={loading} disabled={loading}>
              {!loading && <RefreshCw size={16} aria-hidden="true" />}
              Refresh
            </Button>
          </div>
        </div>
      </div>

      {loading && (
        <div className="card">
          <div className="loading-block">
            <Spinner large />
            <span>Loading analytics…</span>
          </div>
        </div>
      )}

      {!loading && data && data.response.projects.length === 0 && (
        <div className="card">
          <div className="empty">
            <BarChart3 size={40} aria-hidden="true" />
            <p>No logged entries in this range.</p>
          </div>
        </div>
      )}

      {!loading && data && data.response.projects.length > 0 && (
        <>
          <section className="card" aria-label="Over time">
            <div className="card__head chart-card__head">
              <h3>Over time</h3>
              <div className="chart-controls">
                <Segmented
                  label="Granularity"
                  options={GRANULARITIES}
                  value={chart.granularity}
                  onChange={(granularity) => setChart({ ...chart, granularity })}
                />
                <Segmented
                  label="Group by"
                  options={GROUPS}
                  value={chart.groupBy}
                  onChange={(groupBy) => setChart({ ...chart, groupBy, hidden: new Set() })}
                />
                <Segmented
                  label="Metric"
                  options={METRICS}
                  value={chart.metric}
                  onChange={(metric) => setChart({ ...chart, metric })}
                />
              </div>
              <div className="chart-chips" role="group" aria-label="Projects">
                {data.response.projects.map((p) => (
                  <button
                    key={p.contract_id}
                    type="button"
                    className="chart-chip"
                    aria-pressed={!chart.excluded.has(p.contract_id)}
                    onClick={() =>
                      setChart({ ...chart, excluded: toggled(chart.excluded, p.contract_id) })
                    }
                  >
                    <span
                      className="contract-swatch"
                      style={{ background: colorForContract(p.contract_id, colors) }}
                      aria-hidden="true"
                    />
                    {p.contract_name}
                  </button>
                ))}
              </div>
            </div>
            <div className="card__pad">
              <StackedColumnChart
                periods={periods}
                series={series}
                hidden={chart.hidden}
                onToggleSeries={(id) => setChart({ ...chart, hidden: toggled(chart.hidden, id) })}
                formatValue={isHours ? (n) => `${n.toFixed(1)}h` : money}
                formatTick={isHours ? (n) => `${n}h` : compactMoney}
                ariaLabel={`${chart.metric} per ${chart.granularity}`}
              />
            </div>
          </section>

          <section className="card" aria-label="Per-project analytics">
            <div className="card__head">
              <h3>By project</h3>
              <span className="day-group__meta">logged in range</span>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Contract</th>
                    <th className="num">Hours</th>
                    <th className="num">Alloc</th>
                    <th className="num">Int rate</th>
                    <th className="num">Ext rate</th>
                    <th className="num">Revenue</th>
                    <th className="num">Cost</th>
                    <th className="num">Margin</th>
                    <th className="num">Margin %</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((p) => (
                    <tr key={p.contract_id}>
                      <td>
                        <span className="contract-cell">
                          <span
                            className="contract-swatch"
                            style={{ background: colorForContract(p.contract_id, colors) }}
                            aria-hidden="true"
                          />
                          {p.contract_name}
                        </span>
                      </td>
                      <td className="num">{p.hours.toFixed(1)}h</td>
                      <td className="num">
                        {pct(totals.hours ? (p.hours / totals.hours) * 100 : 0)}
                      </td>
                      <td className="num">{rate(p.internal_rate)}</td>
                      <td className="num">{rate(p.external_rate)}</td>
                      <td className="num">{money(p.revenue)}</td>
                      <td className="num">{money(p.cost)}</td>
                      <td className="num">{money(p.margin)}</td>
                      <td className="num">{pct(p.margin_pct)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total</td>
                    <td className="num">{totals.hours.toFixed(1)}h</td>
                    <td className="num">100%</td>
                    <td className="num" />
                    <td className="num" />
                    <td className="num">{money(totals.revenue)}</td>
                    <td className="num">{money(totals.cost)}</td>
                    <td className="num">{money(totalMargin)}</td>
                    <td className="num">
                      {pct(totals.revenue ? (totalMargin / totals.revenue) * 100 : null)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        </>
      )}

      <VpnModal
        open={vpnOpen}
        retrying={loading}
        onRetry={() => {
          setVpnOpen(false);
          load();
        }}
        onClose={() => setVpnOpen(false)}
      />
    </div>
  );
}
