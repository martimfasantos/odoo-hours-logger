import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarX2,
  Check,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { api } from "../api/client";
import type { ContractOverview, OverviewBlock } from "../api/types";
import { useToast } from "../components/Toast";
import Spinner from "../components/Spinner";
import {
  addDays,
  addMonths,
  decimalHour,
  endOfMonth,
  formatDateRange,
  formatDayHeading,
  formatHourLabel,
  formatHours,
  formatTime,
  formatWeekRange,
  startOfMonth,
  startOfWeek,
  toISODate,
} from "../lib/dates";
import { colorForContract, UNASSIGNED_COLOR } from "../lib/colors";
import { useLogHours } from "../state/LogHoursContext";

const HOUR_PX = 48;
const MIN_BLOCK_PX = 22;
const DEFAULT_START = 8;
const DEFAULT_END = 19;

/** Today's local YYYY-MM-DD. */
function todayISO(): string {
  return toISODate(new Date());
}

/** Compute the [start, end] range for the month containing `monthAnchor` (1st of month).
 *  The current month is clamped so `end` never goes past today; past months use the full month. */
function monthRange(monthAnchor: string): { start: string; end: string } {
  const anchor = new Date(`${monthAnchor}T00:00:00`);
  const start = startOfMonth(anchor);
  const today = todayISO();
  const fullEnd = endOfMonth(anchor);
  const end = fullEnd > today ? today : fullEnd;
  return { start, end };
}

