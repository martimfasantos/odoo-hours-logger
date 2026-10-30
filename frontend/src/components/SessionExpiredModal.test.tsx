import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SessionExpiredModal from "./SessionExpiredModal";

describe("SessionExpiredModal", () => {
  it("renders nothing when open is false", () => {
    const { container } = render(
      <SessionExpiredModal open={false} onClose={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders the title and the fetch instructions when open", () => {
    render(<SessionExpiredModal open={true} onClose={vi.fn()} />);
    expect(screen.getByText(/Odoo session expired/i)).toBeInTheDocument();
    expect(screen.getByText(/Open Odoo in your browser/i)).toBeInTheDocument();
    expect(screen.getByText(/Odoo Session ID/i)).toBeInTheDocument();
  });

  it("points to a new API key instead of a session ID when apiKey is set", () => {
    render(<SessionExpiredModal open={true} apiKey onClose={vi.fn()} />);
    expect(
      screen.getByRole("heading", { name: "Odoo API key rejected" })
    ).toBeInTheDocument();
    expect(screen.getByText("Settings → Odoo API key")).toBeInTheDocument();
    expect(screen.queryByText(/session_id/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Odoo Session ID/)).not.toBeInTheDocument();
  });

  it("links Open Settings to the Settings tab", () => {
    render(<SessionExpiredModal open={true} onClose={vi.fn()} />);
    expect(screen.getByRole("link", { name: /Open Settings/i })).toHaveAttribute(
      "href",
      "/settings"
    );
  });

  it("calls onClose when Dismiss is clicked", async () => {
    const onClose = vi.fn();
    render(<SessionExpiredModal open={true} onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: /Dismiss/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose on Escape", () => {
    const onClose = vi.fn();
    render(<SessionExpiredModal open={true} onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the scrim is clicked", async () => {
    const onClose = vi.fn();
    render(<SessionExpiredModal open={true} onClose={onClose} />);
    await userEvent.click(document.querySelector(".modal-overlay")!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
