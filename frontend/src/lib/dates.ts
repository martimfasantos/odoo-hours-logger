/** Monday-based start of the week containing `d`, as a YYYY-MM-DD string. */
export function startOfWeek(d: Date): string {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // Monday = 0
  x.setDate(x.getDate() - day);
  return toISODate(x);
}

/** Add `n` days to a YYYY-MM-DD string, returning a YYYY-MM-DD string. */
export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** Local-time YYYY-MM-DD (avoids UTC off-by-one from toISOString). */
export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** "HH:MM" extracted from an ISO datetime string. */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "--:--";
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

/** "Mon, Jun 3" style heading from a YYYY-MM-DD string. */
export function formatDayHeading(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/** Format a number of hours compactly, e.g. 1.5 -> "1.5h", 2 -> "2h". */
export function formatHours(h: number): string {
  return `${Number(h.toFixed(2))}h`;
}
