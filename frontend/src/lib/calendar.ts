import { addDays, addMonths, endOfMonth, startOfMonth, startOfWeek, toISODate } from "./dates";

interface PresetRange {
  label: string;
  from: string;
  to: string;
}

/** ISO days shown for the month starting at `monthISO`, Monday-first. */
export function monthGrid(monthISO: string): string[] {
  const first = startOfWeek(new Date(`${monthISO}T00:00:00`));
  // Always six weeks so the popover keeps its height while paging months.
  return Array.from({ length: 42 }, (_, i) => addDays(first, i));
}

/** Quick ranges relative to `today`; weeks run Monday to Sunday. */
export function presetRanges(today: Date): PresetRange[] {
  const day = toISODate(today);
  const week = startOfWeek(today);
  const month = startOfMonth(today);
  return [
    { label: "Today", from: day, to: day },
    { label: "This week", from: week, to: addDays(week, 6) },
    { label: "Last week", from: addDays(week, -7), to: addDays(week, -1) },
    { label: "This month", from: month, to: endOfMonth(today) },
    { label: "Last month", from: addMonths(month, -1), to: addDays(month, -1) },
  ];
}

/** The two picked days as an inclusive [earlier, later] pair. */
export function orderRange(a: string, b: string): [string, string] {
  return a <= b ? [a, b] : [b, a];
}
