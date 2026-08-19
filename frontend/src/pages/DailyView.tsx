import { useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, UploadCloud, AlertTriangle, Check, X, CalendarX2, List, CalendarDays, PlugZap, Trash2, MoreVertical, Eye, EyeOff } from "lucide-react";
import { api } from "../api/client";
import type {
  OdooRef,
  ProposedEntry,
  PushEntry,
  PushResult,
  TestConnectionResult,
} from "../api/types";
import { useToast } from "../components/Toast";
import Button from "../components/Button";
import Badge from "../components/Badge";
import Spinner from "../components/Spinner";
import VpnModal from "../components/VpnModal";
import SessionExpiredModal from "../components/SessionExpiredModal";
import DailyCalendar from "./DailyCalendar";
import { colorForContract, UNASSIGNED_COLOR } from "../lib/colors";
import { isUnreachableError, isSessionExpiredError } from "../lib/errors";
import { useLogHours, type RowState } from "../state/LogHoursContext";
import {
  startOfWeek,
  addDays,
  formatTime,
  formatDayHeading,
  formatHours,
  formatWeekRange,
} from "../lib/dates";

const rowKey = (p: ProposedEntry) => `${p.event.uid}|${p.event.start}`;

/**
 * Recompute the `overlaps` flag for a set of proposals using the same
 * interval-intersection rule as the backend (two events overlap when
 * `a.start < b.end && b.start < a.end`). Called after a proposal is removed so
 * the remaining rows' "Overlap" badges reflect the new set: deleting the event
 * that linked two others clears their badges, while events that still overlap
 * something keep theirs. Returns the same array reference-wise for unchanged
 * rows so React can skip re-rendering them.
 */
