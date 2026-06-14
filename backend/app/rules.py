import json
from pathlib import Path

from app.schemas import Rule, RuleCreate


class RulesStore:
    def __init__(self, path: Path):
        self.path = Path(path)

    def _load_raw(self) -> list[dict]:
        if not self.path.exists():
            return []
        try:
            return json.loads(self.path.read_text())
        except (json.JSONDecodeError, ValueError):
            return []

    def _save_raw(self, items: list[dict]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(items, indent=2, default=str))

    def list(self) -> list[Rule]:
        rules: list[Rule] = []
        for item in self._load_raw():
            try:
                rules.append(Rule(**item))
            except (TypeError, ValueError):
                # Skip stale/old-shaped records so a legacy rules.json
                # doesn't crash the whole listing.
                continue
        return rules

    def create(self, data: RuleCreate) -> Rule:
        items = self._load_raw()
        next_id = max((item["id"] for item in items), default=0) + 1
        rule = Rule(id=next_id, **data.model_dump())
        items.append(rule.model_dump())
        self._save_raw(items)
        return rule

    def update(self, rule_id: int, data: RuleCreate) -> Rule:
        items = self._load_raw()
        for idx, item in enumerate(items):
            if item["id"] == rule_id:
                updated = Rule(id=rule_id, **data.model_dump())
                items[idx] = updated.model_dump()
                self._save_raw(items)
                return updated
        raise KeyError(f"Rule {rule_id} not found")

    def delete(self, rule_id: int) -> None:
        items = [i for i in self._load_raw() if i["id"] != rule_id]
        self._save_raw(items)
