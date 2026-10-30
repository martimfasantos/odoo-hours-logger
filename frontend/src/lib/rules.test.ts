import { describe, it, expect } from "vitest";
import { assignByKeyword, planRuleSave } from "./rules";
import type { ProposedEntry, Rule } from "../api/types";

const BETA = { id: 20, name: "Beta Ltd" };

function rule(id: number, keywords: string[], active = true, contractId = 20): Rule {
  return {
    id,
    name: `Rule ${id}`,
    keywords,
    contract_id: contractId,
    contract_name: contractId === 20 ? "Beta Ltd" : "Acme Corp",
    active,
  };
}

describe("planRuleSave", () => {
  it("creates an active rule named after the contract when none maps to it", () => {
    expect(planRuleSave([rule(1, ["acme"], true, 10)], "Standup", BETA)).toEqual({
      kind: "create",
      payload: {
        name: "Beta Ltd",
        keywords: ["Standup"],
        contract_id: 20,
        contract_name: "Beta Ltd",
        active: true,
      },
    });
  });

  it("creates a new rule when the contract's only rule is inactive", () => {
    expect(planRuleSave([rule(1, ["old"], false)], "Standup", BETA).kind).toBe(
      "create",
    );
  });

  it("appends to the lowest-id active rule for the contract", () => {
    const rules = [rule(5, ["later"]), rule(2, ["old"], false), rule(3, ["beta"])];
    expect(planRuleSave(rules, "Standup", BETA)).toEqual({
      kind: "update",
      id: 3,
      name: "Rule 3",
      payload: {
        name: "Rule 3",
        keywords: ["beta", "Standup"],
        contract_id: 20,
        contract_name: "Beta Ltd",
        active: true,
      },
    });
  });

  it("skips a keyword the rule already has, ignoring case", () => {
    expect(planRuleSave([rule(3, ["STANDUP"])], "standup", BETA)).toEqual({
      kind: "exists",
      name: "Rule 3",
    });
  });
});

function entry(uid: string, title: string, alreadyLogged = false): ProposedEntry {
  const start = "2026-06-01T09:00:00";
  return {
    event: { uid, title, start, end: "2026-06-01T10:00:00", hours: 1, date: "2026-06-01" },
    match: { rule_id: null, contract_id: null, contract_name: null, alternative_rule_ids: [] },
    already_logged: alreadyLogged,
    overlaps: false,
  };
}

describe("assignByKeyword", () => {
  it("assigns unassigned, unlogged rows whose title contains the keyword", () => {
    const proposals = [
      entry("a", "Weekly STANDUP"),
      entry("b", "Standup notes"),
      entry("c", "Design review"),
      entry("d", "standup", true),
    ];
    const rows = {
      "a|2026-06-01T09:00:00": { contractId: null, approved: true, description: "A" },
      "b|2026-06-01T09:00:00": { contractId: 10, approved: true, description: "B" },
      "c|2026-06-01T09:00:00": { contractId: null, approved: true, description: "C" },
      "d|2026-06-01T09:00:00": { contractId: null, approved: false, description: "D" },
    };

    expect(assignByKeyword(proposals, rows, "standup", 20)).toEqual({
      "a|2026-06-01T09:00:00": { contractId: 20, approved: true, description: "A" },
      "b|2026-06-01T09:00:00": { contractId: 10, approved: true, description: "B" },
      "c|2026-06-01T09:00:00": { contractId: null, approved: true, description: "C" },
      "d|2026-06-01T09:00:00": { contractId: null, approved: false, description: "D" },
    });
  });
});
