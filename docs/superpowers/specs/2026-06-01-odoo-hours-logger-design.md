# Odoo Hours Logger — Design

**Date:** 2026-06-01
**Status:** Approved (brainstorming) — pending implementation plan

## 1. Purpose

A personal, locally-run tool that reads my Google Calendar (which holds events
from multiple projects/clients) and helps me log those hours into Odoo
Timesheets. Keyword rules map an event's title to the correct Odoo
**Project + Task**. I review the proposed entries in a web UI and push them to
Odoo with a click — nothing is written automatically.

## 2. Goals & non-goals

**Goals**

- Read calendar events for a chosen date range from a single Google Calendar.
- Propose an Odoo Project/Task for each event via keyword rules on the title.
- Let me review, edit, and approve entries before anything is written.
- Push approved entries to Odoo as timesheet lines.
- Never double-log an event, even if I reload the same range and push again.
- Show hours grouped per day, and aggregated per contract (Project/Task) per week.
- Manage keyword rules from inside the app, using dropdowns of my real Odoo
  projects/tasks.

**Non-goals (v1)**

- No editing/deleting of Odoo timesheet lines from the app (create-only).
- No multi-user support; single user, single calendar.
- No OAuth to Google (we use the private iCal URL instead).
- No background/scheduled syncing; the tool runs when I open it.

## 3. Key decisions (from brainstorming)

| Decision | Choice |
|---|---|
| Odoo target | Timesheet lines (`account.analytic.line`) on **Project + Task** |
| Logging flow | **Review, then push** — nothing written without my click |
| Keyword source | **Event title** only |
| Rule management | **In-app editor** with dropdowns of real Odoo projects/tasks |
| Calendar access | **Private iCal URL** (no Google OAuth) |
| Stack | **Python FastAPI backend** + **clean React frontend** (Vite + TS), UI designed with the ui-ux-pro-max skill |
| Odoo transport | **XML-RPC** (`xmlrpc.client`), universal across Odoo versions; API-key auth |
| Local storage | **Plain JSON files** for rules + dedup ledger — **no database** |

## 4. Architecture

```
┌─────────────────┐     iCal (HTTPS)      ┌──────────────────┐
│ Google Calendar │ ──── private URL ───▶ │                  │
└─────────────────┘                       │  FastAPI backend │
                                          │  (Python 3.12)   │
┌─────────────────┐     XML-RPC           │  - calendar      │
│ Odoo (Project + │ ◀──────────────────▶  │  - odoo_client   │
│  Task / a.a.l.) │                        │  - matcher       │
└─────────────────┘                       │  - rules + ledger│
                                          │   (JSON files)   │
                                          └────────┬─────────┘
                                                   │ REST/JSON
                                          ┌────────▼─────────┐
                                          │ React frontend   │
                                          │ (Vite + TS,      │
                                          │  ui-ux-pro-max)  │
                                          └──────────────────┘
```

Backend and frontend run locally. I open `localhost`; the React app calls the
FastAPI API.

## 5. Components (each independently testable)

- **`calendar_source`** — fetches the private iCal URL, parses it, **expands
  recurring events** within the requested date range, computes hours
  (`end − start`), skips all-day events, skips declined events when the feed
  exposes attendee status, applies the configured timezone. Returns normalized
  event objects (uid, start, end, hours, title).
- **`odoo_client`** — thin XML-RPC wrapper. Authenticates with API key; lists
  projects, lists tasks per project, resolves my `hr.employee`, and creates
  timesheet lines on `account.analytic.line`.
- **`matcher`** — applies keyword rules (case-insensitive substring match on the
  event title, ordered by priority) to propose a Project/Task. Returns the
  chosen rule plus any other candidate matches; flags unmatched events.
- **`rules`** — CRUD store backed by a single JSON file (`rules.json`) for
  keyword→project/task rules, backing the in-app editor. Loaded on read,
  rewritten on each add/edit/delete (single user, no concurrent writes).
- **`ledger`** — JSON file (`ledger.json`) recording `event UID → Odoo line id`
  for everything pushed. The dedup mechanism so re-loading a range never
  double-logs.
- **`aggregations`** — daily rollup (events grouped by day) and weekly
  per-contract rollup (totals per Project/Task for a week).
- **`schemas`** — Pydantic models for API request/response payloads.

## 6. Data model (JSON files)

Both files live in a git-ignored local data dir (`backend/data/`).

**`rules.json`** — a JSON array of rule objects:
- `id`, `name`, `keywords` (array; matched as case-insensitive substrings),
  `project_id`, `project_name`, `task_id`, `task_name`, `priority` (int, lower =
  evaluated first), `active` (bool).

**`ledger.json`** — a JSON array of pushed-entry records:
- `event_uid`, `event_start`, `odoo_line_id`, `project_id`, `task_id`, `hours`,
  `pushed_at`. Dedup is keyed on (`event_uid`, `event_start`) so a recurring
  instance is tracked per-occurrence.

## 7. Data flow (core loop)

1. I pick a date range and click **Refresh from calendar**.
2. Backend fetches iCal → normalized events with computed hours → `matcher`
   proposes Project/Task → `ledger` marks any already-logged → returns to UI.
