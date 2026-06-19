import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import VpnModal from "./VpnModal";

describe("VpnModal", () => {
  it("renders nothing when open is false", () => {
    const { container } = render(
      <VpnModal open={false} onRetry={vi.fn()} onClose={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders the title when open is true", () => {
    render(<VpnModal open={true} onRetry={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText(/Can't reach Odoo/i)).toBeInTheDocument();
  });

  it("renders the body text about VPN", () => {
    render(<VpnModal open={true} onRetry={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText(/VPN/i)).toBeInTheDocument();
  });

  it("calls onRetry when Retry button is clicked", async () => {
    const onRetry = vi.fn();
    render(<VpnModal open={true} onRetry={onRetry} onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /Retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when Dismiss button is clicked", async () => {
    const onClose = vi.fn();
    render(<VpnModal open={true} onRetry={vi.fn()} onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: /Dismiss/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when Escape key is pressed", () => {
    const onClose = vi.fn();
    render(<VpnModal open={true} onRetry={vi.fn()} onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the scrim (overlay) is clicked", async () => {
    const onClose = vi.fn();
    render(<VpnModal open={true} onRetry={vi.fn()} onClose={onClose} />);
    // The scrim is the modal-overlay element (role="presentation")
    const scrim = document.querySelector(".modal-overlay")!;
    await userEvent.click(scrim);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("disables the Retry button when retrying is true", () => {
    render(<VpnModal open={true} onRetry={vi.fn()} onClose={vi.fn()} retrying={true} />);
    expect(screen.getByRole("button", { name: /Retry/i })).toBeDisabled();
  });
});
