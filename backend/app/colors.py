import json
from pathlib import Path


class ColorStore:
    def __init__(self, path: Path):
        self.path = Path(path)

    def _load(self) -> dict:
        if not self.path.exists():
            return {}
        try:
            text = self.path.read_text()
            if not text.strip():
                return {}
            return json.loads(text)
        except (json.JSONDecodeError, ValueError):
            return {}

    def _save(self, data: dict) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(data, indent=2))

    def get_all(self) -> dict[str, str]:
        return self._load()

    def set(self, project_id: int, color: str) -> None:
        data = self._load()
        data[str(project_id)] = color
        self._save(data)
