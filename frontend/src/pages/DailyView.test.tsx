import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "../components/Toast";
import { LogHoursProvider } from "../state/LogHoursContext";
import DailyView, { recomputeOverlaps } from "./DailyView";
import type { ProposedEntry } from "../api/types";

vi.mock("../api/client", () => ({
  api: {
    health: vi.fn(),
    contracts: vi.fn(),
    getColors: vi.fn(),
    events: vi.fn(),
    push: vi.fn(),
    testConnection: vi.fn(),
  },
}));

import { api } from "../api/client";

// Two sample proposed entries — both unlogged with a matched contract
const SAMPLE_PROPOSALS: ProposedEntry[] = [
  {
    event: {
      uid: "ev-1",
      title: "Team Sync",
      start: "2026-06-01T09:00:00",
      end: "2026-06-01T10:00:00",
      hours: 1,
      date: "2026-06-01",
    },
    match: {
      rule_id: 1,
      contract_id: 10,
      contract_name: "Acme Corp",
      alternative_rule_ids: [],
    },
    already_logged: false,
    overlaps: false,
  },
  {
    event: {
      uid: "ev-2",
      title: "Client Call",
      start: "2026-06-01T11:00:00",
      end: "2026-06-01T12:00:00",
      hours: 1,
      date: "2026-06-01",
    },
    match: {
      rule_id: 2,
      contract_id: 20,
      contract_name: "Beta Ltd",
      alternative_rule_ids: [],
    },
    already_logged: false,
    overlaps: false,
  },
];

/** Build a proposal on 2026-06-01 from HH:MM:SS start/end times. */
function makeEntry(
  uid: string,
  title: string,
  startTime: string,
  endTime: string,
  overlaps = true,
): ProposedEntry {
  const date = "2026-06-01";
  const start = `${date}T${startTime}`;
  const end = `${date}T${endTime}`;
  const hours = (new Date(end).getTime() - new Date(start).getTime()) / 3600000;
  return {
    event: { uid, title, start, end, hours, date },
    match: {
      rule_id: 1,
      contract_id: 10,
      contract_name: "Acme Corp",
      alternative_rule_ids: [],
    },
    already_logged: false,
    overlaps,
  };
}

function renderDailyView() {
  return render(
    <ToastProvider>
      <LogHoursProvider>
        <DailyView />
      </LogHoursProvider>
    </ToastProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.health).mockResolvedValue({ status: "ok" });
  vi.mocked(api.contracts).mockResolvedValue([
    { id: 10, name: "Acme Corp" },
    { id: 20, name: "Beta Ltd" },
  ]);
  vi.mocked(api.getColors).mockResolvedValue({});
  vi.mocked(api.events).mockResolvedValue(SAMPLE_PROPOSALS);
  vi.mocked(api.push).mockResolvedValue({
    results: [
      { uid: "ev-1", start: "2026-06-01T09:00:00", success: true, odoo_id: 101, error: null },
      { uid: "ev-2", start: "2026-06-01T11:00:00", success: true, odoo_id: 102, error: null },
    ],
  });
  vi.mocked(api.testConnection).mockResolvedValue({
    odoo: true,
    calendar: true,
    odoo_unreachable: false,
    errors: {},
  });
});

