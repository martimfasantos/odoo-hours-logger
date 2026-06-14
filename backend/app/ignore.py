import json
from pathlib import Path


class IgnoreStore:
    def __init__(self, path: Path):
        self.path = Path(path)

    def _load_raw(self) -> list[str]:
        if not self.path.exists():
            return []
        try:
            data = json.loads(self.path.read_text())
            if not isinstance(data, list):
                return []
            return [str(item) for item in data]
        except (json.JSONDecodeError, ValueError):
            return []

    def get(self) -> list[str]:
        return self._load_raw()

    def set(self, keywords: list[str]) -> list[str]:
        cleaned: list[str] = []
        seen: set[str] = set()
        for kw in keywords:
            stripped = kw.strip()
            if not stripped:
                continue
            lower = stripped.lower()
            if lower in seen:
                continue
            seen.add(lower)
            cleaned.append(stripped)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(cleaned, indent=2))
        return cleaned
