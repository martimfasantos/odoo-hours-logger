import json
from pathlib import Path


class ExcludedStore:
    """Persisted list of removed calendar occurrences.

    Each record is ``{uid, start, end, title, date}``, keyed on
    ``"{uid}|{start}"`` (matching the frontend's rowKey), so a removed event
    stays hidden across calendar re-syncs. Restorable from the Settings tab.
    """

    def __init__(self, path: Path):
        self.path = Path(path)

    def _load(self) -> list[dict]:
        if not self.path.exists():
            return []
        try:
            data = json.loads(self.path.read_text())
            if not isinstance(data, list):
                return []
            # Tolerate a legacy list-of-key-strings file by dropping non-records.
            return [r for r in data if isinstance(r, dict) and r.get("uid")]
        except (json.JSONDecodeError, ValueError):
            return []

    def _save(self, records: list[dict]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(records, indent=2))

    @staticmethod
    def _key(uid: str, start: str) -> str:
        return f"{uid}|{start}"

    def keys(self) -> set[str]:
        return {self._key(r["uid"], r["start"]) for r in self._load()}

    def list(self) -> list[dict]:
        return sorted(self._load(), key=lambda r: r.get("start", ""), reverse=True)

    def add(self, uid: str, start: str, end: str, title: str, date: str) -> None:
        target = self._key(uid, start)
        records = [r for r in self._load()
                   if self._key(r["uid"], r["start"]) != target]
        records.append({"uid": uid, "start": start, "end": end,
                        "title": title, "date": date})
        self._save(records)

    def remove(self, uid: str, start: str) -> None:
        target = self._key(uid, start)
        self._save([r for r in self._load()
                    if self._key(r["uid"], r["start"]) != target])
