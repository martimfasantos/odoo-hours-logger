# Odoo Hours Logger — User & Technical Guide

This app reads your Google Calendar, maps each event to an Odoo **contract** via keyword
rules, lets you review the proposed entries, and pushes them to Odoo as timesheet entries.
It runs locally: a Python **FastAPI** backend (port **8010**) and a **React/Vite** frontend
(port **5173**). There is **no database** and **no LLM** — state lives in plain JSON files and
matching is plain keyword substring matching.

```
Google Calendar ──(secret iCal URL)──▶  FastAPI backend  ◀──(session cookie, XML/JSON-RPC)──▶  Odoo
                                              │
                                              ▼  REST/JSON
                                         React frontend (you)
```

---

## 1. Configuration — what to set and where

All configuration lives in **`backend/.env`**. You can edit it two ways:

- **Settings tab in the UI** (recommended) — every value is editable there, shown masked
  (password-style) with an eye toggle to reveal/edit. **Save** writes `backend/.env` and applies
  the change immediately (no restart). This is the easiest place to **re-paste an expired
  `ODOO_SESSION_ID`**.
- **Editing `backend/.env` directly** — copy `backend/.env.example` to `backend/.env` and fill it
  in. (If the backend is already running, the Settings-tab save path applies changes live; a
  manual file edit is picked up on the next backend start.)

| Variable | Required? | Where / how to get it |
|---|---|---|
| `GOOGLE_CALENDAR_URL` | **Yes** | Google Calendar → Settings → your calendar → *Integrate calendar* → **"Secret address in iCal format"**. (The "public" address only works if the calendar is truly world-public with *full event details*; the secret address always works.) |
| `ODOO_URL` | **Yes** | `https://erp.daredata.engineering` |
| `ODOO_DB` | **Yes** | `odoo` |
| `ODOO_SESSION_ID` | **Yes** | Your live Odoo session cookie. In a logged-in Odoo browser tab: DevTools → Application → Cookies → copy `session_id`. **It expires** (logout / server restart / re-login) — re-paste a fresh one in the Settings tab when the connection test fails. |
| `ODOO_VISITOR_UUID` | No | The `visitor_uuid` cookie (optional; leave blank if absent). |
| `ODOO_USER_ID` | No | Auto-discovered from the session. Set only to override. |
| `ODOO_NETWORK_MEMBER_ID` | No | Auto-discovered from the session. Set only to override. |
| `LOCAL_TZ` | No | Your timezone (default `Europe/Lisbon`). |
| `USER_EMAIL` | No | Auto-derived from the Odoo session (used to skip *declined* calendar events). Set only to override (e.g. if your calendar address differs from your Odoo login). |
| `DEMO_MODE` | No | `true` runs the whole UI on sample data with a simulated push and **no** real Odoo/Calendar calls. `false` (default) = live. |
| `DATA_DIR` | No | Where the JSON state files live (default `data`, i.e. `backend/data/`). |

> **VPN:** Odoo (`erp.daredata.engineering`) is only reachable on the company VPN. With the VPN off,
> Odoo calls fail and the app shows a **"Can't reach Odoo — verify your VPN"** popup. The Google
> Calendar side works without the VPN.

---

## 2. How it connects to Odoo (technical)

This Odoo instance has **no API keys**, so the app authenticates **the same way your browser does** —
with your session cookie:

- Every request sends the `session_id` **cookie** plus an `X-Openerp-Session-Id` header and a
  `Referer: <ODOO_URL>/web` header, to Odoo's **web JSON-RPC** routes:
  - `POST /web/session/get_session_info` → returns your `uid` and `username` (your email).
  - `POST /web/dataset/call_kw/<model>/<method>` with `{"jsonrpc":"2.0","method":"call","params":{model,method,args,kwargs}}`.
- **Identity is auto-discovered** from the session (you don't hard-code it):
  - `uid` comes from `get_session_info`.
  - your **`network_member`** id is found via `search_read` on the `network_member` model where its
    `user` field equals your `uid`.
  - Both can be overridden with `ODOO_USER_ID` / `ODOO_NETWORK_MEMBER_ID` if needed.
- **Failure modes are distinguished:** an HTML/login response or `uid: null` → *session expired*
  (re-paste `ODOO_SESSION_ID`); a connection error (httpx `RequestError`, ~6s connect timeout) →
  *unreachable* → the VPN popup.

Timesheets are written to Daredata's **custom `timesheet_entry` model** (not the standard
`account.analytic.line`).

---

## 3. How it gets your contracts (technical)

Hours are logged against **contracts**. The dropdowns and color legend are populated from Odoo's
`contract` model, filtered to **only your contracts**:

- `list_contracts()` → `call_kw("contract", "search_read", [[["network_member", "=", <your member id>]]], {fields:["display_name"], order:"display_name"})`.
- The `network_member` filter is your auto-discovered member id (see §2), so you see only contracts
  assigned to you (e.g. "[2390] … - Gen-OS AI Team", "[2346] … - Porto de Lisboa", …) — not the
  hundreds across the whole company.
