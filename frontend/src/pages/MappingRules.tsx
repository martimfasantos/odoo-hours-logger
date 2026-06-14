import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { api } from "../api/client";
import type { OdooRef, Rule, RuleCreate } from "../api/types";
import { useToast } from "../components/Toast";
import Button from "../components/Button";
import Badge from "../components/Badge";
import Spinner from "../components/Spinner";

interface FormState {
  name: string;
  keywords: string;
  contract_id: number | null;
  contract_name: string;
  priority: number;
  active: boolean;
}

interface FormErrors {
  name?: string;
  keywords?: string;
  contract_id?: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  keywords: "",
  contract_id: null,
  contract_name: "",
  priority: 100,
  active: true,
};

export default function MappingRules() {
  const toast = useToast();

  const [rules, setRules] = useState<Rule[]>([]);
  const [contracts, setContracts] = useState<OdooRef[]>([]);
  const [loadingRules, setLoadingRules] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});

  useEffect(() => {
    fetchRules();
    api
      .contracts()
      .then(setContracts)
      .catch((e) => toast.error(`Failed to load contracts: ${String(e)}`));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchRules() {
    setLoadingRules(true);
    try {
      const data = await api.listRules();
      setRules(data);
    } catch (e) {
      toast.error(`Failed to load rules: ${String(e)}`);
    } finally {
      setLoadingRules(false);
    }
  }

  function handleContractChange(value: string) {
    const contract = contracts.find((c) => c.id === Number(value));
    setForm((f) => ({
      ...f,
      contract_id: contract ? contract.id : null,
      contract_name: contract ? contract.name : "",
    }));
  }

  function validate(): boolean {
    const errs: FormErrors = {};
    if (!form.name.trim()) errs.name = "Name is required.";
    const kws = form.keywords
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
    if (kws.length === 0) errs.keywords = "At least one keyword is required.";
    if (!form.contract_id) errs.contract_id = "A contract is required.";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function buildPayload(): RuleCreate {
    const kws = form.keywords
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
    return {
      name: form.name.trim(),
      keywords: kws,
      contract_id: form.contract_id!,
      contract_name: form.contract_name,
      priority: form.priority,
      active: form.active,
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      if (editId !== null) {
        await api.updateRule(editId, buildPayload());
        toast.success("Rule updated.");
      } else {
        await api.createRule(buildPayload());
        toast.success("Rule created.");
      }
      resetForm();
      await fetchRules();
    } catch (err) {
      toast.error(`Failed to save rule: ${String(err)}`);
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(rule: Rule) {
    setEditId(rule.id);
    setErrors({});
    setForm({
      name: rule.name,
      keywords: rule.keywords.join(", "),
      contract_id: rule.contract_id,
      contract_name: rule.contract_name,
      priority: rule.priority,
      active: rule.active,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetForm() {
    setEditId(null);
    setForm(EMPTY_FORM);
    setErrors({});
  }

  async function handleDelete(id: number) {
    if (!window.confirm("Delete this rule? This cannot be undone.")) return;
    setDeletingId(id);
    try {
      await api.deleteRule(id);
      toast.success("Rule deleted.");
      await fetchRules();
    } catch (e) {
      toast.error(`Failed to delete rule: ${String(e)}`);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <h1 className="page__title">Mapping rules</h1>
          <p className="page__subtitle">
            Keywords matched against calendar events to suggest an Odoo contract.
          </p>
        </div>
      </header>

      {/* Form card */}
      <section className="card" aria-label={editId !== null ? "Edit rule" : "Create rule"}>
        <div className="card__head">
          <h3>{editId !== null ? "Edit rule" : "New rule"}</h3>
          {editId !== null && (
            <Button variant="secondary" size="sm" onClick={resetForm}>
              Cancel
            </Button>
          )}
        </div>
        <div className="card__pad">
          <form onSubmit={handleSubmit} noValidate>
            <div className="form-grid">
              {/* Name */}
              <div className="field field--full">
                <label className="field__label" htmlFor="rule-name">
                  Name
                </label>
                <input
                  id="rule-name"
                  type="text"
                  className={`input${errors.name ? " input--invalid" : ""}`}
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Client meetings"
                />
                {errors.name && (
                  <span className="field__error">{errors.name}</span>
                )}
              </div>

              {/* Keywords */}
              <div className="field field--full">
                <label className="field__label" htmlFor="rule-keywords">
                  Keywords <span style={{ fontWeight: 400 }}>(comma-separated)</span>
                </label>
                <input
                  id="rule-keywords"
                  type="text"
                  className={`input${errors.keywords ? " input--invalid" : ""}`}
                  value={form.keywords}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, keywords: e.target.value }))
                  }
                  placeholder="e.g. meeting, call, sync"
                />
                {errors.keywords && (
                  <span className="field__error">{errors.keywords}</span>
                )}
                {form.keywords.trim() && (
                  <div className="keyword-chips" style={{ marginTop: 4 }}>
                    {form.keywords
                      .split(",")
                      .map((k) => k.trim())
                      .filter(Boolean)
                      .map((kw) => (
                        <span key={kw} className="chip">{kw}</span>
                      ))}
                  </div>
                )}
              </div>

              {/* Contract */}
              <div className="field field--full">
                <label className="field__label" htmlFor="rule-contract">
                  Contract
                </label>
                <select
                  id="rule-contract"
                  className={`select${errors.contract_id ? " select--invalid" : ""}`}
                  title="Contract"
                  aria-label="Contract"
                  value={form.contract_id ?? ""}
                  onChange={(e) => handleContractChange(e.target.value)}
                >
                  <option value="">— Select contract —</option>
                  {contracts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                {errors.contract_id && (
                  <span className="field__error">{errors.contract_id}</span>
                )}
              </div>

              {/* Priority */}
              <div className="field">
                <label className="field__label" htmlFor="rule-priority">
                  Priority
                </label>
                <input
                  id="rule-priority"
                  type="number"
                  className="input"
                  value={form.priority}
                  min={1}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, priority: Number(e.target.value) }))
                  }
                />
              </div>

              {/* Active */}
              <div className="field" style={{ justifyContent: "flex-end" }}>
                <label className="toggle" htmlFor="rule-active">
                  <input
                    id="rule-active"
                    type="checkbox"
                    className="checkbox"
                    checked={form.active}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, active: e.target.checked }))
                    }
                  />
                  Active
                </label>
              </div>

              {/* Actions */}
              <div className="form-actions">
                <Button
                  type="submit"
                  variant="primary"
                  loading={submitting}
                  disabled={submitting}
                >
                  {!submitting && <Plus size={16} aria-hidden="true" />}
                  {editId !== null ? "Update rule" : "Create rule"}
                </Button>
                {editId !== null && (
                  <Button variant="secondary" onClick={resetForm}>
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          </form>
        </div>
      </section>

      {/* Rules table */}
      <section className="card" aria-label="Rules list">
        <div className="card__head">
          <h3>Rules</h3>
          {loadingRules && <Spinner />}
        </div>

        {!loadingRules && rules.length === 0 && (
          <div className="empty">
            <p>No mapping rules yet. Create one above.</p>
          </div>
        )}

        {rules.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Keywords</th>
                  <th>Contract</th>
                  <th className="num" style={{ width: 80 }}>Priority</th>
                  <th style={{ width: 90 }}>Status</th>
                  <th style={{ width: 120 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <tr key={rule.id}>
                    <td>{rule.name}</td>
                    <td>
                      <div className="keyword-chips">
                        {rule.keywords.map((kw) => (
                          <span key={kw} className="chip">{kw}</span>
                        ))}
                      </div>
                    </td>
                    <td>{rule.contract_name}</td>
                    <td className="num">{rule.priority}</td>
                    <td>
                      <Badge variant={rule.active ? "active" : "inactive"}>
                        {rule.active ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td>
                      <div className="actions-cell">
                        <Button
                          variant="secondary"
                          size="sm"
                          aria-label={`Edit ${rule.name}`}
                          onClick={() => startEdit(rule)}
                        >
                          <Pencil size={14} aria-hidden="true" />
                          Edit
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          aria-label={`Delete ${rule.name}`}
                          loading={deletingId === rule.id}
                          disabled={deletingId !== null}
                          onClick={() => handleDelete(rule.id)}
                        >
                          {deletingId !== rule.id && (
                            <Trash2 size={14} aria-hidden="true" />
                          )}
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
