import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "../components/Toast";
import Settings from "./Settings";

// Mock the entire api module
vi.mock("../api/client", () => ({
  api: {
    getConfig: vi.fn(),
    saveConfig: vi.fn(),
    testConnection: vi.fn(),
  },
}));

import { api } from "../api/client";
import type { ConfigValues } from "../api/types";

const FULL_CONFIG: ConfigValues = {
  GOOGLE_CALENDAR_URL: "https://calendar.google.com/feed",
  ODOO_URL: "https://odoo.example.com",
  ODOO_DB: "mydb",
  ODOO_SESSION_ID: "sess-abc-123",
  ODOO_VISITOR_UUID: "uuid-xyz",
  ODOO_USER_ID: 7,
  ODOO_NETWORK_MEMBER_ID: 99,
  LOCAL_TZ: "Europe/Lisbon",
  USER_EMAIL: "user@example.com",
  DEMO_MODE: false,
};

function renderSettings() {
  return render(
    <ToastProvider>
      <Settings />
    </ToastProvider>
  );
}

beforeEach(() => {
  vi.mocked(api.getConfig).mockResolvedValue(FULL_CONFIG);
  vi.mocked(api.saveConfig).mockResolvedValue(FULL_CONFIG);
  vi.mocked(api.testConnection).mockResolvedValue({
    odoo: true,
    calendar: true,
    odoo_unreachable: false,
    errors: {},
  });
});

describe("Settings page", () => {
  it("renders the Settings heading", async () => {
    renderSettings();
    expect(screen.getByRole("heading", { name: /Settings/i })).toBeInTheDocument();
  });

  it("fields are masked (type=password) by default after config loads", async () => {
    renderSettings();
    // Wait for getConfig to resolve and the form to populate
    await waitFor(() => {
      const input = screen.getByLabelText(/Odoo URL/i);
      expect(input).toHaveAttribute("type", "password");
    });
  });

  it("clicking the eye toggle for a field reveals it (type=text)", async () => {
    renderSettings();
    // Wait for the form to load
    await waitFor(() => {
      expect(screen.getByLabelText(/Odoo URL/i)).toBeInTheDocument();
    });

    const eyeBtn = screen.getByRole("button", { name: /Show ODOO_URL/i });
    await userEvent.click(eyeBtn);

    expect(screen.getByLabelText(/Odoo URL/i)).toHaveAttribute("type", "text");
  });

  it("clicking the eye toggle again hides the field again", async () => {
    renderSettings();
    await waitFor(() => {
      expect(screen.getByLabelText(/Odoo URL/i)).toBeInTheDocument();
    });

    const eyeBtn = screen.getByRole("button", { name: /Show ODOO_URL/i });
    await userEvent.click(eyeBtn); // reveal
    const hideBtn = screen.getByRole("button", { name: /Hide ODOO_URL/i });
    await userEvent.click(hideBtn); // hide again

    expect(screen.getByLabelText(/Odoo URL/i)).toHaveAttribute("type", "password");
  });

  it("clicking Save calls api.saveConfig", async () => {
    renderSettings();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Save settings/i })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: /Save settings/i }));

    await waitFor(() => {
      expect(api.saveConfig).toHaveBeenCalledTimes(1);
    });
  });

  it("Save button calls api.saveConfig with the current form values", async () => {
    renderSettings();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Save settings/i })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: /Save settings/i }));

    await waitFor(() => {
      expect(api.saveConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          ODOO_URL: FULL_CONFIG.ODOO_URL,
          ODOO_DB: FULL_CONFIG.ODOO_DB,
        })
      );
    });
  });

  it("calls api.testConnection when Test connection is clicked", async () => {
    renderSettings();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Test connection/i })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: /Test connection/i }));

    await waitFor(() => {
      expect(api.testConnection).toHaveBeenCalledTimes(1);
    });
  });
});
