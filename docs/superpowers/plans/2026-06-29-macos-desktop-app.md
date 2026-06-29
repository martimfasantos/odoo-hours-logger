# macOS Desktop App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package the existing FastAPI + React app as a double-clickable `Odoo Hours Logger.app` for macOS, with no terminal, repo, or two-server workflow required at runtime.

**Architecture:** In production the built SPA is served by FastAPI itself (single process) on a dynamic loopback port; a `pywebview` window wraps it in a native window; PyInstaller bundles Python + backend + built frontend into a `.app`. A new `paths.py` makes config/data live under `~/Library/Application Support/Odoo Hours Logger/` when bundled, while preserving today's `backend/.env` + `backend/data/` behavior when run from source.

**Tech Stack:** Python 3.12, FastAPI/uvicorn, Starlette `StaticFiles`, `pywebview` (system WebKit), `PyInstaller`; React/Vite (built to `frontend/dist/`).

## Global Constraints

- **Platform:** macOS only. No Windows/Linux, no signing/notarization, no `.dmg`, no auto-update.
- **Python:** `>=3.12`. Use the existing `backend/.venv`.
- **No regressions:** all existing tests must keep passing — backend **111** (pytest), frontend **116** (vitest).
- **Dev workflow untouched:** `run.sh` and the two-server dev setup keep working; `app.main:app` stays a plain importable ASGI app.
- **Secrets never baked into the bundle:** `.env` and `data/` live only in the user-writable App Support dir; the `.app` is read-only.
- **App identity:** name `Odoo Hours Logger`; bundle id `engineering.daredata.odoo-hours-logger`.
- **Window:** default `1280×860`, resizable, minimum `960×600`.
- **Port:** dynamically chosen free loopback port bound to `127.0.0.1` (never the hard-coded `8010`).
- **Scope:** no application-feature/integration/data-model changes.
- **Commits:** Conventional Commits; no Claude/co-author footer.

## File Structure

```
NEW  backend/app/paths.py             # app_data_dir(), is_frozen(), frontend_dist_dir(), ensure_app_dirs()
NEW  backend/app/spa.py               # SPAStaticFiles: serve built SPA + index.html fallback
NEW  backend/app/desktop.py           # pywebview launcher: free port, uvicorn thread, health wait, window
EDIT backend/app/config.py            # env_file + DATA_DIR default via app_data_dir()
EDIT backend/app/env_file.py          # ENV_PATH via app_data_dir()
EDIT backend/app/main.py              # startup ensure-dirs + mount SPA when built dist present
EDIT backend/pyproject.toml           # add `packaging` extra: pywebview, pyinstaller
NEW  packaging/desktop_entry.py       # PyInstaller entry point → app.desktop.main()
NEW  packaging/odoo-hours-logger.spec # PyInstaller spec → .app bundle
NEW  packaging/make_icns.sh           # frontend/public/favicon.svg → AppIcon.icns (best-effort)
NEW  build_app.sh                     # frontend build → icon → PyInstaller → seed App Support
EDIT .gitignore                       # ignore dist-app/, build-app/, packaging/AppIcon.icns, *.iconset
EDIT README.md                        # "Build the desktop app" + first-launch (Gatekeeper) section
NEW  backend/tests/test_paths.py      # path resolution + ensure_app_dirs
NEW  backend/tests/test_spa.py        # SPA static serving + fallback
NEW  backend/tests/test_desktop.py    # find_free_port + wait_for_health
EDIT backend/tests/test_config.py     # DATA_DIR default resolves under app_data_dir()
EDIT backend/tests/test_env_file.py   # ENV_PATH resolves under app_data_dir()
```

`spa.py` and `desktop.py` are separate small modules (rather than piling into `main.py`) so each has one responsibility and can be unit-tested in isolation.

---

### Task 1: `paths.py` — runtime path resolution

**Files:**
- Create: `backend/app/paths.py`
- Test: `backend/tests/test_paths.py`

**Interfaces:**
- Consumes: nothing (leaf module; only `sys`, `pathlib`).
- Produces:
  - `is_frozen() -> bool`
  - `app_data_dir() -> Path` — `~/Library/Application Support/Odoo Hours Logger` when frozen; the `backend/` dir when run from source.
  - `frontend_dist_dir() -> Path | None` — built SPA dir if `index.html` exists, else `None`.
  - `ensure_app_dirs() -> None` — creates `app_data_dir()/"data"`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_paths.py`:

```python
import sys
from pathlib import Path

