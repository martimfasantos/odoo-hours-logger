import { useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, UploadCloud, AlertTriangle, Check, X, CalendarX2, List, CalendarDays } from "lucide-react";
import { api } from "../api/client";
import type {
  OdooRef,
  ProposedEntry,
  PushEntry,
  PushResult,
} from "../api/types";
import { useToast } from "../components/Toast";
import Button from "../components/Button";
import Badge from "../components/Badge";
import Spinner from "../components/Spinner";
import DailyCalendar from "./DailyCalendar";
import {
  startOfWeek,
  addDays,
  formatTime,
  formatDayHeading,
  formatHours,
  formatWeekRange,
} from "../lib/dates";

interface RowState {
  contractId: number | null;
  approved: boolean;
  description: string;
}

const rowKey = (p: ProposedEntry) => `${p.event.uid}|${p.event.start}`;

/**
 * Approve-all summary for an arbitrary set of proposals. `approvable` excludes
 * already-logged rows (those cannot be approved). The group checkbox is checked
 * when every approvable row is approved, unchecked when none are, and
 * indeterminate otherwise.
 */
function approveSummary(
  entries: ProposedEntry[],
  rows: Record<string, RowState>,
) {
  const approvable = entries.filter((p) => !p.already_logged);
  const approvedCount = approvable.filter(
    (p) => !!rows[rowKey(p)]?.approved,
  ).length;
  const allApproved = approvable.length > 0 && approvedCount === approvable.length;
  const someApproved = approvedCount > 0 && !allApproved;
  return {
    approvable,
    approvedCount,
    allApproved,
    someApproved,
    hasApprovable: approvable.length > 0,
  };
}

/** Checkbox that supports the indeterminate visual state via a callback ref. */
function IndeterminateCheckbox({
  checked,
  indeterminate,
  disabled,
  onChange,
  className,
  "aria-label": ariaLabel,
}: {
  checked: boolean;
  indeterminate: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  className?: string;
  "aria-label": string;
}) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  return (
    <input
      ref={ref}
      type="checkbox"
      className={className}
      aria-label={ariaLabel}
      checked={checked}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
    />
  );
}