export default function Logged() {
  const toast = useToast();

  // Month anchor = 1st of the visible month. Persisted above the router so it
  // survives navigating away and back. Defaults to the current month.
  const { loggedMonthAnchor: monthAnchor, setLoggedMonthAnchor: setMonthAnchor } =
    useLogHours();
  const { start, end } = useMemo(() => monthRange(monthAnchor), [monthAnchor]);

  const [byContract, setByContract] = useState<ContractOverview[]>([]);
  const [blocks, setBlocks] = useState<OverviewBlock[]>([]);
  const [colors, setColors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  // Calendar shows one week at a time; default to the week containing the range end.
  const [calendarWeekStart, setCalendarWeekStart] = useState(() =>
    startOfWeek(new Date(`${monthRange(startOfMonth(new Date())).end}T00:00:00`)),
  );

  const reqId = useRef(0);

  // Load stored contract colors once (tolerate failure).
  useEffect(() => {
    api
      .getColors()
      .then(setColors)
      .catch(() => setColors({}));
  }, []);

  // Load overview on mount and whenever the range changes; reset the calendar
  // week to the one containing the range end.
  useEffect(() => {
    load(start, end);
    setCalendarWeekStart(startOfWeek(new Date(`${end}T00:00:00`)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, end]);

  async function load(s: string, e: string) {
    const myId = ++reqId.current;
    setLoading(true);
    try {
      const data = await api.overview(s, e);
      if (myId !== reqId.current) return;
      setByContract(data.by_contract);
      setBlocks(data.blocks);
    } catch (err) {
      if (myId !== reqId.current) return;
      toast.error(`Failed to load overview: ${String(err)}`);
    } finally {
      if (myId === reqId.current) setLoading(false);
    }
  }

  // Per-contract totals row.
  const totals = useMemo(() => {
    let logged = 0;
    let toLog = 0;
    for (const row of byContract) {
      logged += row.logged_hours;
      toLog += row.to_log_hours;
    }
    return { logged, toLog, total: logged + toLog };
  }, [byContract]);

  const rangeLabel = formatDateRange(start, end);

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <h1 className="page__title">Logged</h1>
          <p className="page__subtitle">
            Per-contract logged vs to-be-logged hours for a month, with a
            calendar of the time blocks.
          </p>
        </div>
      </header>

      {loading && (
        <div className="card">
          <div className="loading-block">
            <Spinner large />
            <span>Loading overview…</span>
          </div>
        </div>
      )}

      {!loading && blocks.length > 0 && (
        <OverviewCalendar
          blocks={blocks}
          weekStartISO={calendarWeekStart}
          colors={colors}
          onPrevWeek={() => setCalendarWeekStart((w) => addDays(w, -7))}
          onNextWeek={() => setCalendarWeekStart((w) => addDays(w, 7))}
        />
      )}

      {!loading && byContract.length === 0 && (
        <div className="card">
          <div className="empty">
            <CalendarX2 size={40} aria-hidden="true" />
            <p>No hours in this range yet.</p>
          </div>
        </div>
      )}

      {!loading && byContract.length > 0 && (
        <section className="card" aria-label="Hours by contract">
          <div className="card__head">
            <h3>By contract</h3>
            <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
              <div className="cal-nav" aria-label="Month range">
                <button
                  type="button"
                  className="cal-nav__btn"
                  aria-label="Previous month"
                  onClick={() => setMonthAnchor((m) => addMonths(m, -1))}
                >
                  <ChevronLeft size={18} aria-hidden="true" />
                </button>
                <span className="cal-nav__label">{rangeLabel}</span>
                <button
                  type="button"
                  className="cal-nav__btn"
                  aria-label="Next month"
                  onClick={() => setMonthAnchor((m) => addMonths(m, 1))}
                >
                  <ChevronRight size={18} aria-hidden="true" />
                </button>
              </div>
              <span className="num muted" style={{ fontSize: "0.88rem" }}>
                Total: {formatHours(totals.total)}
              </span>
            </div>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Contract</th>
                  <th className="num" style={{ width: 100 }}>
                    Logged
                  </th>
                  <th className="num" style={{ width: 100 }}>
                    Not logged
                  </th>
                  <th className="num" style={{ width: 100 }}>
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {byContract.map((row) => (
                  <tr key={row.contract_id}>
                    <td>
                      <span className="contract-cell">
                        <span
                          className="contract-swatch"
                          style={{
                            backgroundColor: colorForContract(
                              row.contract_id,
                              colors,
                            ),
                          }}
                          aria-hidden="true"
                        />
                        {row.contract_name}
                      </span>
                    </td>
                    <td className="num">{formatHours(row.logged_hours)}</td>
                    <td className="num">{formatHours(row.to_log_hours)}</td>
                    <td className="num">
                      {formatHours(row.logged_hours + row.to_log_hours)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td className="num">{formatHours(totals.logged)}</td>
                  <td className="num">{formatHours(totals.toLog)}</td>
                  <td className="num">{formatHours(totals.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

/* ============================================================
   Week time-grid calendar for overview blocks.
   Adapted from DailyCalendar; renders logged (solid) and
   to_log (outlined) blocks for the visible Mon–Sun week.
   ============================================================ */

interface ResolvedBlock {
  block: OverviewBlock;
  date: string; // local YYYY-MM-DD
  color: string;
  startHour: number; // decimal hour-of-day
  endHour: number; // decimal hour-of-day
  hours: number;
}

interface LaidOut extends ResolvedBlock {
  colIndex: number;
  clusterCols: number;
}

const blockKey = (b: OverviewBlock) =>
  `${b.contract_id ?? "none"}|${b.start}|${b.title}`;

function OverviewCalendar({
  blocks,
  weekStartISO,
  colors,
  onPrevWeek,
  onNextWeek,
}: {
  blocks: OverviewBlock[];
  weekStartISO: string;
  colors: Record<string, string>;
  onPrevWeek: () => void;
  onNextWeek: () => void;
}) {
  // The 7 day dates Mon..Sun.
  const dayDates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStartISO, i)),
    [weekStartISO],
  );
  const weekDates = useMemo(() => new Set(dayDates), [dayDates]);

  // Resolve color + geometry, keeping only blocks within the visible week.
  const resolved = useMemo<ResolvedBlock[]>(() => {
    const out: ResolvedBlock[] = [];
    for (const b of blocks) {
      const date = toISODate(new Date(b.start));
      if (!weekDates.has(date)) continue;
      const startHour = decimalHour(b.start);
      out.push({
        block: b,
        date,
        color: colorForContract(b.contract_id, colors),
        startHour,
        endHour: startHour + b.hours,
        hours: b.hours,
      });
    }
    return out;
  }, [blocks, weekDates, colors]);

  // Group by local date.
  const byDate = useMemo(() => {
    const m = new Map<string, ResolvedBlock[]>();
    for (const ev of resolved) {
      const arr = m.get(ev.date) ?? [];
      arr.push(ev);
      m.set(ev.date, arr);
    }
    return m;
  }, [resolved]);

  // Grid hour bounds across the visible week (padded by 1h, clamped to [0,24]).
  const { gridStartHour, gridEndHour } = useMemo(() => {
    if (resolved.length === 0) {
      return { gridStartHour: DEFAULT_START, gridEndHour: DEFAULT_END };
    }
    let minStart = 24;
    let maxEnd = 0;
    for (const ev of resolved) {
      minStart = Math.min(minStart, ev.startHour);
      maxEnd = Math.max(maxEnd, ev.endHour);
    }
    const s = Math.max(0, Math.floor(minStart) - 1);
    const e = Math.min(24, Math.ceil(maxEnd) + 1);
    if (e <= s) return { gridStartHour: DEFAULT_START, gridEndHour: DEFAULT_END };
    return { gridStartHour: s, gridEndHour: e };
  }, [resolved]);

  const totalHourSpan = gridEndHour - gridStartHour;
  const gridHeight = totalHourSpan * HOUR_PX;
  const hourMarks = useMemo(
    () =>
      Array.from({ length: totalHourSpan + 1 }, (_, i) => gridStartHour + i),
    [gridStartHour, totalHourSpan],
  );

  // Per-day totals + week total.
  const dayTotals = useMemo(
    () =>
      dayDates.map((d) =>
        (byDate.get(d) ?? []).reduce((s, ev) => s + ev.hours, 0),
      ),
    [dayDates, byDate],
  );
  const weekTotal = useMemo(
    () => dayTotals.reduce((s, h) => s + h, 0),
    [dayTotals],
  );

  const weekLabel = formatWeekRange(weekStartISO);

  return (
    <div className="card calendar">
      <div className="cal-header">
        <div className="cal-nav">
          <button
            type="button"
            className="cal-nav__btn"
            aria-label="Previous week"
            onClick={onPrevWeek}
          >
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
          <span className="cal-nav__label">{weekLabel}</span>
          <button
            type="button"
            className="cal-nav__btn"
            aria-label="Next week"
            onClick={onNextWeek}
          >
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        </div>
        <span
          className="cal-week-total num"
          aria-label={`Week total ${formatHours(weekTotal)}`}
        >
          Week total: {formatHours(weekTotal)}
        </span>
      </div>

      <div className="cal-grid">
        {/* Left gutter: corner + hour labels */}
        <div className="cal-gutter">
          <div className="cal-gutter-head" aria-hidden="true" />
          <div className="cal-gutter-body" style={{ height: gridHeight }}>
            {hourMarks.map((h) => (
              <div
                key={h}
                className="cal-gutter-label num"
                style={{ top: (h - gridStartHour) * HOUR_PX }}
              >
                {formatHourLabel(h)}
              </div>
            ))}
          </div>
        </div>

        {/* Seven day columns */}
        {dayDates.map((date, i) => {
          const events = byDate.get(date) ?? [];
          const laidOut = layoutDay(events);
          return (
            <div className="cal-day" key={date}>
              <div className="cal-day-head">
                <span className="cal-day-name">{formatDayHeading(date)}</span>
                <span className="cal-day-total num">
                  {formatHours(dayTotals[i])}
                </span>
              </div>
              <div className="cal-day-body" style={{ height: gridHeight }}>
                {/* Horizontal hour lines */}
                {hourMarks.map((h) => (
                  <div
                    key={h}
                    className="cal-hour-line"
                    style={{ top: (h - gridStartHour) * HOUR_PX }}
                    aria-hidden="true"
                  />
                ))}

                {/* Blocks */}
                {laidOut.map((ev) => {
                  const top = (ev.startHour - gridStartHour) * HOUR_PX;
                  const height = Math.max(ev.hours * HOUR_PX, MIN_BLOCK_PX);
                  const widthPct = 100 / ev.clusterCols;
                  const isLogged = ev.block.status === "logged";
                  const statusText = isLogged ? "logged" : "to be logged";
                  const fullText = `${formatTime(ev.block.start)} ${ev.block.title} — ${formatHours(ev.hours)} (${ev.block.contract_name}) — ${statusText}`;
                  // Logged: solid fill. To-log: hollow with colored border + text.
                  const style: React.CSSProperties = {
                    top,
                    height,
                    left: `calc(${ev.colIndex * widthPct}% + 2px)`,
                    width: `calc(${widthPct}% - 4px)`,
                  };
                  if (isLogged) {
                    style.backgroundColor = ev.color;
                  } else {
                    style.color = ev.color;
                  }
                  return (
                    <div
                      key={blockKey(ev.block)}
                      className={`cal-event${isLogged ? " cal-event--logged-overview" : " cal-event--tolog"}`}
                      title={fullText}
                      aria-label={fullText}
                      style={style}
                    >
                      <span className="cal-event-time num">
                        {formatTime(ev.block.start)}
                      </span>
                      <span className="cal-event-title">{ev.block.title}</span>
                      {isLogged && (
                        <span
                          className="cal-event-logged-icon cal-event-check"
                          aria-hidden="true"
                        >
                          <Check size={10} strokeWidth={3} />
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Status legend */}
      <div className="cal-status-legend" aria-label="Calendar block legend">
        <span className="cal-status-legend-item">
          <span
            className="cal-status-chip cal-status-chip--solid"
            aria-hidden="true"
          />
          <span>Solid — already logged in Odoo</span>
        </span>
        <span className="cal-status-legend-item">
          <span
            className="cal-status-chip cal-status-chip--tolog"
            aria-hidden="true"
          />
          <span>Outlined — not yet logged</span>
        </span>
        <span className="cal-status-legend-item">
          <span
            className="cal-swatch"
            style={{ backgroundColor: UNASSIGNED_COLOR }}
            aria-hidden="true"
          />
          <span>Color = contract</span>
        </span>
      </div>
    </div>
  );
}

/**
 * Greedy side-by-side overlap layout for a single day. Identical strategy to
 * DailyCalendar: events are sorted by start time, placed into the first column
 * that is free at their start, and each cluster of mutually-overlapping events
 * records how many columns it spans so blocks divide the width evenly.
 */
function layoutDay(events: ResolvedBlock[]): LaidOut[] {
  const sorted = [...events].sort((a, b) => {
    if (a.startHour !== b.startHour) return a.startHour - b.startHour;
    return b.endHour - a.endHour;
  });

  const result: LaidOut[] = [];
  let cluster: LaidOut[] = [];
  let clusterEnd = -Infinity;
  let columnEnds: number[] = [];

  const flush = () => {
    const cols = columnEnds.length || 1;
    for (const ev of cluster) ev.clusterCols = cols;
    result.push(...cluster);
    cluster = [];
    columnEnds = [];
    clusterEnd = -Infinity;
  };

  for (const ev of sorted) {
    if (ev.startHour >= clusterEnd && cluster.length > 0) {
      flush();
    }
    let colIndex = columnEnds.findIndex((e) => e <= ev.startHour);
    if (colIndex === -1) {
      colIndex = columnEnds.length;
      columnEnds.push(ev.endHour);
    } else {
      columnEnds[colIndex] = ev.endHour;
    }
    const laid: LaidOut = { ...ev, colIndex, clusterCols: 1 };
    cluster.push(laid);
    clusterEnd = Math.max(clusterEnd, ev.endHour);
  }
  if (cluster.length > 0) flush();

  return result;
}
