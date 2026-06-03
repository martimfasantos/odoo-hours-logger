import { useEffect, useMemo, useState } from "react";
import { RefreshCw, UploadCloud, AlertTriangle, Check, X, CalendarX2 } from "lucide-react";
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
import {
  startOfWeek,
  addDays,
  formatTime,
  formatDayHeading,
  formatHours,
} from "../lib/dates";

interface RowState {
  projectId: number | null;
  taskId: number | null;
  approved: boolean;
}

const rowKey = (p: ProposedEntry) => `${p.event.uid}|${p.event.start}`;

export default function DailyView() {
  const toast = useToast();

  const initialStart = useMemo(() => startOfWeek(new Date()), []);
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(addDays(initialStart, 6));

  const [proposals, setProposals] = useState<ProposedEntry[]>([]);
  const [projects, setProjects] = useState<OdooRef[]>([]);
  const [tasksByProject, setTasksByProject] = useState<
    Record<number, OdooRef[]>
  >({});
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [results, setResults] = useState<Record<string, PushResult>>({});

  const [loading, setLoading] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);

  // Load projects once for the dropdowns.
  useEffect(() => {
    api
      .projects()
      .then(setProjects)
      .catch((e) => toast.error(`Failed to load projects: ${String(e)}`));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadTasks(projectId: number) {
    if (tasksByProject[projectId]) return;
    try {
      const t = await api.tasks(projectId);
      setTasksByProject((prev) => ({ ...prev, [projectId]: t }));
    } catch (e) {
      toast.error(`Failed to load tasks: ${String(e)}`);
    }
  }

  async function refresh() {
    setLoading(true);
    setResults({});
    try {
      const data = await api.events(start, end);
      setProposals(data);
      setHasFetched(true);
      const init: Record<string, RowState> = {};
      const projectIds = new Set<number>();
      for (const p of data) {
        init[rowKey(p)] = {
          projectId: p.match.project_id,
          taskId: p.match.task_id,
          approved: false,
        };
        if (p.match.project_id) projectIds.add(p.match.project_id);
      }
      setRows(init);
      for (const id of projectIds) loadTasks(id);
    } catch (e) {
      toast.error(`Failed to fetch calendar: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  function setRow(key: string, patch: Partial<RowState>) {
    setRows((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }

  function onProjectChange(p: ProposedEntry, value: string) {
    const projectId = value ? Number(value) : null;
    setRow(rowKey(p), { projectId, taskId: null });
    if (projectId) loadTasks(projectId);
  }

  const approvedEntries: PushEntry[] = useMemo(
    () =>
      proposals
        .filter((p) => {
          const r = rows[rowKey(p)];
          return r?.approved && r?.projectId && !p.already_logged;
        })
        .map((p) => {
          const r = rows[rowKey(p)]!;
          return {
            uid: p.event.uid,
            start: p.event.start,
            date: p.event.date,
            hours: p.event.hours,
            description: p.event.title,
            project_id: r.projectId!,
            task_id: r.taskId,
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

  // Group proposals by date, preserving sorted day order.
  const byDay = useMemo(() => {
    const map = new Map<string, ProposedEntry[]>();
    for (const p of proposals) {
      const arr = map.get(p.event.date) ?? [];
      arr.push(p);
      map.set(p.event.date, arr);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => a.event.start.localeCompare(b.event.start));
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [proposals]);

  const approvedCount = approvedEntries.length;

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <h1 className="page__title">Daily hours</h1>
          <p className="page__subtitle">
            Review calendar events, map them to Odoo projects, and push approved
            entries.
          </p>
        </div>
      </header>

      <div className="card">
        <div className="card__pad">
          <div className="toolbar">
            <div className="field">
              <label className="field__label" htmlFor="daily-start">
                Start
              </label>
              <input
                id="daily-start"
                type="date"
                className="input"
                value={start}
                max={end}
                onChange={(e) => setStart(e.target.value)}
              />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="daily-end">
                End
              </label>
              <input
                id="daily-end"
                type="date"
                className="input"
                value={end}
                min={start}
                onChange={(e) => setEnd(e.target.value)}
              />
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

      {!loading && hasFetched && proposals.length === 0 && (
        <div className="card">
          <div className="empty">
            <CalendarX2 size={40} aria-hidden="true" />
            <p>No calendar events in this range.</p>
          </div>
        </div>
      )}

      {!loading && !hasFetched && (
        <div className="card">
          <div className="empty">
            <CalendarX2 size={40} aria-hidden="true" />
            <p>Pick a range and refresh from the calendar to see proposals.</p>
          </div>
        </div>
      )}

      {!loading &&
        byDay.map(([date, entries]) => {
          const dayTotal = entries.reduce((s, p) => s + p.event.hours, 0);
          return (
            <section className="card" key={date} aria-label={date}>
              <div className="day-group__head">
                <span className="day-group__date">
                  {formatDayHeading(date)}
                </span>
                <span className="day-group__meta">
                  {entries.length} event{entries.length === 1 ? "" : "s"}
                </span>
                <span className="day-group__total num">
                  {formatHours(dayTotal)}
                </span>
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
                      <th style={{ width: 200 }}>Project</th>
                      <th style={{ width: 200 }}>Task</th>
                      <th style={{ width: 150 }}>Status</th>
                      <th style={{ width: 90 }} className="text-right">
                        Approve
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((p) => {
                      const key = rowKey(p);
                      const r = rows[key];
                      const result = results[key];
                      const tasks = r?.projectId
                        ? (tasksByProject[r.projectId] ?? [])
                        : [];
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
                          <td className="num">{formatHours(p.event.hours)}</td>
                          <td>
                            <select
                              className="select select--cell"
                              aria-label={`Project for ${p.event.title}`}
                              value={r?.projectId ?? ""}
                              disabled={p.already_logged}
                              onChange={(e) => onProjectChange(p, e.target.value)}
                            >
                              <option value="">— Select project —</option>
                              {projects.map((proj) => (
                                <option key={proj.id} value={proj.id}>
                                  {proj.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <select
                              className="select select--cell"
                              aria-label={`Task for ${p.event.title}`}
                              value={r?.taskId ?? ""}
                              disabled={p.already_logged || !r?.projectId}
                              onChange={(e) =>
                                setRow(key, {
                                  taskId: e.target.value
                                    ? Number(e.target.value)
                                    : null,
                                })
                              }
                            >
                              <option value="">— No task —</option>
                              {tasks.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.name}
                                </option>
                              ))}
                            </select>
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
                                  <AlertTriangle size={12} aria-hidden="true" />
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
            </section>
          );
        })}

      {!loading && proposals.length > 0 && (
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
