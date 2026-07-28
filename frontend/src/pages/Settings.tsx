import { useEffect, useState } from "react";
import { Check, X, Eye, EyeOff, Save } from "lucide-react";
import { api } from "../api/client";
import type { ConfigValues } from "../api/types";
import { useToast } from "../components/Toast";
import Button from "../components/Button";
import Spinner from "../components/Spinner";
import VpnModal from "../components/VpnModal";
import { isUnreachableError } from "../lib/errors";

type ConnectionStatus = "idle" | "loading" | "done";

interface TestResult {
  odoo: boolean;
  calendar: boolean;
  errors: Record<string, string>;
}

// String fields that are masked (password type by default)
const MASKED_STRING_FIELDS: (keyof ConfigValues)[] = [
  "GOOGLE_CALENDAR_URL",
  "ODOO_URL",
  "ODOO_DB",
  "ODOO_SESSION_ID",
  "ODOO_VISITOR_UUID",
  "ODOO_USER_ID",
  "ODOO_NETWORK_MEMBER_ID",
  "LOCAL_TZ",
  "USER_EMAIL",
];

const FIELD_LABELS: Record<string, string> = {
  GOOGLE_CALENDAR_URL: "Google Calendar URL",
  ODOO_URL: "Odoo URL",
  ODOO_DB: "Odoo Database",
  ODOO_SESSION_ID: "Odoo Session ID",
  ODOO_VISITOR_UUID: "Odoo Visitor UUID",
  ODOO_USER_ID: "Odoo User ID",
  ODOO_NETWORK_MEMBER_ID: "Odoo Network Member ID",
  LOCAL_TZ: "Local Timezone",
  USER_EMAIL: "User Email",
  DEMO_MODE: "Demo Mode",
};

// Form state uses strings for all fields (numbers stored as string, bool stored as bool)
interface ConfigFormState {
  GOOGLE_CALENDAR_URL: string;
  ODOO_URL: string;
  ODOO_DB: string;
  ODOO_SESSION_ID: string;
  ODOO_VISITOR_UUID: string;
  ODOO_USER_ID: string;
  ODOO_NETWORK_MEMBER_ID: string;
  LOCAL_TZ: string;
  USER_EMAIL: string;
  DEMO_MODE: boolean;
}

const EMPTY_FORM: ConfigFormState = {
  GOOGLE_CALENDAR_URL: "",
  ODOO_URL: "",
  ODOO_DB: "",
  ODOO_SESSION_ID: "",
  ODOO_VISITOR_UUID: "",
  ODOO_USER_ID: "",
  ODOO_NETWORK_MEMBER_ID: "",
  LOCAL_TZ: "",
  USER_EMAIL: "",
  DEMO_MODE: false,
};

function configToForm(cfg: ConfigValues): ConfigFormState {
  return {
    GOOGLE_CALENDAR_URL: cfg.GOOGLE_CALENDAR_URL,
    ODOO_URL: cfg.ODOO_URL,
    ODOO_DB: cfg.ODOO_DB,
    ODOO_SESSION_ID: cfg.ODOO_SESSION_ID,
    ODOO_VISITOR_UUID: cfg.ODOO_VISITOR_UUID,
    ODOO_USER_ID: cfg.ODOO_USER_ID !== null ? String(cfg.ODOO_USER_ID) : "",
    ODOO_NETWORK_MEMBER_ID:
      cfg.ODOO_NETWORK_MEMBER_ID !== null
        ? String(cfg.ODOO_NETWORK_MEMBER_ID)
        : "",
    LOCAL_TZ: cfg.LOCAL_TZ,
    USER_EMAIL: cfg.USER_EMAIL,
    DEMO_MODE: cfg.DEMO_MODE,
  };
}

function formToPayload(form: ConfigFormState): Partial<ConfigValues> {
  return {
    GOOGLE_CALENDAR_URL: form.GOOGLE_CALENDAR_URL,
    ODOO_URL: form.ODOO_URL,
    ODOO_DB: form.ODOO_DB,
    ODOO_SESSION_ID: form.ODOO_SESSION_ID,
    ODOO_VISITOR_UUID: form.ODOO_VISITOR_UUID,
    ODOO_USER_ID:
      form.ODOO_USER_ID.trim() !== "" ? Number(form.ODOO_USER_ID) : null,
    ODOO_NETWORK_MEMBER_ID:
      form.ODOO_NETWORK_MEMBER_ID.trim() !== ""
        ? Number(form.ODOO_NETWORK_MEMBER_ID)
        : null,
    LOCAL_TZ: form.LOCAL_TZ,
    USER_EMAIL: form.USER_EMAIL,
    DEMO_MODE: form.DEMO_MODE,
  };
}

