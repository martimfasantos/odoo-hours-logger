import { describe, it, expect } from "vitest";
import type { OdooRef } from "../api/types";
import { contractOptionLabel, contractStatus } from "./contractStatus";

const CONTRACTS: OdooRef[] = [
  { id: 1, name: "Open-ended" },
  { id: 2, name: "Dated", start_date: "2025-09-19", end_date: "2026-09-18" },
  { id: 3, name: "Odoo nulls", start_date: null, end_date: null },
];

describe("contractStatus", () => {
  it("is missing when the id is not in the contracts list", () => {
    expect(contractStatus(2056, CONTRACTS, "2026-06-01")).toEqual({ kind: "missing" });
  });

  it("is ok inside the dates, including the first and last day", () => {
    expect(contractStatus(2, CONTRACTS, "2026-06-01")).toEqual({ kind: "ok" });
    expect(contractStatus(2, CONTRACTS, "2025-09-19")).toEqual({ kind: "ok" });
    expect(contractStatus(2, CONTRACTS, "2026-09-18")).toEqual({ kind: "ok" });
  });

  it("is ended the day after the end date", () => {
    expect(contractStatus(2, CONTRACTS, "2026-09-19")).toEqual({
      kind: "ended",
      endDate: "2026-09-18",
    });
  });

  it("is not_started the day before the start date", () => {
    expect(contractStatus(2, CONTRACTS, "2025-09-18")).toEqual({
      kind: "not_started",
      startDate: "2025-09-19",
    });
  });

  it("is ok for contracts with no dates, missing or null", () => {
    expect(contractStatus(1, CONTRACTS, "2030-01-01")).toEqual({ kind: "ok" });
    expect(contractStatus(3, CONTRACTS, "2030-01-01")).toEqual({ kind: "ok" });
  });
});

describe("contractOptionLabel", () => {
  it("suffixes contracts that ended before the date", () => {
    expect(contractOptionLabel(CONTRACTS[1], "2026-10-30")).toBe("Dated (ended Sep 18)");
  });

  it("keeps the plain name on or before the end date", () => {
    expect(contractOptionLabel(CONTRACTS[1], "2026-09-18")).toBe("Dated");
    expect(contractOptionLabel(CONTRACTS[0], "2026-10-30")).toBe("Open-ended");
  });
});
