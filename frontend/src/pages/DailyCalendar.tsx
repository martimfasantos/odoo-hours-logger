import { useMemo } from "react";
import { CalendarX2, Check, ChevronLeft, ChevronRight } from "lucide-react";
import type { OdooRef, ProposedEntry } from "../api/types";
import {
  addDays,
  decimalHour,
  formatDayHeading,
  formatHourLabel,
  formatHours,
  formatTime,
  formatWeekRange,
} from "../lib/dates";
import { colorForContract, UNASSIGNED_COLOR } from "../lib/colors";

interface RowState {
  contractId: number | null;
  approved: boolean;
  description: string;
}

interface DailyCalendarProps {
  proposals: ProposedEntry[];
  rows: Record<string, RowState>;
  contracts: OdooRef[];
  weekStartISO: string; // Monday of the week to show (YYYY-MM-DD)
  colors: Record<string, string>;
  onSetColor: (contractId: number, color: string) => void;
  onPrevWeek: () => void;
  onNextWeek: () => void;
}

const HOUR_PX = 48;
const MIN_BLOCK_PX = 22;
const DEFAULT_START = 8;
const DEFAULT_END = 19;

const rowKey = (p: ProposedEntry) => `${p.event.uid}|${p.event.start}`;

/** A proposal enriched with its resolved contract + display color + geometry. */
interface ResolvedEvent {
  proposal: ProposedEntry;
  pid: number | null;
  contractName: string;
  color: string;
  startHour: number; // decimal hour-of-day
  endHour: number; // decimal hour-of-day
  hours: number;
}

/** Layout slot assigned to a block within an overlap cluster. */
interface LaidOut extends ResolvedEvent {
  colIndex: number;
  clusterCols: number;
}

