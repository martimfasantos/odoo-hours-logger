import { useState } from "react";
import { X } from "lucide-react";
import { api } from "../api/client";
import type { OdooRef, ProposedEntry } from "../api/types";
import { assignByKeyword, planRuleSave } from "../lib/rules";
import { rowKey } from "../lib/rows";
import { useLogHours } from "../state/LogHoursContext";
import { useToast } from "./Toast";
import Button from "./Button";

/**
 * Table row under a manually mapped event offering to save the pick as a
 * mapping rule, then applying it to the other unassigned rows already loaded.
 */
export default function SaveRulePrompt({
  entry,
  contract,
  colSpan,
  onClose,
}: {
  entry: ProposedEntry;
  contract: OdooRef;
  colSpan: number;
  onClose: () => void;
}) {
  const toast = useToast();
  const { proposals, setRows, setDismissedRulePrompts } = useLogHours();
  const [keyword, setKeyword] = useState(entry.event.title);
  const [saving, setSaving] = useState(false);
  const trimmed = keyword.trim();

  async function save() {
    setSaving(true);
    try {
      const plan = planRuleSave(await api.listRules(), trimmed, contract);
      if (plan.kind === "create") {
        await api.createRule(plan.payload);
        toast.success("Rule saved");
      } else if (plan.kind === "update") {
        await api.updateRule(plan.id, plan.payload);
        toast.success(`Keyword added to ${plan.payload.name}`);
      } else {
        toast.info(`${plan.name} already has that keyword`);
      }
      setRows((prev) => assignByKeyword(proposals, prev, trimmed, contract.id));
      onClose();
    } catch (e) {
      toast.error(`Failed to save rule: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  function dismiss() {
    setDismissedRulePrompts((prev) => new Set(prev).add(rowKey(entry)));
    onClose();
  }

  return (
    <tr className="rule-prompt-row">
      <td colSpan={colSpan}>
        <form
          className="rule-prompt"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <span>Always map events like</span>
          <input
            type="text"
            className="input input--cell rule-prompt__keyword"
            aria-label="Rule keyword"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          <span>
            to <strong>{contract.name}</strong>?
          </span>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            loading={saving}
            disabled={!trimmed}
          >
            Save rule
          </Button>
          <Button size="sm" aria-label="Dismiss rule suggestion" onClick={dismiss}>
            <X size={14} aria-hidden="true" />
          </Button>
        </form>
      </td>
    </tr>
  );
}