from app import paths


def test_app_data_dir_dev_is_backend_dir():
    # From source, app_data_dir() is the backend/ directory (parent of app/).
    d = paths.app_data_dir()
    assert d.name == "backend"
    assert (d / "app" / "paths.py").exists()


def test_app_data_dir_frozen_is_application_support(tmp_path, monkeypatch):
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    monkeypatch.setattr(Path, "home", classmethod(lambda cls: tmp_path))
    expected = tmp_path / "Library" / "Application Support" / "Odoo Hours Logger"
    assert paths.app_data_dir() == expected


def test_frontend_dist_dir_frozen_returns_meipass_when_present(tmp_path, monkeypatch):
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    monkeypatch.setattr(sys, "_MEIPASS", str(tmp_path), raising=False)
    dist = tmp_path / "frontend_dist"
    dist.mkdir()
    (dist / "index.html").write_text("<!doctype html>")
    assert paths.frontend_dist_dir() == dist


def test_frontend_dist_dir_returns_none_when_no_index(tmp_path, monkeypatch):
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    monkeypatch.setattr(sys, "_MEIPASS", str(tmp_path), raising=False)
    (tmp_path / "frontend_dist").mkdir()  # no index.html
    assert paths.frontend_dist_dir() is None


def test_ensure_app_dirs_creates_data(tmp_path, monkeypatch):
    monkeypatch.setattr(paths, "app_data_dir", lambda: tmp_path)
    paths.ensure_app_dirs()
    assert (tmp_path / "data").is_dir()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `backend/.venv/bin/python -m pytest tests/test_paths.py -v` (from `backend/`)
Expected: FAIL — `ModuleNotFoundError: No module named 'app.paths'`.

- [ ] **Step 3: Write minimal implementation**

Create `backend/app/paths.py`:

```python
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `backend/.venv/bin/python -m pytest tests/test_paths.py -v`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/app/paths.py backend/tests/test_paths.py
git commit -m "feat: add runtime path resolution for dev vs bundled app"
```

---

### Task 2: Route config & env-file paths through `app_data_dir()`

**Files:**
- Modify: `backend/app/config.py`
- Modify: `backend/app/env_file.py:5`
- Test: `backend/tests/test_config.py`, `backend/tests/test_env_file.py`

**Interfaces:**
- Consumes: `app.paths.app_data_dir`.
- Produces: no signature changes. `Settings.DATA_DIR` default and `env_file` now resolve under `app_data_dir()`; `env_file.ENV_PATH` now equals `app_data_dir() / ".env"`. In dev these are byte-identical to today (`backend/.env`, `backend/data`).

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_config.py`:

```python
def test_data_dir_default_resolves_under_app_data_dir():
    from app.config import Settings
    from app.paths import app_data_dir

    # _env_file=None avoids reading a real backend/.env that could set DATA_DIR.
    s = Settings(_env_file=None)
    assert s.DATA_DIR == str(app_data_dir() / "data")
```

Append to `backend/tests/test_env_file.py`:

```python
def test_env_path_resolves_under_app_data_dir():
    from app import env_file
    from app.paths import app_data_dir

    assert env_file.ENV_PATH == app_data_dir() / ".env"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `backend/.venv/bin/python -m pytest tests/test_config.py::test_data_dir_default_resolves_under_app_data_dir tests/test_env_file.py::test_env_path_resolves_under_app_data_dir -v`
Expected: FAIL — `DATA_DIR` is `"data"` and `ENV_PATH` is the old `__file__`-derived path (equal in value in dev, but the assertion compares against `app_data_dir()`; it fails to import/compare until the code references `app_data_dir`). If the values already match by coincidence in dev, still proceed to wire the code so intent is explicit.

- [ ] **Step 3: Edit `config.py`**

In `backend/app/config.py`, add the import and change the two defaults.

Replace:
```python
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
```
with:
```python
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.paths import app_data_dir
```

Replace:
```python
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
```
with:
```python
    model_config = SettingsConfigDict(env_file=str(app_data_dir() / ".env"), extra="ignore")
```

