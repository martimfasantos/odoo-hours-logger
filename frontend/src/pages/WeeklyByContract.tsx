import { useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, CalendarX2 } from "lucide-react";
import { api } from "../api/client";
import type { ContractTotal } from "../api/types";
import { useToast } from "../components/Toast";
import Spinner from "../components/Spinner";
import { startOfWeek, addDays, formatHours } from "../lib/dates";
import { colorForProject } from "../lib/colors";

export default function WeeklyByContract() {
  const toast = useToast();

  const initialStart = useMemo(() => startOfWeek(new Date()), []);
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(addDays(initialStart, 6));

  const [totals, setTotals] = useState<ContractTotal[]>([]);
  const [colors, setColors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const reqId = useRef(0);

  useEffect(() => {
    load(start, end);
    api
      .getColors()
      .then(setColors)
      .catch(() => setColors({}));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load(s: string, e: string) {
    const myId = ++reqId.current;
    setLoading(true);
    try {
      const data = await api.weekly(s, e);
      if (myId !== reqId.current) return;
      setTotals(data);
    } catch (err) {
      if (myId !== reqId.current) return;
      toast.error(`Failed to load weekly totals: ${String(err)}`);
    } finally {
      if (myId === reqId.current) setLoading(false);
    }
  }

  function handleStartChange(value: string) {
    setStart(value);
    load(value, end);
  }

  function handleEndChange(value: string) {
    setEnd(value);
    load(start, value);
  }

  const sorted = useMemo(
    () => [...totals].sort((a, b) => b.hours - a.hours),
    [totals],
  );

  const grandTotal = useMemo(
    () => totals.reduce((s, t) => s + t.hours, 0),
    [totals],
  );

  const maxHours = sorted.length > 0 ? sorted[0].hours : 1;

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <h1 className="page__title">Weekly by contract</h1>
          <p className="page__subtitle">
            Hours logged to Odoo grouped by project and task for a given week.
          </p>
        </div>
      </header>

      <div className="card">
        <div className="card__pad">
          <div className="toolbar">
            <div className="field">
              <label className="field__label" htmlFor="weekly-start">
                Week start
              </label>
              <input
                id="weekly-start"
                type="date"
                className="input"
                value={start}
                max={end}
                onChange={(e) => handleStartChange(e.target.value)}
              />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="weekly-end">
                Week end
              </label>
              <input
                id="weekly-end"
                type="date"
                className="input"
                value={end}
                min={start}
                onChange={(e) => handleEndChange(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      {loading && (
        <div className="card">
          <div className="loading-block">
            <Spinner large />
            <span>Loading weekly totals…</span>
          </div>
        </div>
      )}

      {!loading && totals.length === 0 && (
        <div className="card">
          <div className="empty">
            <CalendarX2 size={40} aria-hidden="true" />
            <p>No hours logged this week.</p>
          </div>
        </div>
      )}

      {!loading && sorted.length > 0 && (
        <>
          {/* Bar chart */}
          <section className="card" aria-label="Hours bar chart">
            <div className="card__head">
              <h3>
                <BarChart3 size={16} aria-hidden="true" style={{ display: "inline", marginRight: 6, verticalAlign: "middle" }} />
                Distribution
              </h3>
              <span className="num muted" style={{ fontSize: "0.88rem" }}>
                Total: {formatHours(grandTotal)}
              </span>
            </div>
            <div className="card__pad">
              <div className="bars" role="img" aria-label="Horizontal bar chart of hours by project">
                {sorted.map((row, i) => {
                  const pct = maxHours > 0 ? (row.hours / maxHours) * 100 : 0;
                  const label = row.task_name
                    ? `${row.project_name} / ${row.task_name}`
                    : row.project_name;
                  return (
                    <div
                      key={`${row.project_id}-${row.task_id ?? "none"}-${i}`}
                      className="bar-row"
                      aria-label={`${label}: ${formatHours(row.hours)}`}
                    >
                      <span className="bar-row__label" title={label}>
                        {label}
                      </span>
                      <div className="bar-row__track">
                        <div
                          className="bar-row__fill"
                          style={{
                            width: `${pct}%`,
                            background: colorForProject(row.project_id, colors),
                          }}
                        />
                        <span
                          className="bar-row__value num"
                          style={{ left: `calc(${pct}% + 8px)` }}
                        >
                          {formatHours(row.hours)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* Table */}
          <section className="card" aria-label="Hours breakdown table">
            <div className="card__head">
              <h3>Breakdown</h3>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Project</th>
                    <th>Task</th>
                    <th className="num" style={{ width: 90 }}>Hours</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((row, i) => (
                    <tr key={`${row.project_id}-${row.task_id ?? "none"}-${i}`}>
                      <td>{row.project_name}</td>
                      <td className="muted">{row.task_name ?? "—"}</td>
                      <td className="num">{formatHours(row.hours)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={2}>Total</td>
                    <td className="num">{formatHours(grandTotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
