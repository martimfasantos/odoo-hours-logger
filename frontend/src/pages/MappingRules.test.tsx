import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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
