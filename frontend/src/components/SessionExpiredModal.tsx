import { useEffect } from "react";
import { KeyRound } from "lucide-react";
import Button from "./Button";

interface SessionExpiredModalProps {
  open: boolean;
  /** Odoo rejected the configured API key, rather than an expired session cookie. */
  apiKey?: boolean;
  /** Close the modal (scrim click, Dismiss button, or Esc). */
  onClose: () => void;
}

/**
 * Shown when Odoo rejects our credentials. For an expired session cookie it
 * explains how to grab a fresh `session_id`; for a rejected API key it points to
 * creating a new key. Both link to the Settings tab.
 */
export default function SessionExpiredModal({
  open,
  apiKey = false,
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
            {apiKey ? "Odoo API key rejected" : "Odoo session expired"}
          </h2>
        </div>
        <div className="modal__body" id="session-modal-body">
          {apiKey ? (
            <p style={{ margin: 0 }}>
              Odoo rejected your API key (it may have been deleted or mistyped).
              Create a new one and paste it into <b>Settings → Odoo API key</b>,
              then <b>Save</b>. Settings has a step-by-step guide under{" "}
              <b>How to get an Odoo API key</b>.
            </p>
          ) : (
            <>
              <p style={{ margin: "0 0 12px" }}>
                Your Odoo session has expired. Grab a fresh <code>session_id</code>{" "}
                and paste it into Settings (or set up an Odoo API key there, which
                does not expire):
              </p>
              <ol style={{ margin: 0, paddingLeft: "20px", lineHeight: 1.6 }}>
                <li>Open Odoo in your browser and log in (VPN on).</li>
                <li>
                  Open DevTools (<kbd>⌥⌘I</kbd>) → <b>Application</b> →{" "}
                  <b>Cookies</b> → your Odoo domain.
                </li>
                <li>
                  Copy the value of the <code>session_id</code> cookie.
                </li>
                <li>
                  Paste it into <b>Settings → Odoo Session ID</b>, then <b>Save</b>.
                </li>
              </ol>
            </>
          )}
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
