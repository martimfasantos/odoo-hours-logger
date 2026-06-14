#!/usr/bin/env bash
#
# Launch the Odoo Hours Logger: backend (FastAPI) + frontend (Vite) together.
#
# Usage:  ./run.sh
# Stop:   Ctrl-C (stops both)
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_PORT=8010
FRONTEND_PORT=5173

# --- sanity checks ---
if [ ! -d "$ROOT/backend/.venv" ]; then
  echo "✗ Backend venv not found at backend/.venv"
  echo "  Set up first:  cd backend && python -m venv .venv && . .venv/bin/activate && pip install -e \".[dev]\""
  exit 1
fi
if [ ! -d "$ROOT/frontend/node_modules" ]; then
  echo "✗ Frontend dependencies not installed."
  echo "  Set up first:  cd frontend && npm install"
  exit 1
fi

# --- stop both services on exit / Ctrl-C ---
cleanup() {
  echo ""
  echo "Stopping services…"
  lsof -ti tcp:$BACKEND_PORT  2>/dev/null | xargs kill 2>/dev/null || true
  lsof -ti tcp:$FRONTEND_PORT 2>/dev/null | xargs kill 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# --- start backend (FastAPI / uvicorn) ---
( cd "$ROOT/backend" && . .venv/bin/activate && uvicorn app.main:app --port "$BACKEND_PORT" --reload ) &

# --- start frontend (Vite) ---
( cd "$ROOT/frontend" && npm run dev -- --port "$FRONTEND_PORT" ) &

echo ""
echo "  Odoo Hours Logger — starting both services…"
echo ""
echo "    ▶ App (open this):  http://localhost:$FRONTEND_PORT"
echo "    ▶ Backend API:      http://localhost:$BACKEND_PORT"
echo ""
echo "    Press Ctrl-C to stop both."
echo ""

# Wait for both background services; the trap stops them on Ctrl-C.
wait
