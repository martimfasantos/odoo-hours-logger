import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "./Toast";
import { LogHoursProvider } from "../state/LogHoursContext";
import DailyView from "../pages/DailyView";
import type { ProposedEntry } from "../api/types";

vi.mock("../api/client", () => ({
  api: {
    contracts: vi.fn(),
    getColors: vi.fn(),
    events: vi.fn(),
    listRules: vi.fn(),
    createRule: vi.fn(),
    updateRule: vi.fn(),
  },
}));

import { api } from "../api/client";

function entry(uid: string, title: string, hour: string, matchedContract?: number): ProposedEntry {
  return {
    event: {
      uid,
      title,
      start: `2026-06-01T${hour}:00:00`,
      end: `2026-06-01T${hour}:30:00`,
      hours: 0.5,
      date: "2026-06-01",
    },
    match: matchedContract
      ? { rule_id: 1, contract_id: matchedContract, contract_name: "Acme Corp", alternative_rule_ids: [] }
      : { rule_id: null, contract_id: null, contract_name: null, alternative_rule_ids: [] },
    already_logged: false,
    overlaps: false,
  };
}

const PROPOSALS = [
  entry("ev-1", "Weekly Standup", "09"),
  entry("ev-2", "Team Sync", "10", 10),
  entry("ev-3", "Standup follow-up", "11"),
  entry("ev-4", "Standup with Acme", "12", 10),
  entry("ev-5", "Lunch", "13"),
];

const contractSelect = (title: string) =>
  screen.getByRole("combobox", { name: `Contract for ${title}` }) as HTMLSelectElement;
const keywordInput = () => screen.queryByRole("textbox", { name: "Rule keyword" });

async function loadAndPick(title: string, contractId: string) {
  render(
    <ToastProvider>
      <LogHoursProvider>
        <DailyView />
      </LogHoursProvider>
    </ToastProvider>,
  );
  await userEvent.click(screen.getByRole("button", { name: /^Refresh/i }));
  await screen.findByText("Weekly Standup");
  await userEvent.selectOptions(contractSelect(title), contractId);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.contracts).mockResolvedValue([
    { id: 10, name: "Acme Corp" },
    { id: 20, name: "Beta Ltd" },
  ]);
  vi.mocked(api.getColors).mockResolvedValue({});
  vi.mocked(api.events).mockResolvedValue(PROPOSALS);
  vi.mocked(api.listRules).mockResolvedValue([]);
  vi.mocked(api.createRule).mockImplementation(async (r) => ({ id: 9, ...r }));
  vi.mocked(api.updateRule).mockImplementation(async (id, r) => ({ id, ...r }));
});

describe("Save rule prompt on Log Hours", () => {
  it("offers a rule only when the picked row had no rule match, prefilled with its title", async () => {
    await loadAndPick("Team Sync", "20");
    expect(keywordInput()).toBeNull();

    await userEvent.selectOptions(contractSelect("Weekly Standup"), "20");
    expect(keywordInput()).toHaveValue("Weekly Standup");
    expect(keywordInput()!.closest("tr")).toHaveTextContent(
      /^Always map events like\s*to Beta Ltd\?\s*Save rule$/,
    );
  });

  it("creates a rule, assigns other unassigned matching rows, and closes", async () => {
    await loadAndPick("Weekly Standup", "20");
    await userEvent.clear(keywordInput()!);
    await userEvent.type(keywordInput()!, " Standup ");
    await userEvent.click(screen.getByRole("button", { name: "Save rule" }));

    expect(await screen.findByText("Rule saved")).toBeInTheDocument();
    expect(api.createRule).toHaveBeenCalledWith({
      name: "Beta Ltd",
      keywords: ["Standup"],
      contract_id: 20,
      contract_name: "Beta Ltd",
      active: true,
    });
    expect(contractSelect("Standup follow-up").value).toBe("20");
    expect(contractSelect("Standup with Acme").value).toBe("10");
    expect(contractSelect("Lunch").value).toBe("");
    expect(keywordInput()).toBeNull();
  });

  it("appends the keyword to an existing rule for that contract", async () => {
    vi.mocked(api.listRules).mockResolvedValue([
      { id: 7, name: "Beta", keywords: ["beta"], contract_id: 20, contract_name: "Beta Ltd", active: true },
    ]);
    await loadAndPick("Weekly Standup", "20");
    await userEvent.click(screen.getByRole("button", { name: "Save rule" }));

    expect(await screen.findByText("Keyword added to Beta")).toBeInTheDocument();
    expect(api.updateRule).toHaveBeenCalledWith(7, {
      name: "Beta",
      keywords: ["beta", "Weekly Standup"],
      contract_id: 20,
      contract_name: "Beta Ltd",
      active: true,
    });
    expect(api.createRule).not.toHaveBeenCalled();
  });

  it("keeps the prompt open and shows the error when saving fails", async () => {
    vi.mocked(api.createRule).mockRejectedValue(new Error("500: boom"));
    await loadAndPick("Weekly Standup", "20");
    await userEvent.click(screen.getByRole("button", { name: "Save rule" }));

    expect(
      await screen.findByText("Failed to save rule: Error: 500: boom"),
    ).toBeInTheDocument();
    expect(keywordInput()).toHaveValue("Weekly Standup");
    expect(contractSelect("Standup follow-up").value).toBe("");
  });

  it("disables Save for a blank keyword", async () => {
    await loadAndPick("Weekly Standup", "20");
    const save = screen.getByRole("button", { name: "Save rule" });
    expect(save).toBeEnabled();

    await userEvent.clear(keywordInput()!);
    await userEvent.type(keywordInput()!, "   ");
    expect(save).toBeDisabled();
  });

  it("disables Save for a keyword with a comma, which Mapping Rules would split", async () => {
    await loadAndPick("Weekly Standup", "20");
    await userEvent.type(keywordInput()!, ", Acme");
    expect(screen.getByRole("button", { name: "Save rule" })).toBeDisabled();
    expect(keywordInput()).toHaveAttribute("aria-invalid", "true");
  });

  it("closes when the calendar is re-fetched", async () => {
    await loadAndPick("Weekly Standup", "20");
    expect(keywordInput()).not.toBeNull();

    await userEvent.click(screen.getByRole("button", { name: /^Refresh/i }));
    await screen.findByText("Weekly Standup");
    expect(contractSelect("Weekly Standup").value).toBe("");
    expect(keywordInput()).toBeNull();
  });

  it("stays hidden for a dismissed row even when its contract changes again", async () => {
    await loadAndPick("Weekly Standup", "20");
    await userEvent.click(screen.getByRole("button", { name: "Dismiss rule suggestion" }));
    expect(keywordInput()).toBeNull();

    await userEvent.selectOptions(contractSelect("Weekly Standup"), "10");
    expect(keywordInput()).toBeNull();

    await userEvent.selectOptions(contractSelect("Lunch"), "10");
    expect(keywordInput()).toHaveValue("Lunch");
  });
});
