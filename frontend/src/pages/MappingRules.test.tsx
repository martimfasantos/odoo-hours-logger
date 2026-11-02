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
    importPreferences: vi.fn(),
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
  vi.mocked(api.importPreferences).mockResolvedValue({
    version: 1, rules: [], filter_words: [], colors: {},
  });
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

  it("disables Export when there are no preferences at all", async () => {
    renderMappingRules();
    await waitFor(() => {
      expect(screen.getByText(/No mapping rules yet/i)).toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", { name: /Export preferences as JSON/i })
    ).toBeDisabled();
  });

  it("exports rules, filter words, and colors as one JSON bundle", async () => {
    const RULES = [
      {
        id: 1,
        name: "Client A",
        keywords: ["client a"],
        contract_id: 2377,
        contract_name: "Client A",
        active: true,
      },
    ];
    vi.mocked(api.listRules).mockResolvedValue(RULES);
    vi.mocked(api.getIgnoreKeywords).mockResolvedValue(["Lunch"]);
    vi.mocked(api.getColors).mockResolvedValue({ "2377": "#7dd3fc" });

    // jsdom doesn't implement object URLs; capture the blob that's exported.
    let captured: Blob | null = null;
    const createObjectURL = vi.fn((b: Blob) => {
      captured = b;
      return "blob:mock";
    });
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    renderMappingRules();
    const exportBtn = await screen.findByRole("button", {
      name: /Export preferences as JSON/i,
    });
    await waitFor(() => expect(exportBtn).toBeEnabled());
    await userEvent.click(exportBtn);

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock");
    expect(captured).toBeInstanceOf(Blob);
    const text = await (captured as unknown as Blob).text();
    expect(JSON.parse(text)).toEqual({
      version: 1,
      rules: RULES,
      filter_words: ["Lunch"],
      colors: { "2377": "#7dd3fc" },
    });

    clickSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it("imports a preferences file after confirmation", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    renderMappingRules();
    await screen.findByRole("button", {
      name: /Import preferences from JSON/i,
    });

    const fileInput = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    const file = new File(
      [JSON.stringify({ version: 1, rules: [], filter_words: ["Lunch"], colors: {} })],
      "prefs.json",
      { type: "application/json" }
    );
    await userEvent.upload(fileInput, file);

    await waitFor(() => {
      expect(api.importPreferences).toHaveBeenCalledTimes(1);
    });
    expect(confirmSpy).toHaveBeenCalled();
    const [arg] = vi.mocked(api.importPreferences).mock.calls[0];
    expect(arg).toMatchObject({ filter_words: ["Lunch"] });

    confirmSpy.mockRestore();
  });

  it("does not import when confirmation is cancelled", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

    renderMappingRules();
    await screen.findByRole("button", {
      name: /Import preferences from JSON/i,
    });

    const fileInput = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    const file = new File(
      [JSON.stringify({ version: 1, rules: [], filter_words: [], colors: {} })],
      "prefs.json",
      { type: "application/json" }
    );
    await userEvent.upload(fileInput, file);

    await waitFor(() => expect(confirmSpy).toHaveBeenCalled());
    expect(api.importPreferences).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
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
