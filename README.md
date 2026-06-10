# Odoo Hours Logger

Log Google Calendar hours into Odoo timesheets — locally, with a review step before anything is written.

## How it works

Calendar events are fetched from a private iCal URL, matched to an Odoo Project/Task by keyword rules on the event title (managed in-app), reviewed in the browser, then pushed to Odoo as timesheet lines. A local `data/ledger.json` prevents double-logging. No database — rules and the dedup ledger are plain JSON files.

All-day events, declined events, and recurring event expansions are handled automatically. There is no database and no LLM/AI — matching is plain keyword substring matching on the event title.

## Prerequisites

- **Python 3.12+**
- **Node.js 18+** and npm
- Your private Google Calendar iCal URL (Calendar settings → "Secret address in iCal format")
- Access to your Odoo instance: URL, database name, login email, and an API key or password

## Setup

### Backend

```bash
cd backend
python -m venv .venv
. .venv/bin/activate
pip install -e ".[dev]"
```

Copy `.env.example` to `.env` and fill in your values:

```bash
cp backend/.env.example backend/.env
```

| Variable | Description |
|---|---|
| `GOOGLE_CALENDAR_URL` | Your private Google Calendar secret address URL (Calendar settings → "Secret address in iCal format") |
| `ODOO_URL` | Odoo instance URL (e.g. `https://mycompany.odoo.com`) |
| `ODOO_DB` | Odoo database name |
| `ODOO_USERNAME` | Your Odoo login email |
| `ODOO_API_KEY` | Your Odoo XML-RPC credential — an API key **or** your account password. An API key is required if your account has 2FA; generate one under your Odoo **Preferences → Account Security → New API Key** |
| `LOCAL_TZ` | Your local timezone (default: `Europe/Lisbon`) |
| `USER_EMAIL` | Your email, used to detect declined calendar events |
| `DATA_DIR` | Directory for `rules.json` and `ledger.json` (default: `data`) |

### Frontend

```bash
cd frontend
npm install
```

## Run

Start both servers (two terminals):

```bash
# Terminal 1 — backend (http://localhost:8010)
cd backend && ./run.sh

# Terminal 2 — frontend (http://localhost:5173)
cd frontend && npm run dev
```

Then open [http://localhost:5173](http://localhost:5173).

## Try the UI with demo data (no credentials)

To explore the interface without any Google Calendar or Odoo setup, run in **demo mode**: the backend serves sample projects, tasks, and calendar events, and "Push approved" is simulated (nothing is sent to Odoo).

1. Copy the env template if you haven't: `cp backend/.env.example backend/.env`
2. Set `DEMO_MODE=true` in `backend/.env` (the other values can stay blank).
3. Start both servers (above) and open the app — the Daily, Weekly, and Mapping Rules pages are fully clickable with sample data, and pushing flips rows to "Logged".

Set `DEMO_MODE=false` and fill in your real credentials for live use.

## Test

```bash
cd backend && . .venv/bin/activate && pytest
```

50 tests, all green.

## First-time live verification

After filling in `.env` with real credentials:

1. **Settings** → click "Test connection" → confirm both Odoo and Google Calendar show green.
2. **Mapping Rules** → add at least one rule (keyword → Odoo project/task).
3. **Daily Hours** → pick a date range → click "Refresh from calendar" → events appear with proposed matches.
4. Edit any match if needed, approve rows, then click "Push approved" → check for ✓ results.
5. Reload the page — pushed entries appear as "Logged" (dedup is working).
6. Confirm the timesheet line exists in Odoo under Timesheets.
7. **Weekly by Contract** → totals reflect the pushed hours.
