import { describe, it, expect } from "vitest";
import {
  startOfWeek,
  addDays,
  toISODate,
  formatTime,
  formatDayHeading,
  formatHours,
  formatHourLabel,
  formatWeekRange,
  startOfMonth,
  endOfMonth,
  addMonths,
  formatDateRange,
  decimalHour,
} from "./dates";

describe("toISODate", () => {
  it("formats a date as YYYY-MM-DD", () => {
    expect(toISODate(new Date(2026, 5, 1))).toBe("2026-06-01");
  });

  it("pads single-digit months and days", () => {
    expect(toISODate(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("startOfWeek", () => {
  it("returns the Monday of a week when given a Thursday", () => {
    // 2026-06-04 is a Thursday
    const result = startOfWeek(new Date("2026-06-04T00:00:00"));
    expect(result).toBe("2026-06-01");
  });

  it("returns the same day when given a Monday", () => {
    // 2026-06-01 is a Monday
    expect(startOfWeek(new Date("2026-06-01T00:00:00"))).toBe("2026-06-01");
  });

  it("returns the prior Monday when given a Sunday", () => {
    // 2026-06-07 is a Sunday
    expect(startOfWeek(new Date("2026-06-07T00:00:00"))).toBe("2026-06-01");
  });
});

describe("addDays", () => {
  it("adds positive days correctly", () => {
    expect(addDays("2026-06-01", 6)).toBe("2026-06-07");
  });

  it("adds zero days returns same date", () => {
    expect(addDays("2026-06-01", 0)).toBe("2026-06-01");
  });

  it("adds negative days (subtracts)", () => {
    expect(addDays("2026-06-07", -6)).toBe("2026-06-01");
  });

  it("crosses month boundaries", () => {
    expect(addDays("2026-05-30", 3)).toBe("2026-06-02");
  });
});

describe("formatHours", () => {
  it("formats 1.5 as 1.5h", () => {
    expect(formatHours(1.5)).toBe("1.5h");
  });

  it("formats an integer as integer h (no trailing zero)", () => {
    expect(formatHours(2)).toBe("2h");
  });

  it("formats 0 as 0h", () => {
    expect(formatHours(0)).toBe("0h");
  });

  it("rounds to 2 decimal places", () => {
    expect(formatHours(1.005)).toBe("1h");
  });
});

describe("formatHourLabel", () => {
  it("pads single-digit hours", () => {
    expect(formatHourLabel(9)).toBe("09:00");
  });

  it("formats double-digit hours", () => {
    expect(formatHourLabel(14)).toBe("14:00");
  });

  it("formats midnight as 00:00", () => {
    expect(formatHourLabel(0)).toBe("00:00");
  });
});

describe("formatTime", () => {
  it("extracts HH:MM from an ISO datetime", () => {
    // formatTime uses local hours — build an unambiguous local ISO string
    const localISO = `2026-06-01T09:30:00`;
    expect(formatTime(localISO)).toBe("09:30");
  });

  it("returns --:-- for an invalid ISO string", () => {
    expect(formatTime("not-a-date")).toBe("--:--");
  });
});

describe("formatDayHeading", () => {
  it("returns a non-empty string for a valid date", () => {
    const result = formatDayHeading("2026-06-01");
    expect(result).toBeTruthy();
    expect(typeof result).toBe("string");
  });

  it("returns the raw ISO string for an invalid date", () => {
    expect(formatDayHeading("not-a-date")).toBe("not-a-date");
  });
});

describe("formatWeekRange", () => {
  it("spans Monday to Sunday and includes the year once", () => {
    // 2026-06-08 is a Monday
    const result = formatWeekRange("2026-06-08");
    expect(result).toContain("2026");
    // Should mention the start day and end day
    expect(result).toMatch(/8/);
    expect(result).toMatch(/14/);
  });

  it("returns the raw string for an invalid week start", () => {
    expect(formatWeekRange("bad-date")).toBe("bad-date");
  });
});

describe("startOfMonth", () => {
  it("returns the first day of the month", () => {
    expect(startOfMonth(new Date(2026, 5, 15))).toBe("2026-06-01");
  });

  it("already on the first day returns same", () => {
    expect(startOfMonth(new Date(2026, 5, 1))).toBe("2026-06-01");
  });
});

describe("endOfMonth", () => {
  it("returns the last day of June", () => {
    expect(endOfMonth(new Date(2026, 5, 1))).toBe("2026-06-30");
  });

  it("returns the last day of February in a non-leap year", () => {
    expect(endOfMonth(new Date(2025, 1, 1))).toBe("2025-02-28");
  });

  it("returns the last day of February in a leap year", () => {
    expect(endOfMonth(new Date(2024, 1, 1))).toBe("2024-02-29");
  });
});

describe("addMonths", () => {
  it("adds a positive number of months", () => {
    expect(addMonths("2026-01-15", 5)).toBe("2026-06-01");
  });

  it("adds zero months returns first of current month", () => {
    expect(addMonths("2026-06-15", 0)).toBe("2026-06-01");
  });

  it("subtracts months with negative n", () => {
    expect(addMonths("2026-06-01", -1)).toBe("2026-05-01");
  });

  it("handles year rollover forward", () => {
    expect(addMonths("2026-11-01", 2)).toBe("2027-01-01");
  });
});

describe("formatDateRange", () => {
  it("includes both days and the year exactly once for a same-year range", () => {
    const result = formatDateRange("2026-06-01", "2026-06-14");
    expect(result).toContain("2026");
    expect(result).toMatch(/1/);
    expect(result).toMatch(/14/);
    // Year should appear once (end label) when same year
    const yearMatches = result.match(/2026/g);
    expect(yearMatches).toHaveLength(1);
  });

  it("separates start and end with an em-dash", () => {
    const result = formatDateRange("2026-06-01", "2026-06-14");
    expect(result).toContain("–");
  });

  it("falls back for invalid dates", () => {
    const result = formatDateRange("bad", "dates");
    expect(result).toBe("bad – dates");
  });
});

describe("decimalHour", () => {
  it("converts 09:30 to 9.5", () => {
    expect(decimalHour("2026-06-01T09:30:00")).toBe(9.5);
  });

  it("converts 14:00 to 14", () => {
    expect(decimalHour("2026-06-01T14:00:00")).toBe(14);
  });

  it("returns 0 for an invalid ISO string", () => {
    expect(decimalHour("invalid")).toBe(0);
  });
});