export function recomputeOverlaps(entries: ProposedEntry[]): ProposedEntry[] {
  const spans = entries.map((p) => ({
    start: new Date(p.event.start).getTime(),
    end: new Date(p.event.end).getTime(),
  }));
  return entries.map((p, i) => {
    const a = spans[i];
    const overlaps = spans.some(
      (b, j) => j !== i && b.start < a.end && a.start < b.end,
    );
    return p.overlaps === overlaps ? p : { ...p, overlaps };
  });
}

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

  // Persistent state lives above the router so it survives tab switches.
  const {
    fromDate,
    setFromDate,
    toDate,
    setToDate,
    view,
    setView,
    hideLogged,
    setHideLogged,
    proposals,
    setProposals,
    rows,
    setRows,
    results,
    setResults,
    calendarWeekStart,
    setCalendarWeekStart,
    hasFetched,
    setHasFetched,
  } = useLogHours();

  // Transient/derived state stays local: re-fetched cheaply on mount and never
  // needs to survive navigation.
  const [contracts, setContracts] = useState<OdooRef[]>([]);
  const [colors, setColors] = useState<Record<string, string>>({});

  const [loading, setLoading] = useState(false);
  const [pushing, setPushing] = useState(false);

  // Connection test + VPN-unreachable modal.
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestConnectionResult | null>(
    null,
  );
  const [vpnOpen, setVpnOpen] = useState(false);
  const [sessionExpiredOpen, setSessionExpiredOpen] = useState(false);

  // Which row's action menu is currently open (only one at a time).
  const [openMenuKey, setOpenMenuKey] = useState<string | null>(null);

  // Close the open menu on outside click or Escape.
  useEffect(() => {
    if (openMenuKey === null) return;

    function handleMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      const menu = document.querySelector(`[data-row-menu="${openMenuKey}"]`);
      const trigger = document.querySelector(`[data-row-trigger="${openMenuKey}"]`);
      if (
        menu && !menu.contains(target) &&
        trigger && !trigger.contains(target)
      ) {
        setOpenMenuKey(null);
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenMenuKey(null);
    }

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openMenuKey]);

  /** Load contracts for the dropdowns; open the VPN modal if Odoo is down. */
  function loadContracts() {
    return api
      .contracts()
      .then(setContracts)
      .catch((e) => {
        if (isUnreachableError(e)) setVpnOpen(true);
        else if (isSessionExpiredError(e)) setSessionExpiredOpen(true);
        toast.error(`Failed to load contracts: ${String(e)}`);
      });
  }

  // Load contracts once for the dropdowns.
  useEffect(() => {
    loadContracts();
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

  /** Run the backend connection test; surface VPN modal if Odoo is unreachable. */
  async function runTest() {
    setTesting(true);
    try {
      const data = await api.testConnection();
      setTestResult(data);
      if (data.odoo_unreachable) {
        setVpnOpen(true);
      }
      return data;
    } catch (e) {
      const failed: TestConnectionResult = {
        odoo: false,
        calendar: false,
        odoo_unreachable: isUnreachableError(e),
        errors: { odoo: String(e), calendar: String(e) },
      };
      setTestResult(failed);
      if (failed.odoo_unreachable) setVpnOpen(true);
      else toast.error(`Connection test failed: ${String(e)}`);
      return failed;
    } finally {
      setTesting(false);
    }
  }

  /**
   * VPN modal "Retry": re-run the connection test and re-fetch contracts.
   * Close the modal if Odoo is now reachable.
   */
  async function handleRetry() {
    const data = await runTest();
    if (!data.odoo_unreachable && data.odoo) {
      setVpnOpen(false);
      await loadContracts();
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
      if (isUnreachableError(e)) setVpnOpen(true);
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

  /**
   * Remove a proposal and persist the removal so it stays hidden across
   * calendar re-syncs. Restorable from Settings → Removed events.
   */
  async function removeProposal(p: ProposedEntry) {
    const k = rowKey(p);
    // Recompute overlaps on the remaining events so neighbours' "Overlap"
    // badges update (and clear when nothing overlaps them any more).
    setProposals((prev) =>
      recomputeOverlaps(prev.filter((x) => rowKey(x) !== k)),
    );
    setRows((prev) => {
      const next = { ...prev };
      delete next[k];
      return next;
    });
    try {
      await api.excludeEntry({
        uid: p.event.uid,
        start: p.event.start,
        end: p.event.end,
        title: p.event.title,
        date: p.event.date,
      });
    } catch (e) {
      // Persist failed — put the row back so the removal isn't silently lost.
      setProposals((prev) => recomputeOverlaps([...prev, p]));
      toast.error(`Failed to remove entry: ${String(e)}`);
    }
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
      if (resp.results.some((r) => !r.success && isSessionExpiredError(r.error))) {
        setSessionExpiredOpen(true);
      }
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

  // Per-contract hours across the loaded range, computed client-side from the
  // current proposals + row selections. Updates as contracts are reassigned.
  const contractSummary = useMemo(() => {
    const contractNames = new Map<number, string>();
    for (const c of contracts) contractNames.set(c.id, c.name);

    const totals = new Map<
      string,
      { cid: number | null; name: string; hours: number }
    >();
    for (const p of proposals) {
      const cid = rows[rowKey(p)]?.contractId ?? p.match.contract_id ?? null;
      const key = cid == null ? "unassigned" : String(cid);
      const name =
        cid == null
          ? "Unassigned"
          : contractNames.get(cid) ?? p.match.contract_name ?? `Contract ${cid}`;
      const existing = totals.get(key);
      if (existing) existing.hours += p.event.hours;
      else totals.set(key, { cid, name, hours: p.event.hours });
    }

    const rowsOut = [...totals.values()].sort((a, b) => b.hours - a.hours);
    const total = rowsOut.reduce((s, r) => s + r.hours, 0);
    const max = rowsOut.reduce((m, r) => Math.max(m, r.hours), 0);
    return { rows: rowsOut, total, max };
  }, [proposals, rows, contracts]);

  const approvedCount = approvedEntries.length;

  // Range summary for the KPI stat tiles: total hours, how many entries are
  // approved vs. still to log, hours already in Odoo, and distinct contracts.
  const kpis = useMemo(() => {
    const loggedList = proposals.filter((p) => p.already_logged);
    const approvableCount = proposals.length - loggedList.length;
    const loggedHours = loggedList.reduce((s, p) => s + p.event.hours, 0);
    const contractIds = new Set<number>();
    for (const p of proposals) {
      const cid = rows[rowKey(p)]?.contractId ?? p.match.contract_id ?? null;
      if (cid != null) contractIds.add(cid);
    }
    return {
      total: contractSummary.total,
      approvableCount,
      loggedHours,
      loggedCount: loggedList.length,
      contractCount: contractIds.size,
    };
  }, [proposals, rows, contractSummary.total]);

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <h1 className="page__title">Log Hours</h1>
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
            <Button
              variant="secondary"
              onClick={runTest}
              loading={testing}
              disabled={testing}
            >
              {!testing && <PlugZap size={16} aria-hidden="true" />}
              Test connection
            </Button>
            {testResult && (
              <div
                className="conn-row__status"
                style={{ gap: "var(--space-3)", flexWrap: "wrap" }}
                aria-live="polite"
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-1)" }}>
                  Odoo
                  <Badge variant={testResult.odoo ? "active" : "inactive"}>
                    {testResult.odoo ? (
                      <Check size={12} aria-hidden="true" />
                    ) : (
                      <X size={12} aria-hidden="true" />
                    )}
                    {testResult.odoo ? "OK" : "Down"}
                  </Badge>
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-1)" }}>
                  Google Calendar
                  <Badge variant={testResult.calendar ? "active" : "inactive"}>
                    {testResult.calendar ? (
                      <Check size={12} aria-hidden="true" />
                    ) : (
                      <X size={12} aria-hidden="true" />
                    )}
                    {testResult.calendar ? "OK" : "Down"}
                  </Badge>
                </span>
                {(testResult.errors.odoo || testResult.errors.calendar) && (
                  <p className="conn-error" style={{ margin: 0, flexBasis: "100%" }}>
                    {testResult.errors.odoo || testResult.errors.calendar}
                  </p>
                )}
              </div>
            )}
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
        <section className="kpis" aria-label="Range summary">
          <div className="kpi">
            <span className="kpi__label">Range total</span>
            <span className="kpi__value num">{formatHours(kpis.total)}</span>
            <span className="kpi__sub">
              {kpis.contractCount} contract{kpis.contractCount === 1 ? "" : "s"}
            </span>
          </div>
          <div className="kpi">
            <span className="kpi__label">Approved to push</span>
            <span className="kpi__value num">{approvedCount}</span>
            <span className="kpi__sub">of {kpis.approvableCount} to log</span>
          </div>
          <div className="kpi">
            <span className="kpi__label">Already logged</span>
            <span className="kpi__value num">{formatHours(kpis.loggedHours)}</span>
            <span className="kpi__sub">{kpis.loggedCount} in Odoo</span>
          </div>
        </section>
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

      {!loading && view === "list" && proposals.length > 0 && (
        <section className="card" aria-label="Hours per contract">
          <div className="card__head">
            <h3>Hours per contract</h3>
            <span className="day-group__meta">for the loaded range</span>
          </div>
          <div className="card__pad contract-summary">
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Contract</th>
                    <th className="num" style={{ width: 96 }}>
                      Hours
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {contractSummary.rows.map((r) => (
                    <tr key={r.cid == null ? "unassigned" : r.cid}>
                      <td>
                        <span className="contract-cell">
                          <span
                            className="contract-bar-swatch"
                            style={{ background: colorForContract(r.cid, colors) }}
                            aria-hidden="true"
                          />
                          {r.name}
                        </span>
                      </td>
                      <td className="num">{formatHours(r.hours)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total</td>
                    <td className="num">{formatHours(contractSummary.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="bars">
              {contractSummary.rows.map((r) => {
                const pct =
                  contractSummary.max > 0
                    ? (r.hours / contractSummary.max) * 100
                    : 0;
                return (
                  <div
                    className="bar-row"
                    key={r.cid == null ? "unassigned" : r.cid}
                  >
                    <span className="bar-row__label" title={r.name}>
                      {r.name}
                    </span>
                    <span className="bar-row__track">
                      <span
                        className="bar-row__fill"
                        style={{
                          width: `${pct}%`,
                          background: colorForContract(r.cid, colors),
                        }}
                      />
                      <span
                        className="bar-row__value num"
                        style={{ left: `calc(${pct}% + ${pct > 80 ? "-48px" : "8px"})` }}
                      >
                        {formatHours(r.hours)}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {!loading &&
        view === "list" &&
        proposals.length > 0 &&
        proposals.some((p) => p.already_logged) && (
          <div className="select-all-bar">
            <Button
              variant="secondary"
              size="sm"
              aria-pressed={hideLogged}
              onClick={() => setHideLogged((v) => !v)}
            >
              {hideLogged ? (
                <Eye size={16} aria-hidden="true" />
              ) : (
                <EyeOff size={16} aria-hidden="true" />
              )}
              {hideLogged ? "Show logged" : "Hide logged"}
            </Button>
          </div>
        )}

      {!loading &&
        view === "list" &&
        byWeek.map(({ weekStart, byDay, entries }) => {
          // "Hide logged" skips weeks whose entries are all already-logged.
          if (hideLogged && !entries.some((p) => !p.already_logged)) return null;
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
                // Rows actually rendered (logged hidden when the toggle is on);
                // totals/summary above stay computed from the full set.
                const visibleDay = hideLogged
                  ? dayEntries.filter((p) => !p.already_logged)
                  : dayEntries;
                if (visibleDay.length === 0) return null;

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
                            <th style={{ width: 36 }} aria-label="Row actions" />
                          </tr>
                        </thead>
                        <tbody>
                          {visibleDay.map((p) => {
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
                                  <div className="contract-pick">
                                    {(() => {
                                      const cid =
                                        rows[key]?.contractId ??
                                        p.match.contract_id ??
                                        null;
                                      if (cid == null) {
                                        return (
                                          <span
                                            className="contract-dot contract-dot--empty"
                                            style={{
                                              background: UNASSIGNED_COLOR,
                                            }}
                                            aria-hidden="true"
                                          />
                                        );
                                      }
                                      return (
                                        <input
                                          type="color"
                                          className="contract-dot contract-dot--input"
                                          aria-label={`Color for contract of ${p.event.title}`}
                                          title="Contract color"
                                          value={colorForContract(cid, colors)}
                                          onChange={(e) =>
                                            handleSetColor(cid, e.target.value)
                                          }
                                        />
                                      );
                                    })()}
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
                                  </div>
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
                                <td className="row-actions-cell">
                                  <div className="row-actions-wrap">
                                    <button
                                      type="button"
                                      className="row-menu-trigger"
                                      aria-haspopup="menu"
                                      aria-expanded={openMenuKey === key}
                                      aria-label={`Row actions for "${p.event.title}"`}
                                      data-row-trigger={key}
                                      onClick={() =>
                                        setOpenMenuKey((prev) =>
                                          prev === key ? null : key,
                                        )
                                      }
                                    >
                                      <MoreVertical size={14} aria-hidden="true" />
                                    </button>
                                    {openMenuKey === key && (
                                      <div
                                        className="row-menu"
                                        role="menu"
                                        data-row-menu={key}
                                      >
                                        <button
                                          type="button"
                                          className="row-menu__item"
                                          role="menuitem"
                                          onClick={() => {
                                            removeProposal(p);
                                            setOpenMenuKey(null);
                                          }}
                                        >
                                          <Trash2 size={13} aria-hidden="true" />
                                          Remove from import
                                        </button>
                                      </div>
                                    )}
                                  </div>
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

      <VpnModal
        open={vpnOpen}
        retrying={testing}
        onRetry={handleRetry}
        onClose={() => setVpnOpen(false)}
      />

      <SessionExpiredModal
        open={sessionExpiredOpen}
        onClose={() => setSessionExpiredOpen(false)}
      />
    </div>
  );
}
