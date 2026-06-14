# Odoo Hours Logger

Log Google Calendar hours into Daredata's Odoo — locally, with a review step before anything is written.

## How it works

Calendar events are fetched from your Google Calendar's secret iCal URL, matched to an Odoo **contract** by keyword rules on the event title (managed in-app), reviewed in the browser, then pushed to Odoo. Odoo here is Daredata's custom **`timesheet_entry`** model, reached over its **session-based web JSON-RPC API** (no API key — it reuses your browser session). A local `data/ledger.json` plus a check against existing Odoo entries prevents double-logging.

All-day, declined, and recurring events are handled automatically. There is no database and no LLM/AI — matching is plain keyword substring matching on the event title; rules and the dedup ledger are plain JSON files.

## Prerequisites

- **Python 3.12+**
- **Node.js 18+** and npm
- Your Google Calendar **secret iCal URL** (Calendar → Settings → Integrate calendar → "Secret address in iCal format")
- A logged-in Odoo browser session (you'll copy a `session_id` cookie — see below)

## Setup

```bash
# Backend
cd backend && python -m venv .venv && . .venv/bin/activate && pip install -e ".[dev]"
# Frontend
cd ../frontend && npm install
```

Copy `backend/.env.example` to `backend/.env` and fill it in:

| Variable | Description |
|---|---|
| `GOOGLE_CALENDAR_URL` | Google Calendar secret iCal URL |
| `ODOO_URL` | `https://erp.daredata.engineering` |
| `ODOO_DB` | `odoo` |
| `ODOO_SESSION_ID` | Your Odoo session cookie — DevTools → Application → Cookies → `session_id`. **Expires periodically**; re-copy when the connection test fails. |
| `ODOO_VISITOR_UUID` | `visitor_uuid` cookie (optional; leave blank if absent) |
| `ODOO_USER_ID`, `ODOO_NETWORK_MEMBER_ID` | Optional — auto-discovered from the session when blank |
| `LOCAL_TZ` | Local timezone (default `Europe/Lisbon`) |
| `USER_EMAIL` | Optional — auto-derived from the Odoo session when blank. Set to override (e.g. when your calendar address differs from your Odoo login). Used to skip declined events. |
| `DATA_DIR` | Directory for `rules.json` / `ledger.json` (default `data`) |

> This Odoo has no API keys, so auth uses your browser session. The `session_id` is a temporary token — when it expires, the Settings page shows "session expired" and you paste a fresh one.

## Run

One command from the repo root starts both services and prints both URLs (Ctrl-C stops both):

```bash
./run.sh
```

Then open **http://localhost:5173** (backend API runs on http://localhost:8010).

Or run them separately: `cd backend && ./run.sh` and `cd frontend && npm run dev`.

## Try the UI with demo data (no credentials)

Set `DEMO_MODE=true` in `backend/.env` to explore the UI with sample contracts and calendar events; "Push approved" is simulated (nothing is sent to Odoo). Set `DEMO_MODE=false` and fill in real values for live use.

## Test

```bash
cd backend && . .venv/bin/activate && pytest
```

75 tests, all green.

## First-time live verification

1. **Settings** → "Test connection" → confirm both Odoo and Google Calendar show green (if Odoo is red with a session message, re-copy `ODOO_SESSION_ID`).
2. **Mapping Rules** → add a rule (keyword in the event title → an Odoo contract).
3. **Daily Hours** → pick a week range → "Refresh from calendar" → events appear with proposed contract matches.
4. Adjust contracts/descriptions, approve rows, then "Push approved to Odoo" → check for ✓ results.
5. Reload — pushed entries appear greyed-out and "Logged" (dedup is working).
6. Confirm the entry exists in Odoo; **Weekly by contract** totals reflect the pushed hours.
