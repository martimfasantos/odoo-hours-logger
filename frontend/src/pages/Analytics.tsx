import { useEffect, useState } from "react";
import { BarChart3, RefreshCw } from "lucide-react";
import { api } from "../api/client";
import type { AnalyticsResponse } from "../api/types";
import { useToast } from "../components/Toast";
import Button from "../components/Button";
import Spinner from "../components/Spinner";
import VpnModal from "../components/VpnModal";
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

function fmtWeek(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export default function Analytics() {
  const toast = useToast();
  const [from, setFrom] = useState(firstOfMonthISO());
  const [to, setTo] = useState(isoDate(new Date()));
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [colors, setColors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [vpnOpen, setVpnOpen] = useState(false);

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
      setData(await api.analytics(from, to));
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

  const currency = data?.currency ?? "EUR";
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

  const maxWeek = data
    ? Math.max(1, ...data.weekly.map((w) => w.hours))
    : 1;

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

      {!loading && data && data.projects.length === 0 && (
        <div className="card">
          <div className="empty">
            <BarChart3 size={40} aria-hidden="true" />
            <p>No logged entries in this range.</p>
          </div>
        </div>
      )}

      {!loading && data && data.projects.length > 0 && (
        <>
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
                  {data.projects.map((p) => (
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
                      <td className="num">{pct(p.allocation_pct)}</td>
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
                    <td className="num">{data.totals.hours.toFixed(1)}h</td>
                    <td className="num">100%</td>
                    <td className="num" />
                    <td className="num" />
                    <td className="num">{money(data.totals.revenue)}</td>
                    <td className="num">{money(data.totals.cost)}</td>
                    <td className="num">{money(data.totals.margin)}</td>
                    <td className="num">{pct(data.totals.margin_pct)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>

          <section className="card" aria-label="Weekly hours">
            <div className="card__head">
              <h3>Weekly hours</h3>
              <span className="day-group__meta">{data.totals.hours.toFixed(1)}h total</span>
            </div>
            <div className="card__pad">
              <div className="bars">
                {data.weekly.map((w) => {
                  const width = (w.hours / maxWeek) * 100;
                  return (
                    <div className="bar-row" key={w.week_start}>
                      <span className="bar-row__label" title={w.week_start}>
                        {fmtWeek(w.week_start)}
                      </span>
                      <span className="bar-row__track">
                        <span className="bar-row__fill" style={{ width: `${width}%` }} />
                        <span
                          className="bar-row__value num"
                          style={{ left: `calc(${width}% + ${width > 80 ? "-40px" : "8px"})` }}
                        >
                          {w.hours.toFixed(1)}h
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
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