3. UI shows a review table; I edit Project/Task via dropdowns (populated from
   live Odoo data) and tick which entries to approve.
4. I click **Push approved to Odoo** → backend creates timesheet lines, records
   each success in the ledger, and returns per-row results (✓ / ✗ with reason).

## 8. Matching logic

- A rule holds one or more keywords. An event matches a rule if any keyword is a
  case-insensitive substring of the event title.
- Rules are evaluated in `priority` order; the first matching rule wins. Other
  matching rules are returned as alternative candidates (surfaced in the UI).
- Unmatched events appear in the review table with no Project/Task; I can pick
  one manually from the dropdown or leave the event unlogged.

## 9. Hours derivation & defaults

- **Hours** = exact event duration (`end − start`), as a float. No rounding
  (rounding to nearest 0.25h is a possible future toggle).
- **Timesheet date** = event start date (in the configured local timezone).
- **Line description** = event title.
- **All-day events**: skipped (no meaningful duration).
- **Declined events**: skipped when the iCal feed exposes attendee status
  (`PARTSTAT=DECLINED`).
- **Overlapping events**: logged separately but flagged with a warning in the
  review table.
- **Timezone**: default `Europe/Lisbon` (configurable via `LOCAL_TZ`).

## 10. Dedup strategy

- On push, the event's iCal UID (plus occurrence start) and the created Odoo
  line id are recorded in the `ledger`.
- On every refresh, events already present in the ledger are marked
  **Already logged** in the review table and are not pre-approved.
- This keeps Odoo's schema untouched (no custom field needed) and makes repeated
  loads of the same range safe.

## 11. API endpoints (FastAPI)

- `GET  /api/health`
- `GET  /api/odoo/projects` — for dropdowns
- `GET  /api/odoo/projects/{id}/tasks` — for dropdowns
- `GET  /api/calendar/events?start=&end=` — normalized events + proposed matches
  + dedup status
- `GET  /api/timesheet/daily?start=&end=` — events grouped by day
- `GET  /api/timesheet/weekly?week=` — totals per Project/Task (contract)
- `POST /api/timesheet/push` — body: approved entries (event uid, start, date,
  hours, project_id, task_id, description) → creates lines in Odoo, updates
  ledger; returns per-row results
- `GET/POST/PUT/DELETE /api/rules` — CRUD for keyword rules
- `POST /api/settings/test-connection` — validate Odoo + iCal connectivity

## 12. Frontend screens (React, designed with ui-ux-pro-max)

- **Top bar** — date-range picker, **Refresh from calendar** button, connection
  status indicator.
- **Daily view** ("Load hours") — events grouped by day; each row shows time,
  title, hours, matched Project/Task (editable dropdown), status (New / Already
  logged), and an approve checkbox → **Push approved to Odoo**.
- **Weekly-by-contract view** ("Load hours per contract — weekly") — totals per
  Project/Task for the selected week (table + simple bar chart).
- **Mapping rules** — add/edit/delete keyword rules with real Odoo project/task
  dropdowns.
- **Settings** — connection test and config status.

## 13. Config & secrets

Backend `.env` (with a committed `.env.example`):

```
ICAL_URL=
ODOO_URL=
ODOO_DB=
ODOO_USERNAME=
ODOO_API_KEY=
LOCAL_TZ=Europe/Lisbon
```

Rules and the dedup ledger live as JSON files in a local `backend/data/` dir.
No secrets or local state are committed to the repo (`.env` and `backend/data/`
are git-ignored).

## 14. Error handling

- Structured API errors surfaced as clear toasts in the UI: iCal unreachable /
  unparseable, Odoo connection or auth failure, no matching employee, etc.
- **Push** handles partial failure: each row returns success or a reason; the
  ledger records only successes, so a retry re-attempts just the failures.

## 15. Testing strategy

- **Backend unit tests** with `.ics` fixtures covering recurring, all-day, and
  declined events; `matcher` rule logic (priority, multi-keyword, unmatched);
  `aggregations` (daily, weekly); `ledger` dedup behavior. `odoo_client` tested
  against a mocked XML-RPC endpoint.
- **Frontend**: light component tests for the review table and rules editor;
  manual verification via the running app.

## 16. Project layout

```
odoo-hours-logger/
  backend/
    app/
      main.py            # FastAPI app + routes
      config.py          # settings from .env
      calendar_source.py # fetch + parse iCal, expand recurrences, compute hours
      odoo_client.py     # XML-RPC wrapper
      matcher.py         # keyword → project/task matching
      rules.py           # CRUD for mapping rules (rules.json)
      ledger.py          # dedup ledger (ledger.json)
      aggregations.py    # daily + weekly-per-contract rollups
      schemas.py         # Pydantic models
    data/                # rules.json + ledger.json (git-ignored)
    tests/
    pyproject.toml
    .env.example
  frontend/              # React + Vite + TS
    src/
      api/               # API client
      components/
      pages/             # Daily, WeeklyByContract, MappingRules, Settings
  README.md
```

## 17. Open questions / future enhancements

- Optional rounding of hours (e.g. nearest 0.25h).
- Edit/delete of already-logged lines from the app.
- Multiple calendars / per-calendar default project.
- Regex or attendee-based matching in addition to title keywords.
