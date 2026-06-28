# Design: Package Odoo Hours Logger as a macOS desktop app

**Date:** 2026-06-28
**Status:** Approved (design); implementation pending
**Scope:** macOS only

## 1. Goal

Replace the current developer workflow — clone repo → run two dev servers
(`uvicorn` + `vite`) via `run.sh` → open `http://localhost:5173` in a browser —
with a double-clickable **`Odoo Hours Logger.app`** that any non-developer use
of the tool can rely on. After building once, launching needs no terminal, no
`cd`, no repo on disk, and no manual server management.

Non-goals are listed in §9.

## 2. Constraints & context (current state)

- **Backend:** Python 3.12, FastAPI + uvicorn, default port `8010`. JSON-file
  storage under `backend/data/`. Reads `backend/.env` via pydantic-settings.
  Talks to Odoo (session-cookie web JSON-RPC) and Google Calendar (private iCal
  URL). Requires the company VPN to reach Odoo.
- **Frontend:** React + Vite + TypeScript SPA, dev server on `5173`, which
  proxies `/api` → `http://localhost:8010` (see `frontend/vite.config.ts`).
  React Router routes: `/` (Log Hours), `/logged`, `/rules`, `/settings`.
- **Config/data paths today:**
  - `backend/app/env_file.py`: `ENV_PATH = Path(__file__).resolve().parent.parent / ".env"` (→ `backend/.env`).
  - `backend/app/config.py`: `SettingsConfigDict(env_file=".env")` (relative to CWD) and `DATA_DIR: str = "data"` (relative to CWD, used by `Settings.data_path`).
  - Settings UI writes `.env` through `PUT /api/config`, which also clears the
    `deps.py` lru_cache singletons.
- **Tooling present:** Python 3.12 venv at `backend/.venv`, Node 25, a prebuilt
  `frontend/dist/` exists. FastAPI currently does **not** serve any static files.

## 3. Architecture — collapse to a single server

In the packaged app there is no Vite dev server. The built SPA is served by
FastAPI itself:

1. Build step runs `npm run build` → `frontend/dist/`.
2. FastAPI registers all `/api/...` routes first, then mounts the SPA:
   `app.mount("/", StaticFiles(directory=<dist>, html=True), name="spa")`.
   A catch-all fallback returns `index.html` for unknown non-`/api` paths so
   client-side routes (`/logged`, `/rules`, `/settings`) resolve correctly on
   reload/deep-link.
3. The server binds `127.0.0.1` on a **dynamically chosen free port** (not the
   hard-coded `8010`), so a packaged app never clashes with a running dev
   server or anything else on `8010`.

The static mount is only wired when the built assets exist; in dev (no
`dist/`, Vite serving the UI) behavior is unchanged. The dist directory is
located via the path helper (§5) so it resolves both from source and inside the
PyInstaller bundle.

## 4. Native window — pywebview

A new entry-point module `backend/app/desktop.py`:

1. Resolves a free loopback port.
2. Starts uvicorn on `127.0.0.1:<port>` in a background (daemon) thread,
   serving `app.main:app`.
3. Polls `GET /api/health` until it returns `ok` (with a timeout + clear error
   if the server fails to come up).
4. Opens a native **pywebview** window (system WebKit on macOS — no bundled
   Chromium) pointed at `http://127.0.0.1:<port>`. Title: `Odoo Hours Logger`.
   Default size **1280×860**, resizable, minimum **960×600**.
5. `webview.start()` blocks until the window is closed; on close the process
   exits, which tears down the uvicorn thread.

This module is the PyInstaller entry point. It is independent of `main.py`
(which stays a plain ASGI app importable by tests and by `run.sh`).

## 5. Writable config/data paths (key refactor)

Introduce `backend/app/paths.py` exposing a single resolver:

```
def app_data_dir() -> Path:
    # Bundled (PyInstaller sets sys.frozen / sys._MEIPASS):
    #   ~/Library/Application Support/Odoo Hours Logger/
    # From source (dev/tests): the backend/ directory (current behavior).
```

and a `frontend_dist_dir() -> Path | None` helper that finds the built SPA in
both modes (source tree vs. bundled resources).

Changes:

- `env_file.ENV_PATH` → `app_data_dir() / ".env"`.
- `config.Settings`: `env_file` points at `app_data_dir() / ".env"` (absolute);
  `DATA_DIR` default resolves under `app_data_dir() / "data"`.
- On startup the app ensures `app_data_dir()` and the `data/` subdir exist and
  that the JSON stores are created empty if missing (graceful fresh install).