export default function DailyView() {
  const toast = useToast();

  const today = useMemo(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }, []);
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [calendarWeekStart, setCalendarWeekStart] = useState(() =>
    startOfWeek(new Date()),
  );

  const [proposals, setProposals] = useState<ProposedEntry[]>([]);
  const [contracts, setContracts] = useState<OdooRef[]>([]);
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [results, setResults] = useState<Record<string, PushResult>>({});
  const [colors, setColors] = useState<Record<string, string>>({});

  const [view, setView] = useState<"list" | "calendar">("list");
  const [loading, setLoading] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);

  // Load contracts once for the dropdowns.
  useEffect(() => {
    api
      .contracts()
      .then(setContracts)
      .catch((e) => toast.error(`Failed to load contracts: ${String(e)}`));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load stored contract colors once (tolerate failure).
  useEffect(() => {
    api
      .getColors()
      .then(setColors)
      .catch(() => setColors({}));
  }, []);

  // Optimistically recolor a contract, persisting via the API.
  async function handleSetColor(contractId: number, hex: string) {
    const key = String(contractId);
    const prev = colors[key];
    setColors((c) => ({ ...c, [key]: hex }));
    try {
      const updated = await api.setColor(contractId, hex);
      setColors(updated);
    } catch (e) {
      // Revert on failure.
      setColors((c) => {
        const next = { ...c };
        if (prev === undefined) delete next[key];
        else next[key] = prev;
        return next;
      });
      toast.error(`Failed to save color: ${String(e)}`);
    }
  }

  async function refresh() {
    const rangeStart = fromDate;
    const rangeEnd = toDate;
    if (rangeStart > rangeEnd) {
      toast.error("\"From\" must be on or before \"To\".");
      return;
    }
    setLoading(true);
    setResults({});
    try {
      const data = await api.events(rangeStart, rangeEnd);
      setProposals(data);
      setHasFetched(true);
      setCalendarWeekStart(startOfWeek(new Date(`${fromDate}T00:00:00`)));
      const init: Record<string, RowState> = {};
      for (const p of data) {
        init[rowKey(p)] = {
          contractId: p.match.contract_id,
          approved: !p.already_logged,
          description: p.event.title,
        };
      }
      setRows(init);
    } catch (e) {
      toast.error(`Failed to fetch calendar: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  /** Immutably set `approved` for every approvable row in `entries`. */
  function setApprovedForAll(entries: ProposedEntry[], checked: boolean) {
    setRows((prev) => {
      const next = { ...prev };
      for (const p of entries) {
        if (p.already_logged) continue;
        const k = rowKey(p);
        next[k] = { ...next[k], approved: checked };
      }
      return next;
    });
  }

  function setRow(key: string, patch: Partial<RowState>) {
    setRows((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }

  function onContractChange(p: ProposedEntry, value: string) {
    const contractId = value ? Number(value) : null;
    setRow(rowKey(p), { contractId });
  }

  const approvedEntries: PushEntry[] = useMemo(
    () =>
      proposals
        .filter((p) => {
          const r = rows[rowKey(p)];
          return r?.approved && r?.contractId && !p.already_logged;
        })
        .map((p) => {
          const r = rows[rowKey(p)]!;
          const desc = r.description.trim();
          return {
            uid: p.event.uid,
            start: p.event.start,
            end: p.event.end,
            description: desc || p.event.title,
            contract_id: r.contractId!,
          };
        }),
    [proposals, rows],
  );

  async function pushApproved() {
    if (approvedEntries.length === 0) return;
    setPushing(true);
    try {
      const resp = await api.push(approvedEntries);
      const map: Record<string, PushResult> = {};
      let ok = 0;
      let failed = 0;
      for (const r of resp.results) {
        map[`${r.uid}|${r.start}`] = r;
        if (r.success) ok += 1;
        else failed += 1;
      }
      setResults(map);
      if (failed === 0) {
        toast.success(`${ok} logged to Odoo`);
      } else if (ok === 0) {
        toast.error(`${failed} failed to log`);
      } else {
        toast.info(`${ok} logged, ${failed} failed`);
      }
      // Re-run refresh so newly logged rows flip to "Logged".
      await refresh();
    } catch (e) {
      toast.error(`Push failed: ${String(e)}`);
    } finally {
      setPushing(false);
    }
  }

  // Group proposals by week (Monday) then by day, both sorted ascending.
  const byWeek = useMemo(() => {
    const weeks = new Map<string, Map<string, ProposedEntry[]>>();
    for (const p of proposals) {
      const weekStart = startOfWeek(new Date(`${p.event.date}T00:00:00`));
      let days = weeks.get(weekStart);
      if (!days) {
        days = new Map<string, ProposedEntry[]>();
        weeks.set(weekStart, days);
      }
      const arr = days.get(p.event.date) ?? [];
      arr.push(p);
      days.set(p.event.date, arr);
    }
    return [...weeks.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([weekStart, days]) => {
        const entries: ProposedEntry[] = [];
        const byDay = [...days.entries()]
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([date, dayEntries]) => {
            dayEntries.sort((a, b) =>
              a.event.start.localeCompare(b.event.start),
            );
            entries.push(...dayEntries);
            return [date, dayEntries] as const;
          });
        return { weekStart, byDay, entries };
      });
  }, [proposals]);

  // Global approve-all covers every approvable row across all weeks.
  const globalSummary = useMemo(
    () => approveSummary(proposals, rows),
    [proposals, rows],
  );

  const approvedCount = approvedEntries.length;

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <h1 className="page__title">Daily hours</h1>
          <p className="page__subtitle">
            Review calendar events, map them to Odoo contracts, and push approved
            entries.
          </p>
        </div>
        <div
          className="view-toggle"
          role="group"
          aria-label="Switch between list and calendar views"
        >
          <button
            type="button"
            className={`view-toggle__btn${view === "list" ? " is-active" : ""}`}
            aria-pressed={view === "list"}
            onClick={() => setView("list")}
          >
            <List size={16} aria-hidden="true" />
            List
          </button>
          <button
            type="button"
            className={`view-toggle__btn${view === "calendar" ? " is-active" : ""}`}
            aria-pressed={view === "calendar"}
            onClick={() => setView("calendar")}
          >
            <CalendarDays size={16} aria-hidden="true" />
            Calendar
          </button>
        </div>
      </header>

      <div className="card">
        <div className="card__pad">
          <div className="toolbar">
            <div className="field">
              <label className="field__label" htmlFor="daily-from">
                From
              </label>
              <input
                id="daily-from"
                type="date"
                className="input"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
              <span className="field__hint">(inclusive)</span>
            </div>
            <div className="field">
              <label className="field__label" htmlFor="daily-to">
                To
              </label>
              <input
                id="daily-to"
                type="date"
                className="input"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
              />
              <span className="field__hint">(inclusive)</span>
            </div>
            <Button
              variant="primary"
              onClick={refresh}
              loading={loading}
              disabled={loading}
            >
              {!loading && <RefreshCw size={16} aria-hidden="true" />}
              Refresh from calendar
            </Button>
          </div>
        </div>
      </div>

      {loading && (
        <div className="card">
          <div className="loading-block">
            <Spinner large />
            <span>Fetching calendar events…</span>
          </div>
        </div>
      )}

      {!loading && hasFetched && proposals.length === 0 && view === "list" && (
        <div className="card">
          <div className="empty">
            <CalendarX2 size={40} aria-hidden="true" />
            <p>No calendar events in this range.</p>
          </div>
        </div>
      )}

      {!loading && !hasFetched && view === "list" && (
        <div className="card">
          <div className="empty">
            <CalendarX2 size={40} aria-hidden="true" />
            <p>Pick a range and refresh from the calendar to see proposals.</p>
          </div>
        </div>
      )}

      {!loading && view === "calendar" && (
        <DailyCalendar
          proposals={proposals}
          rows={rows}
          contracts={contracts}
          weekStartISO={calendarWeekStart}
          colors={colors}
          onSetColor={handleSetColor}
          onPrevWeek={() => setCalendarWeekStart((w) => addDays(w, -7))}
          onNextWeek={() => setCalendarWeekStart((w) => addDays(w, 7))}
        />
      )}

      {!loading && view === "list" && proposals.length > 0 && (
        <div className="select-all-bar">
          <label className="select-all-bar__control">
            <IndeterminateCheckbox
              className="checkbox"
              aria-label="Approve all imported"
              checked={globalSummary.allApproved}
              indeterminate={globalSummary.someApproved}
              disabled={!globalSummary.hasApprovable}
              onChange={(checked) => setApprovedForAll(proposals, checked)}
            />
            <span>Approve all imported</span>
          </label>
          <span className="select-all-bar__meta">
            {globalSummary.approvedCount} of {globalSummary.approvable.length}{" "}
            rows selected
          </span>
        </div>
      )}

      {!loading &&
        view === "list" &&
        byWeek.map(({ weekStart, byDay, entries }) => {
          const weekTotal = entries.reduce((s, p) => s + p.event.hours, 0);
          const weekLabel = formatWeekRange(weekStart);
          const weekSummary = approveSummary(entries, rows);

          return (
            <section
              className="week-group"
              key={weekStart}
              aria-label={`Week of ${weekLabel}`}
            >
              <div className="week-group__head">
                <span className="week-group__range">{weekLabel}</span>
                <span className="week-group__total num">
                  {formatHours(weekTotal)}
                </span>
                {weekSummary.hasApprovable && (
                  <label className="week-group__approve-all">
                    <IndeterminateCheckbox
                      className="checkbox"
                      aria-label={`Approve all for week of ${weekLabel}`}
                      checked={weekSummary.allApproved}
                      indeterminate={weekSummary.someApproved}
                      onChange={(checked) => setApprovedForAll(entries, checked)}
                    />
                    <span>Approve all</span>
                  </label>
                )}
              </div>

              {byDay.map(([date, dayEntries]) => {
                const dayTotal = dayEntries.reduce(
                  (s, p) => s + p.event.hours,
                  0,
                );
                const dayLabel = formatDayHeading(date);
                const daySummary = approveSummary(dayEntries, rows);

                return (
                  <div className="card" key={date} aria-label={date}>
                    <div className="day-group__head">
                      <span className="day-group__date">{dayLabel}</span>
                      <span className="day-group__meta">
                        {dayEntries.length} event
                        {dayEntries.length === 1 ? "" : "s"}
                      </span>
                      <span className="day-group__total num">
                        {formatHours(dayTotal)}
                      </span>
                      {daySummary.hasApprovable && (
                        <label className="day-group__approve-all">
                          <IndeterminateCheckbox
                            className="checkbox"
                            aria-label={`Approve all for ${dayLabel}`}
                            checked={daySummary.allApproved}
                            indeterminate={daySummary.someApproved}
                            onChange={(checked) =>
                              setApprovedForAll(dayEntries, checked)
                            }
                          />
                          <span>Approve all</span>
                        </label>
                      )}
                    </div>
                    <div className="table-wrap">
                      <table className="table">
                        <thead>
                          <tr>
                            <th style={{ width: 64 }}>Start</th>
                            <th>Event</th>
                            <th className="num" style={{ width: 72 }}>
                              Hours
                            </th>
                            <th style={{ width: 260 }}>Contract</th>
                            <th>Description</th>
                            <th style={{ width: 150 }}>Status</th>
                            <th style={{ width: 90 }} className="text-right">
                              Approve
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {dayEntries.map((p) => {
                            const key = rowKey(p);
                            const r = rows[key];
                            const result = results[key];
                            const rowClass = p.already_logged
                              ? "row--logged"
                              : result && !result.success
                                ? "row--failed"
                                : undefined;
                            return (
                              <tr key={key} className={rowClass}>
                                <td className="cell-time num">
                                  {formatTime(p.event.start)}
                                </td>
                                <td className="cell-title">{p.event.title}</td>
                                <td className="num">
                                  {formatHours(p.event.hours)}
                                </td>
                                <td>
                                  <select
                                    className="select select--cell"
                                    title={`Contract for ${p.event.title}`}
                                    aria-label={`Contract for ${p.event.title}`}
                                    value={r?.contractId ?? ""}
                                    disabled={p.already_logged}
                                    onChange={(e) =>
                                      onContractChange(p, e.target.value)
                                    }
                                  >
                                    <option value="">— Select contract —</option>
                                    {contracts.map((c) => (
                                      <option key={c.id} value={c.id}>
                                        {c.name}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                                <td className="cell-description">
                                  <input
                                    type="text"
                                    className="input input--cell"
                                    aria-label={`Description for ${p.event.title}`}
                                    value={r?.description ?? p.event.title}
                                    disabled={p.already_logged}
                                    onChange={(e) =>
                                      setRow(key, { description: e.target.value })
                                    }
                                  />
                                </td>
                                <td>
                                  <div
                                    style={{
                                      display: "flex",
                                      gap: 6,
                                      flexWrap: "wrap",
                                    }}
                                  >
                                    {p.already_logged ? (
                                      <Badge variant="logged">
                                        <Check size={12} aria-hidden="true" />
                                        Logged
                                      </Badge>
                                    ) : (
                                      <Badge variant="new">New</Badge>
                                    )}
                                    {p.overlaps && (
                                      <Badge variant="warning">
                                        <AlertTriangle
                                          size={12}
                                          aria-hidden="true"
                                        />
                                        Overlap
                                      </Badge>
                                    )}
                                    {result &&
                                      (result.success ? (
                                        <span className="result-icon result-icon--ok">
                                          <Check size={14} aria-hidden="true" />
                                          Pushed
                                        </span>
                                      ) : (
                                        <span
                                          className="result-icon result-icon--err"
                                          title={result.error ?? "Failed"}
                                        >
                                          <X size={14} aria-hidden="true" />
                                          Failed
                                        </span>
                                      ))}
                                  </div>
                                </td>
                                <td className="text-right">
                                  <input
                                    type="checkbox"
                                    className="checkbox"
                                    aria-label={`Approve ${p.event.title}`}
                                    checked={!p.already_logged && !!r?.approved}
                                    disabled={p.already_logged}
                                    onChange={(e) =>
                                      setRow(key, { approved: e.target.checked })
                                    }
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </section>
          );
        })}

      {!loading && view === "list" && proposals.length > 0 && (
        <div className="push-bar">
          <span className="push-bar__summary">
            <strong>{approvedCount}</strong> row
            {approvedCount === 1 ? "" : "s"} approved to push
          </span>
          <Button
            variant="primary"
            onClick={pushApproved}
            loading={pushing}
            disabled={pushing || approvedCount === 0}
          >
            {!pushing && <UploadCloud size={16} aria-hidden="true" />}
            Push approved to Odoo
          </Button>
        </div>
      )}
    </div>
  );
}
