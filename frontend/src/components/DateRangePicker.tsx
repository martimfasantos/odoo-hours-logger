import { useEffect, useId, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { addMonths, formatDateRange, startOfMonth, toISODate } from "../lib/dates";
import { monthGrid, orderRange, presetRanges } from "../lib/calendar";

interface DateRangePickerProps {
  /** Inclusive YYYY-MM-DD bounds; the parent owns them. */
  from: string;
  to: string;
  /** Called once per committed range, never on the first day click. */
  onChange: (from: string, to: string) => void;
}

/** The open popover; `null` while closed. */
interface OpenState {
  /** YYYY-MM-DD first of the month on screen. */
  month: string;
  pendingStart: string | null;
  hover: string | null;
}

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

const asDate = (iso: string) => new Date(`${iso}T00:00:00`);

const DAY_LABEL = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});

export default function DateRangePicker({ from, to, onChange }: DateRangePickerProps) {
  const [open, setOpen] = useState<OpenState | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const id = useId();
  const isOpen = open !== null;

  useEffect(() => {
    if (!isOpen) return;
    function onMouseDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(null);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      setOpen(null);
      triggerRef.current?.focus();
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  function commit(a: string, b: string) {
    const [start, end] = orderRange(a, b);
    onChange(start, end);
    setOpen(null);
    triggerRef.current?.focus();
  }

  function pick(state: OpenState, day: string) {
    if (state.pendingStart === null) setOpen({ ...state, pendingStart: day });
    else commit(state.pendingStart, day);
  }

  function preview(state: OpenState, day: string | null) {
    if (state.pendingStart !== null) setOpen({ ...state, hover: day });
  }

  const [lo, hi] =
    open?.pendingStart != null
      ? orderRange(open.pendingStart, open.hover ?? open.pendingStart)
      : [from, to];
  const today = toISODate(new Date());

  return (
    <div className="drp" ref={rootRef}>
      <span className="sr-only" id={`${id}-label`}>
        From – To
      </span>
      <button
        ref={triggerRef}
        id={`${id}-trigger`}
        type="button"
        className="input drp__trigger"
        aria-labelledby={`${id}-label ${id}-trigger`}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() =>
          setOpen(
            isOpen
              ? null
              : { month: startOfMonth(asDate(from)), pendingStart: null, hover: null },
          )
        }
      >
        <CalendarDays size={16} aria-hidden="true" />
        {formatDateRange(from, to)}
      </button>
      {open && (
        <div className="drp__pop" role="dialog" aria-label="Choose date range">
          <div className="drp__presets">
            {presetRanges(new Date()).map((p) => (
              <button
                key={p.label}
                type="button"
                className="drp__preset"
                onClick={() => commit(p.from, p.to)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div>
            <div className="drp__head">
              <button
                type="button"
                className="drp__nav"
                aria-label="Previous month"
                onClick={() => setOpen({ ...open, month: addMonths(open.month, -1) })}
              >
                <ChevronLeft size={16} aria-hidden="true" />
              </button>
              <span className="drp__month" aria-live="polite">
                {asDate(open.month).toLocaleDateString(undefined, {
                  month: "long",
                  year: "numeric",
                })}
              </span>
              <button
                type="button"
                className="drp__nav"
                aria-label="Next month"
                onClick={() => setOpen({ ...open, month: addMonths(open.month, 1) })}
              >
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            </div>
            <div className="drp__grid" onMouseLeave={() => preview(open, null)}>
              {WEEKDAYS.map((w) => (
                <span key={w} className="drp__weekday" aria-hidden="true">
                  {w}
                </span>
              ))}
              {monthGrid(open.month).map((day) => {
                const inRange = lo <= day && day <= hi;
                const classes = [
                  "drp__day",
                  day.slice(0, 7) !== open.month.slice(0, 7) && "is-outside",
                  day === today && "is-today",
                  inRange && "is-in-range",
                  day === lo && "is-start",
                  day === hi && "is-end",
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <button
                    key={day}
                    type="button"
                    className={classes}
                    aria-label={DAY_LABEL.format(asDate(day))}
                    aria-pressed={inRange}
                    onClick={() => pick(open, day)}
                    onMouseEnter={() => preview(open, day)}
                    onFocus={() => preview(open, day)}
                  >
                    <span className="drp__num">{Number(day.slice(8))}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
