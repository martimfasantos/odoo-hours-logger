import { useEffect } from "react";
import { KeyRound } from "lucide-react";
import Button from "./Button";

interface OdooAuthModalProps {
  open: boolean;
  /** Close the modal (scrim click, Dismiss button, or Esc). */
  onClose: () => void;
}

/**
 * Shown when Odoo sign-in fails: no login/API key is set yet, or Odoo rejected
 * the key. Points to the API key guide in Settings.
 */
export default function OdooAuthModal({ open, onClose }: OdooAuthModalProps) {
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
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="odoo-auth-modal-title"
        aria-describedby="odoo-auth-modal-body"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal__head">
          <span className="modal__icon" aria-hidden="true">
            <KeyRound size={20} />
          </span>
          <h2 className="modal__title" id="odoo-auth-modal-title">
            Odoo sign-in failed
          </h2>
        </div>
        <div className="modal__body" id="odoo-auth-modal-body">
          <p style={{ margin: 0 }}>
            The app signs in to Odoo with your login and an API key. Either none
            is set yet, or Odoo rejected the key (it may have been deleted or
            mistyped). Create a key and paste it into{" "}
            <b>Settings → Odoo API key</b>, then <b>Save</b>. Settings has a
            step-by-step guide under <b>How to get an Odoo API key</b>.
          </p>
        </div>
        <div className="modal__actions">
          <Button variant="secondary" onClick={onClose}>
            Dismiss
          </Button>
          <a
            className="btn btn--primary"
            href="/settings"
            onClick={onClose}
            style={{ textDecoration: "none" }}
          >
            Open Settings
          </a>
        </div>
      </div>
    </div>
  );
}