Replace:
```python
    DATA_DIR: str = "data"
```
with:
```python
    DATA_DIR: str = str(app_data_dir() / "data")
```

- [ ] **Step 4: Edit `env_file.py`**

In `backend/app/env_file.py`, replace:
```python
from pathlib import Path

# backend/.env — the file pydantic-settings reads when the server runs with cwd=backend.
# Kept as a module-level variable so tests can monkeypatch it.
ENV_PATH = Path(__file__).resolve().parent.parent / ".env"
```
with:
```python
from app.paths import app_data_dir

# The .env file pydantic-settings reads. Resolves to backend/.env in dev and to
# the App Support dir when bundled. Module-level so tests can monkeypatch it.
ENV_PATH = app_data_dir() / ".env"
```

- [ ] **Step 5: Run the focused tests + full backend suite**

Run: `backend/.venv/bin/python -m pytest tests/test_config.py tests/test_env_file.py -v`
Expected: PASS.

Run: `backend/.venv/bin/python -m pytest`
Expected: PASS — **113 passed** (111 prior + the 2 new here; Task 1's 5 are in a separate file already counted once run together → confirm the suite is green, exact count rises as tasks add tests).

- [ ] **Step 6: Commit**

```bash
git add backend/app/config.py backend/app/env_file.py backend/tests/test_config.py backend/tests/test_env_file.py
git commit -m "refactor: resolve .env and data paths via app_data_dir"
```

---

### Task 3: Serve the built SPA from FastAPI (single server)

**Files:**
- Create: `backend/app/spa.py`
- Modify: `backend/app/main.py` (add startup hook + SPA mount at end of file)
- Test: `backend/tests/test_spa.py`

**Interfaces:**
- Consumes: `app.paths.frontend_dist_dir`, `app.paths.ensure_app_dirs`.
- Produces: `app.spa.SPAStaticFiles(StaticFiles)` — a `StaticFiles` subclass that returns `index.html` (HTTP 200) for any path that would otherwise 404, so client-side routes (`/logged`, `/rules`, `/settings`) resolve on reload/deep-link while real asset files are still served normally.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_spa.py`:

```python
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.spa import SPAStaticFiles


def _make_app(dist):
    app = FastAPI()

    @app.get("/api/ping")
    def ping():
        return {"ok": True}

    app.mount("/", SPAStaticFiles(directory=str(dist), html=True), name="spa")
    return app


def test_serves_index_at_root(tmp_path):
    (tmp_path / "index.html").write_text("<!doctype html><title>SPA</title>")
    client = TestClient(_make_app(tmp_path))
    r = client.get("/")
    assert r.status_code == 200
    assert "SPA" in r.text


def test_unknown_client_route_falls_back_to_index(tmp_path):
    (tmp_path / "index.html").write_text("<!doctype html><title>SPA</title>")
    client = TestClient(_make_app(tmp_path))
    r = client.get("/logged")
    assert r.status_code == 200
    assert "SPA" in r.text


def test_real_asset_is_served(tmp_path):
    (tmp_path / "index.html").write_text("INDEX")
    assets = tmp_path / "assets"
    assets.mkdir()
    (assets / "app.js").write_text("console.log(1)")
    client = TestClient(_make_app(tmp_path))
    r = client.get("/assets/app.js")
    assert r.status_code == 200
    assert "console.log" in r.text


def test_api_route_still_returns_json(tmp_path):
    (tmp_path / "index.html").write_text("INDEX")
    client = TestClient(_make_app(tmp_path))
    r = client.get("/api/ping")
    assert r.status_code == 200
    assert r.json() == {"ok": True}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `backend/.venv/bin/python -m pytest tests/test_spa.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.spa'`.

- [ ] **Step 3: Write `spa.py`**

Create `backend/app/spa.py`:

```python
"""Static-file serving for the built single-page app.

A ``StaticFiles`` subclass that falls back to ``index.html`` for any path that
would 404, so the React Router client-side routes resolve on reload/deep-link.
Real asset files (under /assets, favicon, etc.) are still served as files.
"""
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.staticfiles import StaticFiles


class SPAStaticFiles(StaticFiles):
    async def get_response(self, path, scope):
        try:
            return await super().get_response(path, scope)
        except StarletteHTTPException as exc:
            if exc.status_code == 404:
                return await super().get_response("index.html", scope)
            raise
```

- [ ] **Step 4: Run test to verify it passes**

Run: `backend/.venv/bin/python -m pytest tests/test_spa.py -v`
Expected: PASS (4 tests).

- [ ] **Step 5: Wire startup hook + mount into `main.py`**

In `backend/app/main.py`, add to the imports block (after `from app import demo, deps, env_file`):
```python
from app.paths import ensure_app_dirs, frontend_dist_dir
from app.spa import SPAStaticFiles
```

Immediately after the `app.add_middleware(... )` CORS block (around line 33), add the startup hook:
```python
@app.on_event("startup")
def _ensure_dirs_on_startup() -> None:
    ensure_app_dirs()
```

At the **very end** of `main.py` (after all `@app.<verb>` route definitions), add the SPA mount so it is matched only after every `/api/...` route:
```python
# Serve the built SPA last, so API routes take precedence. Only mounted when a
# built frontend exists (production / packaged app); in dev Vite serves the UI.
_dist = frontend_dist_dir()
if _dist is not None:
    app.mount("/", SPAStaticFiles(directory=str(_dist), html=True), name="spa")
```

- [ ] **Step 6: Run the full backend suite**

Run: `backend/.venv/bin/python -m pytest`
Expected: PASS. (Existing `/api/*` tests unaffected; the mount, if `frontend/dist` exists in the repo, does not intercept `/api/*` because those routes are registered first.)

- [ ] **Step 7: Commit**

```bash
git add backend/app/spa.py backend/app/main.py backend/tests/test_spa.py
git commit -m "feat: serve built SPA from FastAPI with index.html fallback"
```

---

### Task 4: `desktop.py` — pywebview launcher

**Files:**
- Create: `backend/app/desktop.py`
- Modify: `backend/pyproject.toml` (add `pywebview` to a new `packaging` extra)
- Test: `backend/tests/test_desktop.py`

**Interfaces:**
- Consumes: `app.main.app`, `uvicorn`, `httpx`, `pywebview` (lazy import).
- Produces:
  - `find_free_port() -> int`
  - `wait_for_health(port: int, timeout: float = 30.0, interval: float = 0.2) -> bool`
  - `run_server(port: int) -> uvicorn.Server` (starts uvicorn in a daemon thread)
  - `main() -> None` (entry point: port → server → health wait → window)

- [ ] **Step 1: Add `pywebview` dependency**

In `backend/pyproject.toml`, replace:
```toml
[project.optional-dependencies]
dev = [
    "pytest>=8.0",
    "pytest-cov>=5.0",
]
```
with:
```toml
[project.optional-dependencies]
dev = [
    "pytest>=8.0",
    "pytest-cov>=5.0",
]
packaging = [
    "pywebview>=5.0",
    "pyinstaller>=6.0",
]
```

Install it:
```bash
backend/.venv/bin/pip install "pywebview>=5.0"
```
Expected: installs pywebview (and its pyobjc deps on macOS).

- [ ] **Step 2: Write the failing test**

Create `backend/tests/test_desktop.py`:

```python
import socket

from app import desktop


def test_find_free_port_is_bindable():
    port = desktop.find_free_port()
    assert isinstance(port, int)
    assert 1024 <= port <= 65535
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.bind(("127.0.0.1", port))  # must be free/bindable
    s.close()


def test_wait_for_health_returns_true_when_ok(monkeypatch):
    class _Resp:
        status_code = 200

        @staticmethod
        def json():
            return {"status": "ok"}

    monkeypatch.setattr(desktop.httpx, "get", lambda url, timeout: _Resp())
    assert desktop.wait_for_health(12345, timeout=1.0, interval=0.01) is True


def test_wait_for_health_returns_false_on_timeout(monkeypatch):
    def _down(url, timeout):
        raise RuntimeError("connection refused")

    monkeypatch.setattr(desktop.httpx, "get", _down)
    assert desktop.wait_for_health(12345, timeout=0.2, interval=0.05) is False
```

- [ ] **Step 3: Run test to verify it fails**

Run: `backend/.venv/bin/python -m pytest tests/test_desktop.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.desktop'`.

- [ ] **Step 4: Write `desktop.py`**

Create `backend/app/desktop.py`:

```python
"""Desktop launcher: run the FastAPI app behind a native pywebview window.

This is the PyInstaller entry point. It boots uvicorn on a free loopback port
in a background thread, waits for the server to report healthy, then opens a
native window pointed at it. Closing the window exits the process.
"""
import socket
import threading
import time

import httpx
import uvicorn

from app.main import app


def find_free_port() -> int:
    """Return an OS-assigned free TCP port on the loopback interface."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def run_server(port: int) -> uvicorn.Server:
    """Start uvicorn on 127.0.0.1:<port> in a daemon thread; return the server."""
    config = uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning")
    server = uvicorn.Server(config)
    threading.Thread(target=server.run, daemon=True).start()
    return server


def wait_for_health(port: int, timeout: float = 30.0, interval: float = 0.2) -> bool:
    """Poll /api/health until it reports ok, or until *timeout* seconds pass."""
    url = f"http://127.0.0.1:{port}/api/health"
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            resp = httpx.get(url, timeout=1.0)
            if resp.status_code == 200 and resp.json().get("status") == "ok":
                return True
        except Exception:
            pass
        time.sleep(interval)
    return False


def main() -> None:
    import webview  # lazy import so the module is importable headless/in CI

    port = find_free_port()
    server = run_server(port)
    if not wait_for_health(port):
        raise RuntimeError("Backend failed to start within the timeout")

    webview.create_window(
        "Odoo Hours Logger",
        f"http://127.0.0.1:{port}",
        width=1280,
        height=860,
        min_size=(960, 600),
    )
    webview.start()
    server.should_exit = True  # window closed → stop uvicorn


if __name__ == "__main__":
    main()
```

- [ ] **Step 5: Run test to verify it passes**

Run: `backend/.venv/bin/python -m pytest tests/test_desktop.py -v`
Expected: PASS (3 tests).

- [ ] **Step 6: Manual sanity — launch the window from source**

Run (from repo root, with `frontend/dist` built — run `npm --prefix frontend run build` first if needed):
```bash
backend/.venv/bin/python -m app.desktop
```
Expected: a native window titled "Odoo Hours Logger" opens showing the app; closing it returns the shell prompt with no orphaned process. (Requires a GUI session; if running headless, skip and rely on the packaged smoke test in Task 5.)

- [ ] **Step 7: Commit**

```bash
git add backend/app/desktop.py backend/pyproject.toml backend/tests/test_desktop.py
git commit -m "feat: add pywebview desktop launcher"
```

---

### Task 5: Package as a macOS `.app` (PyInstaller)

**Files:**
- Create: `packaging/desktop_entry.py`, `packaging/odoo-hours-logger.spec`, `packaging/make_icns.sh`, `build_app.sh`
- Modify: `.gitignore`
- Verification: build + manual launch (no automated test — produces a binary artifact)

**Interfaces:**
- Consumes: `app.desktop.main`, `frontend/dist/`, `pyinstaller`.
- Produces: `dist-app/Odoo Hours Logger.app`.

- [ ] **Step 1: Install PyInstaller**

```bash
backend/.venv/bin/pip install "pyinstaller>=6.0"
```

- [ ] **Step 2: Write the PyInstaller entry point**

Create `packaging/desktop_entry.py`:

```python
"""PyInstaller entry point — launches the pywebview desktop app."""
from app.desktop import main

if __name__ == "__main__":
    main()
```

- [ ] **Step 3: Write the PyInstaller spec**

Create `packaging/odoo-hours-logger.spec`:

```python
# -*- mode: python ; coding: utf-8 -*-
from pathlib import Path

ROOT = Path(SPECPATH).resolve().parent          # repo root (spec lives in packaging/)
BACKEND = ROOT / "backend"
DIST = ROOT / "frontend" / "dist"
ICON = ROOT / "packaging" / "AppIcon.icns"
icon_arg = str(ICON) if ICON.exists() else None  # tolerate a missing icon

a = Analysis(
    [str(ROOT / "packaging" / "desktop_entry.py")],
    pathex=[str(BACKEND)],
    binaries=[],
    datas=[(str(DIST), "frontend_dist")],
    hiddenimports=[
        "uvicorn.logging",
        "uvicorn.loops.auto",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.lifespan.on",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="Odoo Hours Logger",
    console=False,
    icon=icon_arg,
)
coll = COLLECT(exe, a.binaries, a.datas, name="Odoo Hours Logger")
app = BUNDLE(
    coll,
    name="Odoo Hours Logger.app",
    icon=icon_arg,
    bundle_identifier="engineering.daredata.odoo-hours-logger",
)
```

- [ ] **Step 4: Write the icon generator (best-effort)**

Create `packaging/make_icns.sh`:

```bash
#!/usr/bin/env bash
# Generate packaging/AppIcon.icns from frontend/public/favicon.svg.
# Requires rsvg-convert (brew install librsvg). Best-effort: exits non-zero if
# it can't rasterize the SVG, and the build proceeds without a custom icon.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SVG="$ROOT/frontend/public/favicon.svg"
OUT="$ROOT/packaging/AppIcon.icns"
TMPSET="$(mktemp -d)/AppIcon.iconset"
mkdir -p "$TMPSET"

if ! command -v rsvg-convert >/dev/null 2>&1; then
  echo "make_icns: rsvg-convert not found (brew install librsvg); skipping icon."
  exit 1
fi

rsvg-convert -w 1024 -h 1024 "$SVG" -o "$TMPSET/base.png"
sips -z 16 16     "$TMPSET/base.png" --out "$TMPSET/icon_16x16.png"      >/dev/null
sips -z 32 32     "$TMPSET/base.png" --out "$TMPSET/icon_16x16@2x.png"   >/dev/null
sips -z 32 32     "$TMPSET/base.png" --out "$TMPSET/icon_32x32.png"      >/dev/null
sips -z 64 64     "$TMPSET/base.png" --out "$TMPSET/icon_32x32@2x.png"   >/dev/null
sips -z 128 128   "$TMPSET/base.png" --out "$TMPSET/icon_128x128.png"    >/dev/null
sips -z 256 256   "$TMPSET/base.png" --out "$TMPSET/icon_128x128@2x.png" >/dev/null
sips -z 256 256   "$TMPSET/base.png" --out "$TMPSET/icon_256x256.png"    >/dev/null
sips -z 512 512   "$TMPSET/base.png" --out "$TMPSET/icon_256x256@2x.png" >/dev/null
sips -z 512 512   "$TMPSET/base.png" --out "$TMPSET/icon_512x512.png"    >/dev/null
cp "$TMPSET/base.png" "$TMPSET/icon_512x512@2x.png"
rm "$TMPSET/base.png"
iconutil -c icns "$TMPSET" -o "$OUT"
echo "make_icns: wrote $OUT"
```

Make it executable:
```bash
chmod +x packaging/make_icns.sh
```

- [ ] **Step 5: Write the one-command build script**

Create `build_app.sh`:

```bash
#!/usr/bin/env bash
# Build the macOS desktop app: frontend → icon → PyInstaller → seed App Support.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_SUPPORT="$HOME/Library/Application Support/Odoo Hours Logger"
PY="$ROOT/backend/.venv/bin/python"

echo "1/4  Building frontend…"
npm --prefix "$ROOT/frontend" install
npm --prefix "$ROOT/frontend" run build

echo "2/4  Generating app icon (best-effort)…"
bash "$ROOT/packaging/make_icns.sh" || echo "      icon skipped; using default."

echo "3/4  Building .app with PyInstaller…"
"$PY" -m PyInstaller --noconfirm \
  --distpath "$ROOT/dist-app" \
  --workpath "$ROOT/build-app" \
  "$ROOT/packaging/odoo-hours-logger.spec"

echo "4/4  Seeding config to App Support (first build only)…"
if [ ! -f "$APP_SUPPORT/.env" ]; then
  mkdir -p "$APP_SUPPORT"
  [ -f "$ROOT/backend/.env" ] && cp "$ROOT/backend/.env" "$APP_SUPPORT/.env" && echo "      copied .env"
  [ -d "$ROOT/backend/data" ] && cp -R "$ROOT/backend/data" "$APP_SUPPORT/data" && echo "      copied data/"
else
  echo "      App Support config already exists; left untouched."
fi

echo ""
echo "Done →  $ROOT/dist-app/Odoo Hours Logger.app"
echo "First launch: right-click the app → Open (unsigned app; Gatekeeper will warn once)."
```

Make it executable:
```bash
chmod +x build_app.sh
```

- [ ] **Step 6: Update `.gitignore`**

Append to `.gitignore`:
```
# Desktop app build artifacts
/dist-app/
/build-app/
/packaging/AppIcon.icns
*.iconset
```

- [ ] **Step 7: Build and verify the bundle**

Run (from repo root):
```bash
./build_app.sh
```
Expected: completes and prints `Done → .../dist-app/Odoo Hours Logger.app`.

Verify the bundle exists and is structured:
```bash
test -d "dist-app/Odoo Hours Logger.app/Contents/MacOS" && echo "bundle ok"
test -d "dist-app/Odoo Hours Logger.app/Contents/Resources/frontend_dist" || \
  find "dist-app/Odoo Hours Logger.app" -name index.html | head -1
```
Expected: `bundle ok` and an `index.html` present inside the bundle.

- [ ] **Step 8: Manual smoke test (GUI session)**

Run:
```bash
open "dist-app/Odoo Hours Logger.app"
```
Expected: a native window opens showing the app. In Settings/demo it renders; quitting the window leaves no process holding the chosen port (`lsof -nP -iTCP -sTCP:LISTEN | grep "Odoo" || echo clean`). If running headless, defer this to the user.

- [ ] **Step 9: Commit**

```bash
git add packaging/desktop_entry.py packaging/odoo-hours-logger.spec packaging/make_icns.sh build_app.sh .gitignore
git commit -m "build: add PyInstaller packaging for macOS .app"
```

---

### Task 6: Document the build & first launch

**Files:**
- Modify: `README.md`

**Interfaces:** none (docs).

- [ ] **Step 1: Add a "Desktop app (macOS)" section to `README.md`**

Insert after the existing run/setup section:

```markdown
## Desktop app (macOS)

Build a standalone `Odoo Hours Logger.app` you can keep in `/Applications` and
launch like any other app — no terminal, no repo needed at runtime.

### Build

```bash
./build_app.sh
```

This builds the frontend, bundles the Python backend + UI with PyInstaller, and
produces `dist-app/Odoo Hours Logger.app`. Optional: `brew install librsvg` for
a custom app icon (otherwise the default icon is used).

On the first build your existing `backend/.env` and `backend/data/` are copied
once into `~/Library/Application Support/Odoo Hours Logger/`, which is where the
installed app reads and writes its config and data thereafter.

### First launch

The app is unsigned, so the first time, **right-click it → Open** and confirm
(Gatekeeper warns once). After that, double-click as usual. The company VPN is
still required to reach Odoo.

### Development

Packaging changes nothing about development — keep using `./run.sh` (FastAPI on
:8010 + Vite on :5173).
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: document building and launching the macOS desktop app"
```

---

## Self-Review

**Spec coverage:**
- §3 single-server SPA serving → Task 3. ✔
- §4 pywebview native window (dynamic port, health wait, 1280×860/min 960×600, close-stops-server) → Task 4. ✔
- §5 writable paths (dev vs bundle), startup dir creation, build-time App Support seed → Task 1 (paths/ensure), Task 2 (config/env wiring), Task 3 (startup hook), Task 5 (seed in build_app.sh). ✔
- §6 PyInstaller `.app` (onedir, bundle id, icon, unsigned), build_app.sh, make_icns.sh → Task 5. ✔
- §7 run.sh/dev unchanged, Settings writes into App Support → preserved (main.py stays importable; config/env via app_data_dir). ✔
- §8 testing (paths, startup creation, SPA mount via TestClient; existing suites green; manual .app smoke) → Tasks 1/3 tests + Task 5 manual. ✔
- §9 out-of-scope respected (no signing/Windows/dmg/auto-update). ✔
- §10 file list → matches File Structure (added `app/spa.py` and `packaging/desktop_entry.py` as focused-module refinements; noted). ✔

**Placeholder scan:** none — all steps contain concrete code/commands.

**Type/name consistency:** `app_data_dir`, `frontend_dist_dir`, `ensure_app_dirs`, `is_frozen` (paths) used consistently in config/env/main/desktop. `SPAStaticFiles` consistent (spa.py → main.py + test). `find_free_port`, `run_server`, `wait_for_health`, `main` consistent (desktop.py → test). `frontend_dist` data target name matches `frontend_dist_dir()` frozen branch.
