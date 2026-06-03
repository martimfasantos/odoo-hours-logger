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
  project_id: number | null;
  project_name: string;
  task_id: number | null;
  task_name: string;
  priority: number;
  active: boolean;
}

interface FormErrors {
  name?: string;
  keywords?: string;
  project_id?: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  keywords: "",
  project_id: null,
  project_name: "",
  task_id: null,
  task_name: "",
  priority: 100,
  active: true,
};

export default function MappingRules() {
  const toast = useToast();

  const [rules, setRules] = useState<Rule[]>([]);
  const [projects, setProjects] = useState<OdooRef[]>([]);
  const [tasks, setTasks] = useState<OdooRef[]>([]);
  const [loadingRules, setLoadingRules] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});

  useEffect(() => {
    fetchRules();
    api
      .projects()
      .then(setProjects)
      .catch((e) => toast.error(`Failed to load projects: ${String(e)}`));
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

  async function loadTasks(projectId: number) {
    setLoadingTasks(true);
    setTasks([]);
    try {
      const data = await api.tasks(projectId);
      setTasks(data);
    } catch (e) {
      toast.error(`Failed to load tasks: ${String(e)}`);
    } finally {
      setLoadingTasks(false);
    }
  }

  function handleProjectChange(value: string) {
    const proj = projects.find((p) => p.id === Number(value));
    setForm((f) => ({
      ...f,
      project_id: proj ? proj.id : null,
      project_name: proj ? proj.name : "",
      task_id: null,
      task_name: "",
    }));
    setTasks([]);
    if (proj) loadTasks(proj.id);
  }

  function handleTaskChange(value: string) {
    const task = tasks.find((t) => t.id === Number(value));
    setForm((f) => ({
      ...f,
      task_id: task ? task.id : null,
      task_name: task ? task.name : "",
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
    if (!form.project_id) errs.project_id = "A project is required.";
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
      project_id: form.project_id!,
      project_name: form.project_name,
      task_id: form.task_id,
      task_name: form.task_name || null,
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
      project_id: rule.project_id,
      project_name: rule.project_name,
      task_id: rule.task_id,
      task_name: rule.task_name ?? "",
      priority: rule.priority,
      active: rule.active,
    });
    setTasks([]);
    if (rule.project_id) loadTasks(rule.project_id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetForm() {
    setEditId(null);
    setForm(EMPTY_FORM);
    setErrors({});
    setTasks([]);
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
            Keywords matched against calendar events to suggest Odoo projects and tasks.
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

              {/* Project */}
              <div className="field">
                <label className="field__label" htmlFor="rule-project">
                  Project
                </label>
                <select
                  id="rule-project"
                  className={`select${errors.project_id ? " select--invalid" : ""}`}
                  value={form.project_id ?? ""}
                  onChange={(e) => handleProjectChange(e.target.value)}
                >
                  <option value="">— Select project —</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                {errors.project_id && (
                  <span className="field__error">{errors.project_id}</span>
                )}
              </div>

              {/* Task */}
              <div className="field">
                <label className="field__label" htmlFor="rule-task">
                  Task <span style={{ fontWeight: 400 }}>(optional)</span>
                </label>
                <select
                  id="rule-task"
                  className="select"
                  value={form.task_id ?? ""}
                  disabled={!form.project_id || loadingTasks}
                  onChange={(e) => handleTaskChange(e.target.value)}
                >
                  <option value="">— No task —</option>
                  {tasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                {loadingTasks && (
                  <span className="muted" style={{ fontSize: "0.8rem", marginTop: 2 }}>
                    Loading tasks…
                  </span>
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
                  <th>Project</th>
                  <th>Task</th>
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
                    <td>{rule.project_name}</td>
                    <td className="muted">{rule.task_name ?? "—"}</td>
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
