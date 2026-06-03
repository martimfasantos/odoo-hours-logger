import json
from datetime import datetime
from pathlib import Path
from typing import Optional


def _key(uid: str, start: datetime) -> str:
    return f"{uid}|{start.isoformat()}"


class Ledger:
    def __init__(self, path: Path):
        self.path = Path(path)

    def _load(self) -> list[dict]:
        if not self.path.exists():
            return []
        try:
            return json.loads(self.path.read_text())
        except (json.JSONDecodeError, ValueError):
            return []

    def _save(self, items: list[dict]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(items, indent=2, default=str))

    def _keys(self) -> set[str]:
        return {f"{i['event_uid']}|{i['event_start']}" for i in self._load()}

    def is_logged(self, uid: str, start: datetime) -> bool:
        return _key(uid, start) in self._keys()

    def record(self, uid: str, start: datetime, odoo_line_id: int,
               project_id: int, task_id: Optional[int], hours: float,
               pushed_at: str) -> None:
        items = self._load()
        items.append({
            "event_uid": uid,
            "event_start": start.isoformat(),
            "odoo_line_id": odoo_line_id,
            "project_id": project_id,
            "task_id": task_id,
            "hours": hours,
            "pushed_at": pushed_at,
        })
        self._save(items)
