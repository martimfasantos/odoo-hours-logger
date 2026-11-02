import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "../components/Toast";
import MappingRules from "./MappingRules";

vi.mock("../api/client", () => ({
  api: {
    listRules: vi.fn(),
    contracts: vi.fn(),
    getIgnoreKeywords: vi.fn(),
    getColors: vi.fn(),
    setColor: vi.fn(),
    createRule: vi.fn(),
    updateRule: vi.fn(),
    deleteRule: vi.fn(),
    setIgnoreKeywords: vi.fn(),
  },
}));

import { api } from "../api/client";

function renderMappingRules() {
  return render(
    <ToastProvider>
      <MappingRules />
    </ToastProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.listRules).mockResolvedValue([]);
  vi.mocked(api.contracts).mockResolvedValue([
    { id: 10, name: "Acme Corp" },
    { id: 20, name: "Beta Ltd" },
  ]);
  vi.mocked(api.getIgnoreKeywords).mockResolvedValue([]);
  vi.mocked(api.getColors).mockResolvedValue({});
  vi.mocked(api.setColor).mockResolvedValue({});
  vi.mocked(api.createRule).mockResolvedValue({
    id: 1,
    name: "My Rule",
    keywords: ["sync"],
    contract_id: 10,
    contract_name: "Acme Corp",
    active: true,
  });
  vi.mocked(api.setIgnoreKeywords).mockResolvedValue(["Lunch"]);
});

describe("MappingRules page", () => {
  it("renders the Mapping rules heading", async () => {
    renderMappingRules();
    expect(
      screen.getByRole("heading", { name: /Mapping rules/i })
    ).toBeInTheDocument();
  });

  it("renders the Create rule form", async () => {
    renderMappingRules();
    expect(screen.getByLabelText(/Name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Keywords/i)).toBeInTheDocument();
  });

  it("shows the no-rules-yet empty state when rules list is empty", async () => {
    renderMappingRules();
    await waitFor(() => {
      expect(
        screen.getByText(/No mapping rules yet/i)
      ).toBeInTheDocument();
    });
  });

  it("fills form and calls api.createRule with correct payload on submit", async () => {
    renderMappingRules();

    // Wait for contracts to load in the select
    await waitFor(() => {
      expect(screen.getByRole("option", { name: "Acme Corp" })).toBeInTheDocument();
    });

    // Fill name
    await userEvent.type(screen.getByLabelText(/^Name/i), "My Rule");

    // Fill keywords
    await userEvent.type(screen.getByLabelText(/Keywords/i), "sync, meeting");

    // Select contract
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: /Contract/i }),
      "10"
    );

    // Submit
    await userEvent.click(screen.getByRole("button", { name: /Create rule/i }));

    await waitFor(() => {
      expect(api.createRule).toHaveBeenCalledTimes(1);
    });

    const [payload] = vi.mocked(api.createRule).mock.calls[0];
    expect(payload).toMatchObject({
      name: "My Rule",
      keywords: ["sync", "meeting"],
      contract_id: 10,
      contract_name: "Acme Corp",
      active: true,
    });
  });

  it("shows validation error when name is empty on submit", async () => {
    renderMappingRules();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Create rule/i })).toBeInTheDocument();
    });

    // Only fill keywords, leave name empty
    await userEvent.type(screen.getByLabelText(/Keywords/i), "meeting");
    await userEvent.click(screen.getByRole("button", { name: /Create rule/i }));

    await waitFor(() => {
      expect(screen.getByText(/Name is required/i)).toBeInTheDocument();
    });
    expect(api.createRule).not.toHaveBeenCalled();
  });

  it("calls api.setIgnoreKeywords when a filter word is added", async () => {
    renderMappingRules();

    // Wait for the filter word input to be present
    await waitFor(() => {
      expect(screen.getByLabelText(/Add a word/i)).toBeInTheDocument();
    });

    await userEvent.type(screen.getByLabelText(/Add a word/i), "Lunch");
    await userEvent.click(screen.getByRole("button", { name: /^Add$/i }));

    await waitFor(() => {
      expect(api.setIgnoreKeywords).toHaveBeenCalledWith(["Lunch"]);
    });
  });

  describe("contract status warnings", () => {
    const CONTRACTS = [
      { id: 10, name: "Acme Corp", start_date: "2020-01-01", end_date: "2999-12-31" },
      { id: 20, name: "Beta Ltd", start_date: null, end_date: null },
      { id: 30, name: "Old Client A", start_date: "2019-02-01", end_date: "2020-01-31" },
    ];
    const rule = (id: number, name: string, contract_id: number) => ({
      id,
      name,
      keywords: [name.toLowerCase()],
      contract_id,
      contract_name: `Contract ${contract_id}`,
      active: true,
    });
    const STALE_RULES = [
      rule(2, "DREM", 2056),
      rule(3, "Client A", 30),
      rule(4, "Acme", 10),
    ];

    beforeEach(() => {
      vi.mocked(api.contracts).mockResolvedValue(CONTRACTS);
      vi.mocked(api.listRules).mockResolvedValue(STALE_RULES);
    });

    function fixSelect(ruleName: string) {
      return screen.queryByRole("combobox", { name: `Fix contract for ${ruleName}` });
    }

    it("badges rules with unknown or ended contracts and offers only current ones", async () => {
      renderMappingRules();

      const drem = await screen.findByRole("row", { name: /DREM/ });
      await waitFor(() => {
        expect(within(drem).getByText("Not in your contracts")).toBeInTheDocument();
      });
      expect(
        within(screen.getByRole("row", { name: /Client A/ })).getByText("Ended Jan 31"),
      ).toBeInTheDocument();
      expect(fixSelect("Acme")).toBeNull();

      expect(
        within(fixSelect("DREM")!).getAllByRole("option").map((o) => o.textContent),
      ).toEqual(["Reassign…", "Acme Corp", "Beta Ltd"]);
    });

    it("reassigns the rule through the fix-it select", async () => {
      vi.mocked(api.listRules)
        .mockResolvedValueOnce(STALE_RULES)
        .mockResolvedValue([rule(2, "DREM", 20), ...STALE_RULES.slice(1)]);
      vi.mocked(api.updateRule).mockResolvedValue(rule(2, "DREM", 20));
      renderMappingRules();

      await waitFor(() => expect(fixSelect("DREM")).not.toBeNull());
      await userEvent.selectOptions(fixSelect("DREM")!, "20");

      await waitFor(() => expect(fixSelect("DREM")).toBeNull());
      expect(api.updateRule).toHaveBeenCalledWith(2, {
        name: "DREM",
        keywords: ["drem"],
        contract_id: 20,
        contract_name: "Beta Ltd",
        active: true,
      });
    });

    it("shows no warnings while contracts are unavailable", async () => {
      vi.mocked(api.contracts).mockResolvedValue([]);
      renderMappingRules();

      await screen.findByRole("row", { name: /DREM/ });
      expect(screen.queryByText("Not in your contracts")).toBeNull();
    });
  });

  it("calls api.setIgnoreKeywords with Enter key in filter word input", async () => {
    renderMappingRules();

    await waitFor(() => {
      expect(screen.getByLabelText(/Add a word/i)).toBeInTheDocument();
    });

    await userEvent.type(screen.getByLabelText(/Add a word/i), "OOO{Enter}");

    await waitFor(() => {
      expect(api.setIgnoreKeywords).toHaveBeenCalledWith(["OOO"]);
    });
  });
});
