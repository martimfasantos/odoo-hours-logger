import {
  createContext,
  useContext,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import type { ProposedEntry, PushResult } from "../api/types";
import { startOfWeek, startOfMonth } from "../lib/dates";

/** Per-row review state in the Log Hours table. */
export interface RowState {
  contractId: number | null;
  approved: boolean;
  description: string;
}

/** Today's local YYYY-MM-DD. */
function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Persistent state that must survive navigating away from and back to a page.
 * Lives ABOVE the router so it is never unmounted while the app is open.
 *
 * Log Hours: filters (from/to), view toggle, loaded proposals + row selections,
 * push results, the calendar week, and whether a fetch has happened yet.
 *
 * Logged: the visible month anchor.
 */
interface LogHoursContextValue {
  // Log Hours filters / view.
  fromDate: string;
  setFromDate: Dispatch<SetStateAction<string>>;
  toDate: string;
  setToDate: Dispatch<SetStateAction<string>>;
  view: "list" | "calendar";
  setView: Dispatch<SetStateAction<"list" | "calendar">>;
  hideLogged: boolean;
  setHideLogged: Dispatch<SetStateAction<boolean>>;

  // Log Hours loaded data + selections.
  proposals: ProposedEntry[];
  setProposals: Dispatch<SetStateAction<ProposedEntry[]>>;
  rows: Record<string, RowState>;
  setRows: Dispatch<SetStateAction<Record<string, RowState>>>;
  results: Record<string, PushResult>;
  setResults: Dispatch<SetStateAction<Record<string, PushResult>>>;
  calendarWeekStart: string;
  setCalendarWeekStart: Dispatch<SetStateAction<string>>;
  hasFetched: boolean;
  setHasFetched: Dispatch<SetStateAction<boolean>>;

  // Logged page month anchor (1st of the visible month).
  loggedMonthAnchor: string;
  setLoggedMonthAnchor: Dispatch<SetStateAction<string>>;
}

const LogHoursContext = createContext<LogHoursContextValue | null>(null);

export function LogHoursProvider({ children }: { children: ReactNode }) {
  const today = todayISO();

  // Log Hours filters / view.
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [view, setView] = useState<"list" | "calendar">("list");
  const [hideLogged, setHideLogged] = useState(false);

  // Log Hours loaded data + selections.
  const [proposals, setProposals] = useState<ProposedEntry[]>([]);
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [results, setResults] = useState<Record<string, PushResult>>({});
  const [calendarWeekStart, setCalendarWeekStart] = useState(() =>
    startOfWeek(new Date()),
  );
  const [hasFetched, setHasFetched] = useState(false);

  // Logged page month anchor.
  const [loggedMonthAnchor, setLoggedMonthAnchor] = useState(() =>
    startOfMonth(new Date()),
  );

  const value = useMemo<LogHoursContextValue>(
    () => ({
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
      loggedMonthAnchor,
      setLoggedMonthAnchor,
    }),
    [
      fromDate,
      toDate,
      view,
      hideLogged,
      proposals,
      rows,
      results,
      calendarWeekStart,
      hasFetched,
      loggedMonthAnchor,
    ],
  );

  return (
    <LogHoursContext.Provider value={value}>
      {children}
    </LogHoursContext.Provider>
  );
}

/** Access the cross-tab persistent Log Hours / Logged state. */
export function useLogHours(): LogHoursContextValue {
  const ctx = useContext(LogHoursContext);
  if (!ctx) {
    throw new Error("useLogHours must be used within a LogHoursProvider");
  }
  return ctx;
}
