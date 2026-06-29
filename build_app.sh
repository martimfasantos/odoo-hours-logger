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
