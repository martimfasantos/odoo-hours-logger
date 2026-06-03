# Odoo Hours Logger

Log Google Calendar hours into Odoo timesheets — locally, with a review step before anything is written.

## How it works

Calendar events are fetched from a private iCal URL, matched to an Odoo Project/Task by keyword rules on the event title (managed in-app), reviewed in the browser, then pushed to Odoo as timesheet lines. A local `data/ledger.json` prevents double-logging. No database — rules and the dedup ledger are plain JSON files.

All-day events, declined events, and recurring event expansions are handled automatically.

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
| `ICAL_URL` | Your private Google Calendar iCal URL |
| `ODOO_URL` | Odoo instance URL (e.g. `https://mycompany.odoo.com`) |
| `ODOO_DB` | Odoo database name |
| `ODOO_USERNAME` | Your Odoo login email |
| `ODOO_API_KEY` | Odoo API key (Settings → Technical → API Keys) |
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
# Terminal 1 — backend (http://localhost:8000)
cd backend && ./run.sh

# Terminal 2 — frontend (http://localhost:5173)
cd frontend && npm run dev
```

Then open [http://localhost:5173](http://localhost:5173).

## Test

```bash
cd backend && . .venv/bin/activate && pytest
```

45 tests, all green.

## First-time live verification

After filling in `.env` with real credentials:

1. **Settings** → click "Test connection" → confirm both Odoo and iCal show green.
2. **Mapping Rules** → add at least one rule (keyword → Odoo project/task).
3. **Daily Hours** → pick a date range → click "Refresh from calendar" → events appear with proposed matches.
4. Edit any match if needed, approve rows, then click "Push approved" → check for ✓ results.
5. Reload the page — pushed entries appear as "Logged" (dedup is working).
6. Confirm the timesheet line exists in Odoo under Timesheets.
7. **Weekly by Contract** → totals reflect the pushed hours.
