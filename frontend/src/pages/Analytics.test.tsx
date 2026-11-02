import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "../components/Toast";
import Analytics from "./Analytics";

vi.mock("../api/client", () => ({
  api: { analytics: vi.fn(), getColors: vi.fn() },
}));

import { api } from "../api/client";

const RESP = {
  projects: [
    {
      contract_id: 1, contract_name: "Acme", hours: 6,
      internal_rate: 40, external_rate: 100, revenue: 600, cost: 240,
      margin: 360, margin_pct: 60,
    },
    {
      contract_id: 2, contract_name: "Beta", hours: 4,
      internal_rate: null, external_rate: null, revenue: 0, cost: 90,
      margin: -90, margin_pct: null,
    },
  ],
  entries: [
    { date: "2026-06-02", contract_id: 1, hours: 4, revenue: 400, cost: 160 },
    { date: "2026-06-03", contract_id: 2, hours: 4, revenue: 0, cost: 90 },
    { date: "2026-06-10", contract_id: 1, hours: 2, revenue: 200, cost: 80 },
  ],
  currency: "EUR",
};

function renderAnalytics() {
  return render(
    <ToastProvider>
      <Analytics />
    </ToastProvider>
  );
}

async function loaded() {
  const view = renderAnalytics();
  await waitFor(() => expect(screen.getByRole("table")).toBeInTheDocument());
  return view;
}

const columns = () => document.querySelectorAll(".chart-col");

function hoverFirstColumn() {
  fireEvent.mouseEnter(columns()[0]);
  return screen.getByRole("tooltip");
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default range is the 1st of this month to today: Mon Jun 1 .. Sat Jun 20 2026.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 5, 20, 12));
  vi.mocked(api.getColors).mockResolvedValue({});
  vi.mocked(api.analytics).mockResolvedValue(RESP);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Analytics page", () => {
  it("renders the Analytics heading", () => {
    renderAnalytics();
    expect(screen.getByRole("heading", { name: /Analytics/i })).toBeInTheDocument();
  });

  it("loads and renders per-project rows + totals", async () => {
    await loaded();
    const table = screen.getByRole("table");
    expect(within(table).getByText("Acme")).toBeInTheDocument();
    expect(within(table).getByText("Beta")).toBeInTheDocument();
    expect(within(table).getByText("10.0h")).toBeInTheDocument();
    // zero-revenue project renders dashes for rate/margin%
    expect(within(table).getAllByText("—").length).toBeGreaterThan(0);
    expect(api.analytics).toHaveBeenCalled();
  });

  it("switching granularity changes the number of columns", async () => {
    await loaded();
    expect(columns().length).toBe(3); // weeks of Jun 1, 8, 15
    fireEvent.click(screen.getByRole("button", { name: "Day" }));
    expect(columns().length).toBe(20);
    fireEvent.click(screen.getByRole("button", { name: "Month" }));
    expect(columns().length).toBe(1);
  });

  it("toggling a project chip removes it from the chart and the table totals", async () => {
    await loaded();
    expect(hoverFirstColumn()).toHaveTextContent("Beta");

    const chips = screen.getByRole("group", { name: "Projects" });
    fireEvent.click(within(chips).getByRole("button", { name: "Beta" }));

    const table = screen.getByRole("table");
    expect(within(table).queryByText("Beta")).not.toBeInTheDocument();
    const totalRow = within(table).getByText("Total").closest("tr")!;
    expect(totalRow).toHaveTextContent("6.0h");
    expect(totalRow).toHaveTextContent("€240");
    expect(hoverFirstColumn()).not.toHaveTextContent("Beta");
    expect(screen.getByRole("tooltip")).toHaveTextContent("4.0hAcme");
  });

  it("the metric switch changes the tooltip units", async () => {
    await loaded();
    expect(hoverFirstColumn()).toHaveTextContent("8.0hTotal");
    fireEvent.click(screen.getByRole("button", { name: "Revenue" }));
    const tip = hoverFirstColumn();
    expect(tip).toHaveTextContent("€400Acme");
    expect(tip).not.toHaveTextContent(/\dh/);
  });

  it("clicking a legend entry hides that series", async () => {
    await loaded();
    const legend = screen.getByRole("group", { name: "Series" });
    const acme = within(legend).getByRole("button", { name: "Acme" });
    fireEvent.click(acme);
    expect(acme).toHaveAttribute("aria-pressed", "false");
    const tip = hoverFirstColumn();
    expect(tip).not.toHaveTextContent("Acme");
    expect(tip).toHaveTextContent("4.0hBeta");
  });

  it("reloads with the range picked in the date picker only on Refresh", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 30, 12));
    renderAnalytics();
    await waitFor(() =>
      expect(api.analytics).toHaveBeenCalledWith("2026-10-01", "2026-10-30")
    );

    await userEvent.click(screen.getByRole("button", { name: /From – To/ }));
    await userEvent.click(screen.getByRole("button", { name: "Last month" }));
    expect(api.analytics).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() =>
      expect(api.analytics).toHaveBeenLastCalledWith("2026-09-01", "2026-09-30")
    );
  });

  it("shows the empty state when there are no projects", async () => {
    vi.mocked(api.analytics).mockResolvedValue({ ...RESP, projects: [], entries: [] });
    renderAnalytics();
    await waitFor(() =>
      expect(screen.getByText(/No logged entries in this range/i)).toBeInTheDocument()
    );
  });
});
