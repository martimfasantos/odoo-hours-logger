import { describe, it, expect } from "vitest";
import { monthGrid, orderRange, presetRanges } from "./calendar";

describe("monthGrid", () => {
  it("pads a Thursday-start month back to Monday and spans six weeks", () => {
    const grid = monthGrid("2026-10-01");
    expect(grid).toHaveLength(42);
    expect(grid[0]).toBe("2026-09-28");
    expect(grid[3]).toBe("2026-10-01");
    expect(grid[41]).toBe("2026-11-08");
  });

  it("starts on the 1st when the month begins on a Monday", () => {
    const grid = monthGrid("2026-06-01");
    expect(grid[0]).toBe("2026-06-01");
    expect(grid[41]).toBe("2026-07-12");
  });
});

describe("presetRanges", () => {
  it("builds Monday-Sunday weeks and whole months around a Friday", () => {
    expect(presetRanges(new Date(2026, 9, 30))).toEqual([
      { label: "Today", from: "2026-10-30", to: "2026-10-30" },
      { label: "This week", from: "2026-10-26", to: "2026-11-01" },
      { label: "Last week", from: "2026-10-19", to: "2026-10-25" },
      { label: "This month", from: "2026-10-01", to: "2026-10-31" },
      { label: "Last month", from: "2026-09-01", to: "2026-09-30" },
    ]);
  });

  it("rolls Last month back across the year boundary", () => {
    const last = presetRanges(new Date(2026, 0, 15)).find((p) => p.label === "Last month");
    expect(last).toEqual({ label: "Last month", from: "2025-12-01", to: "2025-12-31" });
  });
});

describe("orderRange", () => {
  it("keeps an in-order pair", () => {
    expect(orderRange("2026-10-26", "2026-10-28")).toEqual(["2026-10-26", "2026-10-28"]);
  });

  it("swaps a backwards pair", () => {
    expect(orderRange("2026-10-28", "2026-10-26")).toEqual(["2026-10-26", "2026-10-28"]);
  });
});
