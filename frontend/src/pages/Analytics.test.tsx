import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ToastProvider } from "../components/Toast";
import Analytics from "./Analytics";

vi.mock("../api/client", () => ({
  api: { analytics: vi.fn(), getColors: vi.fn() },
}));

import { api } from "../api/client";

const RESP = {
  projects: [
    {
      contract_id: 1, contract_name: "Acme", hours: 6, allocation_pct: 60,
      internal_rate: 40, external_rate: 100, revenue: 600, cost: 240,
      margin: 360, margin_pct: 60,
    },
    {
      contract_id: 2, contract_name: "Beta", hours: 4, allocation_pct: 40,
      internal_rate: null, external_rate: null, revenue: 0, cost: 90,
      margin: -90, margin_pct: null,
    },
  ],
  totals: { hours: 10, revenue: 600, cost: 330, margin: 270, margin_pct: 45 },
  weekly: [
    { week_start: "2026-06-01", hours: 6 },
    { week_start: "2026-06-08", hours: 4 },
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

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getColors).mockResolvedValue({});
  vi.mocked(api.analytics).mockResolvedValue(RESP);
});

describe("Analytics page", () => {
  it("renders the Analytics heading", () => {
    renderAnalytics();
    expect(screen.getByRole("heading", { name: /Analytics/i })).toBeInTheDocument();
  });

  it("loads and renders per-project rows + totals", async () => {
    renderAnalytics();
    await waitFor(() => expect(screen.getByText("Acme")).toBeInTheDocument());
    expect(screen.getByText("Beta")).toBeInTheDocument();
    // totals hours cell (unique)
    expect(screen.getByText("10.0h")).toBeInTheDocument();
    // zero-revenue project renders dashes for rate/margin%
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    expect(api.analytics).toHaveBeenCalled();
  });

  it("renders one weekly bar per week", async () => {
    renderAnalytics();
    await waitFor(() => expect(screen.getByText("Acme")).toBeInTheDocument());
    expect(document.querySelectorAll(".bar-row").length).toBe(2);
  });

  it("shows the empty state when there are no projects", async () => {
    vi.mocked(api.analytics).mockResolvedValue({ ...RESP, projects: [] });
    renderAnalytics();
    await waitFor(() =>
      expect(screen.getByText(/No logged entries in this range/i)).toBeInTheDocument()
    );
  });
});