export default function Settings() {
  const toast = useToast();

  // Connection test state
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [result, setResult] = useState<TestResult | null>(null);

  // Config form state
  const [form, setForm] = useState<ConfigFormState>(EMPTY_FORM);
  const [configLoading, setConfigLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Per-field visibility (eye toggle) — true means revealed (type=text)
  const [revealed, setRevealed] = useState<Partial<Record<keyof ConfigValues, boolean>>>({});

  // VPN modal
  const [vpnOpen, setVpnOpen] = useState(false);

  useEffect(() => {
    setConfigLoading(true);
    api
      .getConfig()
      .then((cfg) => setForm(configToForm(cfg)))
      .catch((e) => toast.error(`Failed to load configuration: ${String(e)}`))
      .finally(() => setConfigLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function testConnection() {
    setStatus("loading");
    try {
      const data = await api.testConnection();
      setResult(data);
      setStatus("done");
      if (data.odoo && data.calendar) {
        toast.success("All connections OK.");
      } else {
        toast.error("One or more connections failed.");
        if (data.odoo_unreachable) {
          setVpnOpen(true);
        }
      }
    } catch (err) {
      toast.error(`Connection test failed: ${String(err)}`);
      setStatus("done");
      setResult({
        odoo: false,
        calendar: false,
        errors: { odoo: String(err), calendar: String(err) },
      });
      if (isUnreachableError(err)) {
        setVpnOpen(true);
      }
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await api.saveConfig(formToPayload(form));
      setForm(configToForm(updated));
      toast.success("Settings saved.");
    } catch (e) {
      toast.error(`Failed to save settings: ${String(e)}`);
      if (isUnreachableError(e)) {
        setVpnOpen(true);
      }
    } finally {
      setSaving(false);
    }
  }

  function toggleReveal(field: keyof ConfigValues) {
    setRevealed((prev) => ({ ...prev, [field]: !prev[field] }));
  }

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <h1 className="page__title">Settings</h1>
          <p className="page__subtitle">
            Verify backend connectivity and edit configuration.
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

              {/* Google Calendar row */}
              <div className="conn-row">
                <span className="conn-row__name">Google Calendar</span>
                {result.calendar ? (
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
                {result.errors.calendar && (
                  <p className="conn-error">{result.errors.calendar}</p>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Configuration form card */}
      <section className="card" aria-label="Configuration">
        <div className="card__head">
          <h3>Configuration</h3>
          {configLoading && <Spinner />}
        </div>
        <div className="card__pad">
          <p className="field-reveal__note">
            Changes are saved to <code>backend/.env</code> and applied
            immediately. Update <code>ODOO_SESSION_ID</code> here when your
            session expires.
          </p>
          <details className="field-reveal__note">
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>
              How to get a fresh session ID
            </summary>
            <ol style={{ margin: "8px 0 0", paddingLeft: "20px", lineHeight: 1.6 }}>
              <li>Open Odoo in your browser and log in (VPN on).</li>
              <li>
                Open DevTools (<kbd>⌥⌘I</kbd>) → <b>Application</b> →{" "}
                <b>Cookies</b> → your Odoo domain.
              </li>
              <li>
                Copy the value of the <code>session_id</code> cookie.
              </li>
              <li>
                Paste it into the <b>Odoo Session ID</b> field below, then{" "}
                <b>Save settings</b>.
              </li>
            </ol>
          </details>
          <form onSubmit={handleSave} noValidate>
            <div className="config-form">
              {MASKED_STRING_FIELDS.map((fieldKey) => {
                const key = fieldKey as keyof ConfigFormState;
                const isRevealed = !!revealed[fieldKey];
                const label = FIELD_LABELS[fieldKey] ?? fieldKey;
                const inputId = `cfg-${fieldKey}`;
                return (
                  <div className="field field--full" key={fieldKey}>
                    <label className="field__label" htmlFor={inputId}>
                      {label}
                    </label>
                    <div className="field-reveal">
                      <input
                        id={inputId}
                        type={isRevealed ? "text" : "password"}
                        className="input field-reveal__input"
                        value={form[key] as string}
                        autoComplete="off"
                        spellCheck={false}
                        disabled={configLoading}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, [key]: e.target.value }))
                        }
                      />
                      <button
                        type="button"
                        className="field-reveal__eye"
                        aria-label={
                          isRevealed ? `Hide ${fieldKey}` : `Show ${fieldKey}`
                        }
                        onClick={() => toggleReveal(fieldKey)}
                        tabIndex={0}
                      >
                        {isRevealed ? (
                          <EyeOff size={16} aria-hidden="true" />
                        ) : (
                          <Eye size={16} aria-hidden="true" />
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* DEMO_MODE toggle */}
              <div className="field field--full">
                <label className="toggle" htmlFor="cfg-DEMO_MODE">
                  <input
                    id="cfg-DEMO_MODE"
                    type="checkbox"
                    className="checkbox"
                    checked={form.DEMO_MODE}
                    disabled={configLoading}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, DEMO_MODE: e.target.checked }))
                    }
                  />
                  {FIELD_LABELS["DEMO_MODE"]}
                </label>
              </div>

              <div className="form-actions">
                <Button
                  type="submit"
                  variant="primary"
                  loading={saving}
                  disabled={saving || configLoading}
                >
                  {!saving && <Save size={16} aria-hidden="true" />}
                  Save settings
                </Button>
              </div>
            </div>
          </form>
        </div>
      </section>

      <VpnModal
        open={vpnOpen}
        onClose={() => setVpnOpen(false)}
        onRetry={() => {
          setVpnOpen(false);
          void testConnection();
        }}
      />
    </div>
  );
}
