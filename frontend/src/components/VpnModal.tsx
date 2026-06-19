import { useEffect } from "react";
import { WifiOff } from "lucide-react";
import Button from "./Button";

interface VpnModalProps {
  open: boolean;
  /** Re-run the connection check (and re-fetch contracts). */
  onRetry: () => void;
  /** Close the modal (scrim click, Dismiss button, or Esc). */
  onClose: () => void;
  /** Loading state for the Retry button. */
  retrying?: boolean;
}

/**
 * Centered modal shown when Odoo is unreachable — typically because the
 * company VPN is off. Clicking the scrim, pressing Esc, or clicking Dismiss
 * closes it; Retry re-runs the connection check.
 */
export default function VpnModal({
  open,
  onRetry,
  onClose,
  retrying = false,
}: VpnModalProps) {
  // Close on Esc while open.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="vpn-modal-title"
        aria-describedby="vpn-modal-body"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal__head">
          <span className="modal__icon" aria-hidden="true">
            <WifiOff size={20} />
          </span>
          <h2 className="modal__title" id="vpn-modal-title">
            Can&apos;t reach Odoo
          </h2>
        </div>
        <p className="modal__body" id="vpn-modal-body">
          Odoo isn&apos;t reachable. Please verify you&apos;re connected to the
          VPN, then try again.
        </p>
        <div className="modal__actions">
          <Button variant="secondary" onClick={onClose}>
            Dismiss
          </Button>
          <Button
            variant="primary"
            onClick={onRetry}
            loading={retrying}
            disabled={retrying}
          >
            Retry
          </Button>
        </div>
      </div>
    </div>
  );
}
