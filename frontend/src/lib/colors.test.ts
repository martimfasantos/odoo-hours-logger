import { describe, it, expect } from "vitest";
import { colorForContract, PALETTE, UNASSIGNED_COLOR } from "./colors";

describe("colorForContract", () => {
  it("returns UNASSIGNED_COLOR when contractId is null", () => {
    expect(colorForContract(null, {})).toBe(UNASSIGNED_COLOR);
  });

  it("returns UNASSIGNED_COLOR when contractId is null even with stored colors", () => {
    expect(colorForContract(null, { "42": "#ff0000" })).toBe(UNASSIGNED_COLOR);
  });

  it("returns a stored override when one exists for the contract id", () => {
    expect(colorForContract(42, { "42": "#ff0000" })).toBe("#ff0000");
  });

  it("ignores stored overrides for other contracts", () => {
    const result = colorForContract(1, { "42": "#ff0000" });
    expect(result).not.toBe("#ff0000");
    expect(PALETTE).toContain(result);
  });

  it("returns a deterministic PALETTE color for unknown contract ids", () => {
    const result1 = colorForContract(5, {});
    const result2 = colorForContract(5, {});
    expect(result1).toBe(result2);
    expect(PALETTE).toContain(result1);
  });

  it("same contract id always maps to the same palette color", () => {
    for (let id = 0; id < PALETTE.length * 2; id++) {
      const r1 = colorForContract(id, {});
      const r2 = colorForContract(id, {});
      expect(r1).toBe(r2);
    }
  });

  it("different contract ids can map to different palette colors", () => {
    // id 0 and id 1 use PALETTE[0] and PALETTE[1]
    const r0 = colorForContract(0, {});
    const r1 = colorForContract(1, {});
    expect(r0).toBe(PALETTE[0]);
    expect(r1).toBe(PALETTE[1]);
  });

  it("wraps around the palette for large ids", () => {
    const id = PALETTE.length; // wraps to index 0
    expect(colorForContract(id, {})).toBe(PALETTE[0]);
  });
});
