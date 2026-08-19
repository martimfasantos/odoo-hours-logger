import { useEffect } from "react";
import { KeyRound } from "lucide-react";
import Button from "./Button";

interface SessionExpiredModalProps {
  open: boolean;
  /** Close the modal (scrim click, Dismiss button, or Esc). */
  onClose: () => void;
}

/**
 * Shown when the Odoo session cookie has expired. Odoo has no API keys, so auth
 * reuses your browser login — which expires periodically. Explains how to grab a
 * fresh `session_id` and links to the Settings tab to paste it in.
 */
export default function SessionExpiredModal({
  open,
  onClose,
}: SessionExpiredModalProps) {
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
        aria-labelledby="session-modal-title"
        aria-describedby="session-modal-body"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal__head">
          <span className="modal__icon" aria-hidden="true">
            <KeyRound size={20} />
          </span>
          <h2 className="modal__title" id="session-modal-title">
            Odoo session expired
          </h2>
        </div>
        <div className="modal__body" id="session-modal-body">
          <p style={{ margin: "0 0 12px" }}>
            Your Odoo session has expired (Odoo has no API keys, so it reuses your
            browser login). Grab a fresh <code>session_id</code> and paste it into
            Settings:
          </p>
          <ol style={{ margin: 0, paddingLeft: "20px", lineHeight: 1.6 }}>
            <li>Open Odoo in your browser and log in (VPN on).</li>
            <li>
              Open DevTools (<kbd>⌥⌘I</kbd>) → <b>Application</b> → <b>Cookies</b> →
              your Odoo domain.
            </li>
            <li>
              Copy the value of the <code>session_id</code> cookie.
            </li>
            <li>
              Paste it into <b>Settings → Odoo Session ID</b>, then <b>Save</b>.
            </li>
          </ol>
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
