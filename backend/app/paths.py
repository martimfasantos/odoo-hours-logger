"""Runtime path resolution.

Resolves where the app reads/writes its config (`.env`) and data, and where the
built frontend lives — differing between running from source (development) and
running inside a PyInstaller bundle (the packaged macOS app).
"""
import sys
from pathlib import Path

APP_NAME = "Odoo Hours Logger"


def is_frozen() -> bool:
    """True when running inside a PyInstaller bundle."""
    return bool(getattr(sys, "frozen", False))


def app_data_dir() -> Path:
    """Directory holding `.env` and the `data/` store.

    - Bundled: ``~/Library/Application Support/Odoo Hours Logger``.
    - From source: the ``backend/`` directory (so dev/tests keep using
      ``backend/.env`` and ``backend/data/`` exactly as before).
    """
    if is_frozen():
        return Path.home() / "Library" / "Application Support" / APP_NAME
    return Path(__file__).resolve().parent.parent


def frontend_dist_dir() -> Path | None:
    """Built SPA directory if present, else ``None``.

    - Bundled: ``<_MEIPASS>/frontend_dist``.
    - From source: ``<repo>/frontend/dist``.
    Returns ``None`` when there is no built ``index.html`` (e.g. dev with Vite).
    """
    if is_frozen():
        candidate = Path(getattr(sys, "_MEIPASS", "")) / "frontend_dist"
    else:
        candidate = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
    return candidate if (candidate / "index.html").exists() else None


def ensure_app_dirs() -> None:
    """Create the data directory if missing (idempotent)."""
    (app_data_dir() / "data").mkdir(parents=True, exist_ok=True)
