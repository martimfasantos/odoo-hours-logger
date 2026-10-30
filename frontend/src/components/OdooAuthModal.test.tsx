import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OdooAuthModal from "./OdooAuthModal";

describe("OdooAuthModal", () => {
  it("renders nothing when open is false", () => {
    const { container } = render(
      <OdooAuthModal open={false} onClose={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("points to the API key setting and guide when open", () => {
    render(<OdooAuthModal open={true} onClose={vi.fn()} />);
    expect(
      screen.getByRole("heading", { name: "Odoo sign-in failed" })
    ).toBeInTheDocument();
    expect(screen.getByText("Settings → Odoo API key")).toBeInTheDocument();
    expect(screen.getByText("How to get an Odoo API key")).toBeInTheDocument();
  });

  it("links Open Settings to the Settings tab", () => {
    render(<OdooAuthModal open={true} onClose={vi.fn()} />);
    expect(screen.getByRole("link", { name: /Open Settings/i })).toHaveAttribute(
      "href",
      "/settings"
    );
  });

  it("calls onClose when Dismiss is clicked", async () => {
    const onClose = vi.fn();
    render(<OdooAuthModal open={true} onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: /Dismiss/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose on Escape", () => {
    const onClose = vi.fn();
    render(<OdooAuthModal open={true} onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the scrim is clicked", async () => {
    const onClose = vi.fn();
    render(<OdooAuthModal open={true} onClose={onClose} />);
    await userEvent.click(document.querySelector(".modal-overlay")!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
