import { useEffect, useRef, useState } from "react";
import { Plus, Pencil, Trash2, X, Check } from "lucide-react";
import { api } from "../api/client";
import type { OdooRef, Rule, RuleCreate } from "../api/types";
import { useToast } from "../components/Toast";
import Button from "../components/Button";
import Badge from "../components/Badge";
import Spinner from "../components/Spinner";
import { PALETTE, colorForContract } from "../lib/colors";

interface FormState {
  name: string;
  keywords: string;
  contract_id: number | null;
  contract_name: string;
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
  active: true,
};

export default function MappingRules() {
  const toast = useToast();

  const [rules, setRules] = useState<Rule[]>([]);
  const [contracts, setContracts] = useState<OdooRef[]>([]);
  const [colors, setColors] = useState<Record<string, string>>({});
  const [loadingRules, setLoadingRules] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});

  // Filter words state
  const [ignoreKeywords, setIgnoreKeywords] = useState<string[]>([]);
  const [newWord, setNewWord] = useState("");
  const [savingIgnore, setSavingIgnore] = useState(false);
  const newWordInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchRules();
    api
      .contracts()
      .then(setContracts)
      .catch((e) => toast.error(`Failed to load contracts: ${String(e)}`));
    api
      .getIgnoreKeywords()
      .then(setIgnoreKeywords)
      .catch((e) => toast.error(`Failed to load filter words: ${String(e)}`));
    api
      .getColors()
      .then(setColors)
      .catch(() => setColors({}));
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

  async function handleSetColor(contractId: number, hex: string) {
    const key = String(contractId);
    const prev = colors[key];
    setColors((c) => ({ ...c, [key]: hex }));
    try {
      const updated = await api.setColor(contractId, hex);
      setColors(updated);
    } catch (e) {
      setColors((c) => {
        const next = { ...c };
        if (prev === undefined) delete next[key];
        else next[key] = prev;
        return next;
      });
      toast.error(`Failed to save color: ${String(e)}`);
    }
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
      active: rule.active,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetForm() {
    setEditId(null);
    setForm(EMPTY_FORM);
    setErrors({});
  }

  async function handleAddWord() {
    const word = newWord.trim();
    if (!word) return;
    const alreadyPresent = ignoreKeywords.some(
      (w) => w.toLowerCase() === word.toLowerCase(),
    );
    if (alreadyPresent) {
      setNewWord("");
      return;
    }
    setSavingIgnore(true);
    try {
      const saved = await api.setIgnoreKeywords([...ignoreKeywords, word]);
      setIgnoreKeywords(saved);
      setNewWord("");
    } catch (e) {
      toast.error(`Failed to save filter words: ${String(e)}`);
    } finally {
      setSavingIgnore(false);
    }
  }

  async function handleRemoveWord(word: string) {
    setSavingIgnore(true);
    try {
      const saved = await api.setIgnoreKeywords(
        ignoreKeywords.filter((w) => w !== word),
      );
      setIgnoreKeywords(saved);
    } catch (e) {
      toast.error(`Failed to save filter words: ${String(e)}`);
    } finally {
      setSavingIgnore(false);
    }
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

              {/* Color */}
              <div className="field field--full">
                <label className="field__label">Color</label>
                {form.contract_id == null ? (
                  <p className="field__hint">Select a contract first</p>
                ) : (
                  <div className="color-palette" role="group" aria-label="Contract color palette">
                    {PALETTE.map((hex) => {
                      const isSelected =
                        colorForContract(form.contract_id, colors) === hex;
                      return (
                        <button
                          key={hex}
                          type="button"
                          className={`color-swatch${isSelected ? " color-swatch--selected" : ""}`}
                          style={{ background: hex }}
                          aria-label={`Set color ${hex}`}
                          aria-pressed={isSelected}
                          onClick={() => handleSetColor(form.contract_id!, hex)}
                        >
                          {isSelected && (
                            <Check size={10} aria-hidden="true" className="color-swatch__check" />
                          )}
                        </button>
                      );
                    })}
                    <label className="color-swatch color-swatch--custom" aria-label="Custom color">
                      <span className="sr-only">Custom color</span>
                      <input
                        type="color"
                        className="color-swatch__input"
                        value={colorForContract(form.contract_id, colors)}
                        onChange={(e) =>
                          handleSetColor(form.contract_id!, e.target.value)
                        }
                        aria-label="Custom color"
                        title="Pick a custom color"
                      />
                    </label>
                  </div>
                )}
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

      {/* Filter words card */}
      <section className="card" aria-label="Filter words">
        <div className="card__head">
          <h3>Filter words</h3>
          {savingIgnore && <Spinner />}
        </div>
        <div className="card__pad">
          <p className="page__subtitle" style={{ marginBottom: "var(--space-4)" }}>
            Calendar events whose title contains any of these words are skipped on
            import (e.g. &ldquo;Out of Office&rdquo;, &ldquo;Lunch&rdquo;).
          </p>

          {ignoreKeywords.length > 0 && (
            <div className="filter-words__chips" style={{ marginBottom: "var(--space-4)" }}>
              {ignoreKeywords.map((word) => (
                <span key={word} className="filter-chip">
                  <span className="filter-chip__label">{word}</span>
                  <button
                    type="button"
                    className="filter-chip__remove"
                    aria-label={`Remove filter word "${word}"`}
                    disabled={savingIgnore}
                    onClick={() => handleRemoveWord(word)}
                  >
                    <X size={12} aria-hidden="true" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="filter-words__add">
            <label className="field__label" htmlFor="filter-word-input">
              Add a word
            </label>
            <div className="filter-words__row">
              <input
                id="filter-word-input"
                ref={newWordInputRef}
                type="text"
                className="input"
                value={newWord}
                placeholder="e.g. Out of Office"
                disabled={savingIgnore}
                onChange={(e) => setNewWord(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleAddWord();
                  }
                }}
              />
              <Button
                variant="primary"
                size="sm"
                disabled={savingIgnore || !newWord.trim()}
                loading={savingIgnore}
                onClick={() => void handleAddWord()}
              >
                {!savingIgnore && <Plus size={14} aria-hidden="true" />}
                Add
              </Button>
            </div>
          </div>
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