**Dev/test behavior is preserved:** when running from source, `app_data_dir()`
returns `backend/`, so `.env` stays at `backend/.env` and data at
`backend/data/` exactly as today. Tests that override `DATA_DIR` (conftest)
continue to win because explicit env/fixtures take precedence.

**First-run migration (build-time seed):** the build script runs inside the
repo, so it can see both the source config and the target App Support dir.
After building, if `~/Library/Application Support/Odoo Hours Logger/.env` does
**not** already exist, it copies the current `backend/.env` and
`backend/data/` there. This is a one-time seed: it never overwrites config the
installed app has already written. (Secrets are therefore never baked into the
read-only `.app` bundle — they live only in the user-writable App Support dir.)

## 6. Packaging — PyInstaller `.app`

- `packaging/odoo-hours-logger.spec`: a PyInstaller spec producing a macOS
  `.app` bundle (BUNDLE) in `onedir` mode. It bundles the Python runtime,
  `backend/app`, and `frontend/dist/` (added as bundled data), sets the app
  name `Odoo Hours Logger`, the bundle identifier
  `engineering.daredata.odoo-hours-logger`, and the icon. Hidden imports
  for uvicorn/pydantic/pywebview are declared as needed.
- `packaging/make_icns.sh`: generates `AppIcon.icns` from
  `frontend/public/favicon.svg` (rasterize → `iconset` → `iconutil`).
- `build_app.sh` (repo root): one command that
  1. builds the frontend (`npm --prefix frontend run build`),
  2. generates the icon,
  3. runs PyInstaller against the spec (using `backend/.venv`),
  4. seeds App Support from `backend/.env` + `backend/data/` if not present,
  5. prints where the `.app` landed and the first-launch Gatekeeper note.
- **Signing:** unsigned, ad-hoc only (personal use). First launch requires
  right-click → Open (or `xattr -dr com.apple.quarantine`). Documented in the
  README. No Apple Developer account, no notarization.

New backend dependencies go in a `packaging` extra (and/or `dev`):
`pywebview`, `pyinstaller`.

## 7. What stays the same

- `run.sh` and the two-server dev workflow are untouched — still the way to
  develop. (`main.py` remains a normal importable ASGI app.)
- The Settings tab still writes `.env` via `PUT /api/config`, now into
  `app_data_dir()`.
- **VPN is still required** to reach Odoo; packaging changes nothing about
  connectivity.

## 8. Testing

- All existing tests must still pass: backend 111 (pytest), frontend 116
  (vitest). The dev-mode branch in `paths.py` preserves current path behavior.
- New backend tests:
  - `paths.py`: dev resolution returns `backend/`; frozen resolution (simulated
    via monkeypatching `sys.frozen`/`sys._MEIPASS`) returns the App Support path.
  - Startup creates the data dir + empty JSON stores when missing.
  - SPA serving: with a temp `dist/index.html`, `/` and an unknown client route
    return the SPA `index.html`, while `/api/health` still returns JSON
    (verified through `TestClient`).
- Manual smoke test of the actual `.app`: double-click → window opens →
  (demo mode) renders events → quitting the window stops the backend (no
  orphaned process on the chosen port).

## 9. Out of scope (YAGNI)

- Auto-update.
- Code signing / notarization / Apple Developer distribution.
- Windows and Linux builds.
- A `.dmg` installer or any App Store presence.
- Changing any application feature, the Odoo/calendar integration, or the data
  model.

## 10. New / changed files

```
NEW  backend/app/paths.py                  # app_data_dir() + frontend_dist_dir()
NEW  backend/app/desktop.py                # pywebview launcher (PyInstaller entry point)
NEW  packaging/odoo-hours-logger.spec      # PyInstaller spec → .app bundle
NEW  packaging/make_icns.sh                # SVG → AppIcon.icns
NEW  build_app.sh                          # frontend build → PyInstaller → seed App Support
EDIT backend/app/main.py                   # mount built SPA + SPA fallback (when dist present)
EDIT backend/app/config.py                 # env_file + DATA_DIR via app_data_dir()
EDIT backend/app/env_file.py               # ENV_PATH via app_data_dir()
EDIT backend/pyproject.toml                # add pywebview + pyinstaller (packaging extra)
EDIT README.md / docs                      # build + first-launch instructions
NEW  backend/tests/test_paths.py           # path resolution + startup creation
EDIT backend/tests/test_api.py             # SPA static mount + fallback (or a new test file)
```