describe("DailyView page", () => {
  it("renders the Log Hours heading", () => {
    renderDailyView();
    expect(screen.getByRole("heading", { name: /Log Hours/i })).toBeInTheDocument();
  });

  it("shows the empty/prompt state initially (no fetch yet)", async () => {
    renderDailyView();
    // After contracts load there should be a prompt to refresh
    await waitFor(() => {
      expect(
        screen.getByText(/Pick a range and refresh from the calendar/i)
      ).toBeInTheDocument();
    });
  });

  it("shows the Refresh from calendar button", async () => {
    renderDailyView();
    expect(
      screen.getByRole("button", { name: /Refresh from calendar/i })
    ).toBeInTheDocument();
  });

  it("renders event titles after clicking Refresh from calendar", async () => {
    renderDailyView();

    await userEvent.click(
      screen.getByRole("button", { name: /Refresh from calendar/i })
    );

    await waitFor(() => {
      expect(screen.getByText("Team Sync")).toBeInTheDocument();
      expect(screen.getByText("Client Call")).toBeInTheDocument();
    });
  });

  it("renders the Approve all imported checkbox after events load", async () => {
    renderDailyView();
    await userEvent.click(
      screen.getByRole("button", { name: /Refresh from calendar/i })
    );
    await waitFor(() => {
      expect(
        screen.getByRole("checkbox", { name: /Approve all imported/i })
      ).toBeInTheDocument();
    });
  });

  it("renders Push approved to Odoo button after events load", async () => {
    renderDailyView();
    await userEvent.click(
      screen.getByRole("button", { name: /Refresh from calendar/i })
    );
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Push approved to Odoo/i })
      ).toBeInTheDocument();
    });
  });

  it("calls api.push with the approved entries when Push is clicked", async () => {
    renderDailyView();
    await userEvent.click(
      screen.getByRole("button", { name: /Refresh from calendar/i })
    );

    // Wait for events and the push button to appear
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Push approved to Odoo/i })
      ).toBeInTheDocument();
    });

    // Both rows are pre-approved with matched contracts so push should work
    await userEvent.click(
      screen.getByRole("button", { name: /Push approved to Odoo/i })
    );

    await waitFor(() => {
      expect(api.push).toHaveBeenCalledTimes(1);
    });

    const [calledWith] = vi.mocked(api.push).mock.calls[0];
    expect(calledWith).toHaveLength(2);
    expect(calledWith[0]).toMatchObject({
      uid: "ev-1",
      contract_id: 10,
    });
    expect(calledWith[1]).toMatchObject({
      uid: "ev-2",
      contract_id: 20,
    });
  });

  it("clears Overlap badges when the event linking two others is removed", async () => {
    // A 09:00–10:00 overlaps B; C 11:00–12:00 overlaps B; A and C do NOT
    // overlap each other. Removing B should leave neither A nor C overlapping.
    const a = makeEntry("ev-a", "Event A", "09:00:00", "10:00:00");
    const b = makeEntry("ev-b", "Event B", "09:30:00", "11:30:00");
    const c = makeEntry("ev-c", "Event C", "11:00:00", "12:00:00");
    vi.mocked(api.events).mockResolvedValue([a, b, c]);

    renderDailyView();
    await userEvent.click(
      screen.getByRole("button", { name: /Refresh from calendar/i }),
    );

    await waitFor(() => {
      expect(screen.getAllByText("Overlap")).toHaveLength(3);
    });

    await userEvent.click(
      screen.getByRole("button", { name: /Row actions for "Event B"/i }),
    );
    await userEvent.click(
      screen.getByRole("menuitem", { name: /Remove from import/i }),
    );

    await waitFor(() => {
      expect(screen.queryByText("Event B")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Event A")).toBeInTheDocument();
    expect(screen.getByText("Event C")).toBeInTheDocument();
    expect(screen.queryAllByText("Overlap")).toHaveLength(0);
  });

  it("keeps Overlap badges for events that still overlap after a removal", async () => {
    // All three mutually overlap. After removing A, B 09:30–10:30 and
    // C 10:00–12:00 still overlap each other, so both keep the badge.
    const a = makeEntry("ev-a", "Event A", "09:00:00", "11:00:00");
    const b = makeEntry("ev-b", "Event B", "09:30:00", "10:30:00");
    const c = makeEntry("ev-c", "Event C", "10:00:00", "12:00:00");
    vi.mocked(api.events).mockResolvedValue([a, b, c]);

    renderDailyView();
    await userEvent.click(
      screen.getByRole("button", { name: /Refresh from calendar/i }),
    );

    await waitFor(() => {
      expect(screen.getAllByText("Overlap")).toHaveLength(3);
    });

    await userEvent.click(
      screen.getByRole("button", { name: /Row actions for "Event A"/i }),
    );
    await userEvent.click(
      screen.getByRole("menuitem", { name: /Remove from import/i }),
    );

    await waitFor(() => {
      expect(screen.queryByText("Event A")).not.toBeInTheDocument();
    });
    expect(screen.getAllByText("Overlap")).toHaveLength(2);
  });

  it("calls api.events with the selected from/to dates on Refresh click", async () => {
    renderDailyView();
    await userEvent.click(
      screen.getByRole("button", { name: /Refresh from calendar/i })
    );

    await waitFor(() => {
      expect(api.events).toHaveBeenCalled();
    });

    const [start, end] = vi.mocked(api.events).mock.calls[0];
    // Both default to today which is a non-empty string
    expect(typeof start).toBe("string");
    expect(start.length).toBeGreaterThan(0);
    expect(typeof end).toBe("string");
    expect(end.length).toBeGreaterThan(0);
  });
});

describe("recomputeOverlaps", () => {
  const flags = (entries: ProposedEntry[]) => entries.map((p) => p.overlaps);

  it("flags every event in a mutually-overlapping cluster", () => {
    const result = recomputeOverlaps([
      makeEntry("a", "A", "09:00:00", "10:00:00", false),
      makeEntry("b", "B", "09:30:00", "10:30:00", false),
    ]);
    expect(flags(result)).toEqual([true, true]);
  });

  it("clears the flag once the overlapping neighbour is gone", () => {
    const result = recomputeOverlaps([
      makeEntry("a", "A", "09:00:00", "10:00:00", true),
    ]);
    expect(flags(result)).toEqual([false]);
  });

  it("treats touching endpoints as non-overlapping (strict <, like the backend)", () => {
    const result = recomputeOverlaps([
      makeEntry("a", "A", "09:00:00", "10:00:00", true),
      makeEntry("b", "B", "10:00:00", "11:00:00", true),
    ]);
    expect(flags(result)).toEqual([false, false]);
  });

  it("returns the same object reference for rows whose flag is unchanged", () => {
    const a = makeEntry("a", "A", "09:00:00", "10:00:00", false);
    const b = makeEntry("b", "B", "11:00:00", "12:00:00", false);
    const result = recomputeOverlaps([a, b]);
    expect(result[0]).toBe(a);
    expect(result[1]).toBe(b);
  });
});