- Each contract is returned as `{id, name}` where `name` is the rich `display_name`. The numeric id
  is what gets written to the timesheet.
- You can give each contract a **color** (stored per contract id) — shown as a dot in the Contract
  column, in the calendar blocks, and in the per-contract summaries.

---

## 4. How it loads your calendar

- The backend fetches your **secret iCal URL** over HTTPS (`GET`), so no Google OAuth is needed.
- It parses the `.ics` with `icalendar` and expands **recurring events** within the selected date
  range using `recurring-ical-events`.
- Per event it computes **hours = end − start** (timezone-aware, normalized to `LOCAL_TZ`).
- It **skips**: all-day events (date-only, no real duration), **declined** events (an `ATTENDEE`
  with `PARTSTAT=DECLINED` matching your `USER_EMAIL`), and zero/negative-duration events.
  Events using `DURATION` instead of `DTEND` are supported.
- Then it applies your **filter words** (see §6) — any event whose title contains a filter word is
  dropped from the import.
- In **Log Hours**, pick a **From / To** range (inclusive — exactly the days you select) and click
  **Refresh from calendar**.

---

## 5. How rules work, and what they do

Rules map a **keyword (found in the event title) → an Odoo contract**. Manage them in the
**Mapping rules** tab.

- A rule has: a **name**, one or more **keywords**, a **contract**, and an **active** toggle.
- **Matching:** for each calendar event, the app lowercases the title and checks each *active* rule
  (in rule **id / creation order**); the **first** rule with any keyword that is a **case-insensitive
  substring** of the title wins, and its contract is proposed for that event. Other matching rules
  are recorded as alternatives. (There is no priority field — order is creation order.)
- Events with no matching rule show as **Unassigned**; you can still pick a contract manually per
  row before pushing.
- Rules are stored in `backend/data/rules.json`.

**The full flow:** load calendar events → match to contracts via rules → review/adjust in the table
(edit contract, description, deselect rows) → **Push approved to Odoo**.

---

## 6. Filter words (ignored events)

On the **Mapping rules** tab, "Filter words" lets you list titles to **skip on import** — e.g.
`Out of Office`, `Lunch`. Any event whose title contains one of these (case-insensitive substring)
is excluded from the calendar import entirely. Stored in `backend/data/ignore_keywords.json`.

---

## 7. Pushing & double-log protection

- A push creates a `timesheet_entry` in Odoo with `{network_member, contract, work_description,
  start_time, end_time}` (times sent in UTC). The **description** defaults to the event title and is
  editable per row.
- **Dedup:** an entry is treated as *already logged* if it's in the local ledger
  (`backend/data/ledger.json`, keyed by event uid + start) **or** if a matching entry already exists
  in Odoo for that range (same contract + start/end, fetched via `timesheet_entry` `search_read`).
  Already-logged rows render greyed-out with a "✓ Logged" badge and can't be re-pushed, so reloading
  a week never double-logs.
- Nothing is written until you click **Push approved to Odoo**; by default all imported rows are
  pre-selected, and you can deselect at the row / day / week / global level.

---

## 8. The "Logged" tab

A month-to-date overview (`GET /api/overview`):

- A **calendar** of time blocks: **solid** = already logged in Odoo, **outlined** = matched but not
  yet logged. Colored by contract.
- Below it, a **per-contract breakdown** with **Logged** and **Not logged** hour columns (and a
  total) for the selected month, with prev/next month navigation.

"Logged" hours come from Odoo's existing `timesheet_entry` records; "Not logged" comes from your
calendar events that match a contract but aren't in Odoo yet.

---

## 9. Demo mode

Set `DEMO_MODE=true` (in Settings or `.env`) to explore the entire UI with **sample contracts,
events, and logged entries**, and a **simulated push** (nothing is sent to Odoo). Useful for trying
the app with no VPN/credentials. Set it back to `false` for live use.

---

## 10. Running, data, and tests

- **Run both servers:** from the repo root, `./run.sh` (backend on :8010, frontend on :5173, opens
  the URLs; Ctrl-C stops both). Or separately: `cd backend && ./run.sh` and `cd frontend && npm run dev`.
- **State files** (all in `backend/data/`, git-ignored): `rules.json`, `ignore_keywords.json`,
  `project_colors.json`, `ledger.json`. No database.
- **Secrets** (`backend/.env`) are git-ignored and never committed.
- **Tests:** backend `cd backend && . .venv/bin/activate && pytest`; frontend `cd frontend && npm test`.

---

## 11. Quick troubleshooting

| Symptom | Cause / fix |
|---|---|
| "Can't reach Odoo" popup / Odoo "Down" | VPN is off → connect to the VPN and retry. |
| Odoo connection test fails with a session message | `ODOO_SESSION_ID` expired → copy a fresh `session_id` from a logged-in Odoo tab into the Settings tab. |
| No events appear after Refresh | Check the date range; check `GOOGLE_CALENDAR_URL` (use the *secret* iCal address with full event details). |
| An event you didn't want got imported | Add a **filter word** that matches its title. |
| Events show "Unassigned" | No rule matched the title — add a mapping rule (keyword → contract) or pick a contract manually. |
