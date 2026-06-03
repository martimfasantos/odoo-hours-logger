import { useState } from "react";
import { Check, X, Info } from "lucide-react";
import { api } from "../api/client";
import { useToast } from "../components/Toast";
import Button from "../components/Button";

type ConnectionStatus = "idle" | "loading" | "done";

interface TestResult {
  odoo: boolean;
  ical: boolean;
  errors: Record<string, string>;
}

const ENV_VARS = [
  "ICAL_URL",
  "ODOO_URL",
  "ODOO_DB",
  "ODOO_USERNAME",
  "ODOO_API_KEY",
  "LOCAL_TZ",
  "USER_EMAIL",
];

export default function Settings() {
  const toast = useToast();
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [result, setResult] = useState<TestResult | null>(null);

  async function testConnection() {
    setStatus("loading");
    try {
      const data = await api.testConnection();
      setResult(data);
      setStatus("done");
      if (data.odoo && data.ical) {
        toast.success("All connections OK.");
      } else {
        toast.error("One or more connections failed.");
      }
    } catch (err) {
      toast.error(`Connection test failed: ${String(err)}`);
      setStatus("done");
      setResult({ odoo: false, ical: false, errors: { odoo: String(err), ical: String(err) } });
    }
  }

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <h1 className="page__title">Settings</h1>
          <p className="page__subtitle">
            Verify backend connectivity and review configuration.
          </p>
        </div>
      </header>

      {/* Connection test card */}
      <section className="card" aria-label="Connection status">
        <div className="card__head">
          <h3>Connection test</h3>
          <Button
            variant="primary"
            loading={status === "loading"}
            disabled={status === "loading"}
            onClick={testConnection}
          >
            {status !== "loading" && <Check size={16} aria-hidden="true" />}
            Test connection
          </Button>
        </div>
        <div className="card__pad">
          {status === "idle" && (
            <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
              Not tested yet. Click the button above to check connectivity.
            </p>
          )}

          {status === "loading" && (
            <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
              Testing connections…
            </p>
          )}

          {status === "done" && result && (
            <div>
              {/* Odoo row */}
              <div className="conn-row">
                <span className="conn-row__name">Odoo</span>
                {result.odoo ? (
                  <span className="conn-row__status conn-row__status--ok">
                    <Check size={16} aria-hidden="true" />
                    Connected
                  </span>
                ) : (
                  <span className="conn-row__status conn-row__status--err">
                    <X size={16} aria-hidden="true" />
                    Unreachable
                  </span>
                )}
                {result.errors.odoo && (
                  <p className="conn-error">{result.errors.odoo}</p>
                )}
              </div>

              {/* iCal row */}
              <div className="conn-row">
                <span className="conn-row__name">iCal</span>
                {result.ical ? (
                  <span className="conn-row__status conn-row__status--ok">
                    <Check size={16} aria-hidden="true" />
                    Connected
                  </span>
                ) : (
                  <span className="conn-row__status conn-row__status--err">
                    <X size={16} aria-hidden="true" />
                    Unreachable
                  </span>
                )}
                {result.errors.ical && (
                  <p className="conn-error">{result.errors.ical}</p>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Configuration info card */}
      <section className="card" aria-label="Configuration information">
        <div className="card__head">
          <h3>Configuration</h3>
        </div>
        <div className="card__pad">
          <div className="info-note">
            <Info size={18} aria-hidden="true" />
            <div>
              <p style={{ margin: "0 0 8px 0" }}>
                All configuration lives in <code style={{ fontFamily: "var(--font-mono)", fontSize: "0.85em", background: "var(--color-muted)", padding: "1px 6px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)" }}>backend/.env</code>.
                Values are never shown here for security. Set the following
                environment variables in that file:
              </p>
              <ul className="env-list">
                {ENV_VARS.map((v) => (
                  <li key={v}>
                    <code>{v}</code>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