export default function DailyCalendar({
  proposals,
  rows,
  contracts,
  weekStartISO,
  colors,
  onSetColor,
  onPrevWeek,
  onNextWeek,
}: DailyCalendarProps) {
  const contractNameById = useMemo(() => {
    const m = new Map<number, string>();
    for (const c of contracts) m.set(c.id, c.name);
    return m;
  }, [contracts]);

  // The 7 day dates Mon..Sun.
  const dayDates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStartISO, i)),
    [weekStartISO],
  );

  // Resolve every proposal's contract, name, color and time geometry.
  const resolved = useMemo<ResolvedEvent[]>(() => {
    return proposals.map((p) => {
      const pid =
        rows[rowKey(p)]?.contractId ?? p.match.contract_id ?? null;
      let contractName = "Unassigned";
      if (pid != null) {
        contractName =
          contractNameById.get(pid) ??
          p.match.contract_name ??
          `Contract ${pid}`;
      }
      const startHour = decimalHour(p.event.start);
      const hours = p.event.hours;
      return {
        proposal: p,
        pid,
        contractName,
        color: colorForContract(pid, colors),
        startHour,
        endHour: startHour + hours,
        hours,
      };
    });
  }, [proposals, rows, colors, contractNameById]);

  // Group resolved events by their local date string.
  const byDate = useMemo(() => {
    const m = new Map<string, ResolvedEvent[]>();
    for (const ev of resolved) {
      const arr = m.get(ev.proposal.event.date) ?? [];
      arr.push(ev);
      m.set(ev.proposal.event.date, arr);
    }
    return m;
  }, [resolved]);

  // Grid hour bounds across the whole week (padded by 1h, clamped to [0,24]).
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
    const start = Math.max(0, Math.floor(minStart) - 1);
    const end = Math.min(24, Math.ceil(maxEnd) + 1);
    // Guard against degenerate ranges.
    if (end <= start) return { gridStartHour: DEFAULT_START, gridEndHour: DEFAULT_END };
    return { gridStartHour: start, gridEndHour: end };
  }, [resolved]);

  const totalHourSpan = gridEndHour - gridStartHour;
  const gridHeight = totalHourSpan * HOUR_PX;
  const hourMarks = useMemo(
    () =>
      Array.from({ length: totalHourSpan + 1 }, (_, i) => gridStartHour + i),
    [gridStartHour, totalHourSpan],
  );

  // Per-day totals + week total.
  const dayTotals = useMemo(() => {
    return dayDates.map((d) =>
      (byDate.get(d) ?? []).reduce((s, ev) => s + ev.hours, 0),
    );
  }, [dayDates, byDate]);
  const weekTotal = useMemo(
    () => dayTotals.reduce((s, h) => s + h, 0),
    [dayTotals],
  );

  // Distinct contracts present in the week (for the legend).
  const legend = useMemo(() => {
    const seen = new Map<string, { pid: number | null; name: string }>();
    for (const ev of resolved) {
      const k = ev.pid == null ? "unassigned" : String(ev.pid);
      if (!seen.has(k)) seen.set(k, { pid: ev.pid, name: ev.contractName });
    }
    // Real contracts first (alphabetical), then Unassigned last.
    return [...seen.values()].sort((a, b) => {
      if (a.pid == null) return 1;
      if (b.pid == null) return -1;
      return a.name.localeCompare(b.name);
    });
  }, [resolved]);

  if (resolved.length === 0) {
    return (
      <div className="card">
        <div className="empty">
          <CalendarX2 size={40} aria-hidden="true" />
          <p>Refresh from calendar to see the week.</p>
        </div>
      </div>
    );
  }

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
        <span className="cal-week-total num" aria-label={`Week total ${formatHours(weekTotal)}`}>
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

                {/* Event blocks */}
                {laidOut.map((ev) => {
                  const top = (ev.startHour - gridStartHour) * HOUR_PX;
                  const height = Math.max(ev.hours * HOUR_PX, MIN_BLOCK_PX);
                  const widthPct = 100 / ev.clusterCols;
                  const isLogged = ev.proposal.already_logged;
                  const fullText = `${formatTime(ev.proposal.event.start)} ${ev.proposal.event.title} — ${formatHours(ev.hours)} (${ev.contractName})${isLogged ? " — logged" : ""}`;
                  return (
                    <div
                      key={rowKey(ev.proposal)}
                      className={`cal-event${isLogged ? " cal-event--logged" : ""}`}
                      title={fullText}
                      aria-label={fullText}
                      style={{
                        top,
                        height,
                        left: `calc(${ev.colIndex * widthPct}% + 2px)`,
                        width: `calc(${widthPct}% - 4px)`,
                        backgroundColor: ev.color,
                      }}
                    >
                      <span className="cal-event-time num">
                        {formatTime(ev.proposal.event.start)}
                      </span>
                      <span className="cal-event-title">
                        {ev.proposal.event.title}
                      </span>
                      {isLogged && (
                        <span className="cal-event-logged-icon" aria-hidden="true">
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

      {/* Color legend */}
      <div className="cal-legend" aria-label="Contract colors">
        {legend.map((item) => {
          if (item.pid == null) {
            return (
              <span className="cal-legend-item" key="unassigned">
                <span
                  className="cal-swatch"
                  style={{ backgroundColor: UNASSIGNED_COLOR }}
                  aria-hidden="true"
                />
                <span>Unassigned</span>
              </span>
            );
          }
          const pid = item.pid;
          const value = colorForContract(pid, colors);
          const inputId = `cal-color-${pid}`;
          return (
            <label className="cal-legend-item" key={pid} htmlFor={inputId}>
              <input
                id={inputId}
                type="color"
                className="cal-swatch cal-swatch--input"
                aria-label={`Color for ${item.name}`}
                value={value}
                onChange={(e) => onSetColor(pid, e.target.value)}
              />
              <span>{item.name}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Greedy side-by-side overlap layout for a single day.
 *
 * Events are sorted by start time. Each event is placed in the first column
 * whose previously-placed event ends at or before this event's start (so it
 * no longer overlaps). We track contiguous "clusters" of mutually-overlapping
 * events: a cluster ends as soon as we reach an event that starts at or after
 * the latest end seen so far. Every event in a cluster is told how many
 * columns that cluster spans, so blocks divide the width evenly and never
 * fully cover one another.
 */
function layoutDay(events: ResolvedEvent[]): LaidOut[] {
  const sorted = [...events].sort((a, b) => {
    if (a.startHour !== b.startHour) return a.startHour - b.startHour;
    return b.endHour - a.endHour;
  });

  const result: LaidOut[] = [];
  let cluster: LaidOut[] = [];
  let clusterEnd = -Infinity;
  // Per-column end time within the active cluster.
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
    // A new cluster starts when this event begins at/after everything so far.
    if (ev.startHour >= clusterEnd && cluster.length > 0) {
      flush();
    }
    // Find the first free column (whose last event ends <= this start).
    let colIndex = columnEnds.findIndex((end) => end <= ev.startHour);
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
