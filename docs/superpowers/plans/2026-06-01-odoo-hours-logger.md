# Odoo Hours Logger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A locally-run tool that reads my Google Calendar via a private iCal URL, maps each event's title to an Odoo Project/Task via keyword rules, and lets me review and push timesheet entries to Odoo with a click.

**Architecture:** Python FastAPI backend exposes a REST API; a clean React (Vite + TS) frontend consumes it. Calendar events are fetched from a private iCal URL and parsed; keyword rules and a dedup ledger are persisted as plain JSON files (no database); Odoo is reached over XML-RPC. Nothing is written to Odoo without an explicit user action.

**Tech Stack:** Python 3.12, FastAPI, uvicorn, pydantic-settings, httpx, icalendar, recurring-ical-events, xmlrpc (stdlib), pytest. Frontend: React + Vite + TypeScript + React Router, styled via the ui-ux-pro-max skill.

**Spec:** `docs/superpowers/specs/2026-06-01-odoo-hours-logger-design.md`

---

## File Structure

Backend (`backend/app/`), one responsibility per file:

| File | Responsibility |
|---|---|
| `config.py` | Load settings from `.env` (pydantic-settings) |
| `schemas.py` | Pydantic models shared across modules + API |
| `calendar_source.py` | Fetch iCal, parse + expand recurrences, compute hours, skip all-day/declined |
| `matcher.py` | Title-keyword → Project/Task matching |
| `rules.py` | CRUD store for `rules.json` |
| `ledger.py` | Dedup store for `ledger.json` |
| `aggregations.py` | Daily grouping + weekly-per-contract totals |
| `odoo_client.py` | XML-RPC wrapper: projects, tasks, employee, create timesheet |
| `main.py` | FastAPI app + routes wiring everything together |

Frontend (`frontend/src/`):

| Path | Responsibility |
|---|---|
| `api/types.ts` | TypeScript types mirroring backend schemas |
| `api/client.ts` | Typed fetch wrappers for each endpoint |
| `App.tsx` + `main.tsx` | App shell + routing |
| `pages/DailyView.tsx` | "Load hours" review table + push |
| `pages/WeeklyByContract.tsx` | Weekly totals per contract |
| `pages/MappingRules.tsx` | Rules CRUD editor |
| `pages/Settings.tsx` | Connection test + config status |

Data files (git-ignored): `backend/data/rules.json`, `backend/data/ledger.json`.

---

## Phase 1 — Project scaffolding

### Task 1: Backend project skeleton

**Files:**
- Create: `backend/pyproject.toml`
- Create: `backend/.env.example`
- Create: `backend/app/__init__.py` (empty)
- Create: `backend/tests/__init__.py` (empty)
- Create: `backend/tests/conftest.py`

- [ ] **Step 1: Create `backend/pyproject.toml`**

```toml
[project]
name = "odoo-hours-logger"
version = "0.1.0"
description = "Log Google Calendar hours into Odoo timesheets"
requires-python = ">=3.12"
dependencies = [
    "fastapi>=0.110",
    "uvicorn[standard]>=0.29",
    "pydantic>=2.6",
    "pydantic-settings>=2.2",
    "httpx>=0.27",
    "icalendar>=5.0",
    "recurring-ical-events>=2.1",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.0",
    "pytest-cov>=5.0",
]

[tool.pytest.ini_options]
testpaths = ["tests"]
addopts = "-q"

[build-system]
requires = ["setuptools>=68"]
build-backend = "setuptools.build_meta"

[tool.setuptools.packages.find]
include = ["app*"]
```

- [ ] **Step 2: Create `backend/.env.example`**

```
ICAL_URL=
ODOO_URL=
ODOO_DB=
ODOO_USERNAME=
ODOO_API_KEY=
LOCAL_TZ=Europe/Lisbon
USER_EMAIL=
DATA_DIR=data
```

- [ ] **Step 3: Create empty package files**

Create `backend/app/__init__.py` and `backend/tests/__init__.py` as empty files.

- [ ] **Step 4: Create `backend/tests/conftest.py`**

```python
import sys
from pathlib import Path

# Ensure `app` package is importable when running pytest from backend/
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
```

- [ ] **Step 5: Create venv and install**

Run:
```bash
cd backend && python -m venv .venv && . .venv/bin/activate && pip install -e ".[dev]"
```
Expected: installs without error; `pytest --version` works.

- [ ] **Step 6: Verify pytest runs (no tests yet)**

Run: `cd backend && . .venv/bin/activate && pytest`
Expected: "no tests ran" (exit 5) — confirms collection works.

- [ ] **Step 7: Commit**

```bash
git add backend/pyproject.toml backend/.env.example backend/app/__init__.py backend/tests/__init__.py backend/tests/conftest.py
git commit -m "chore: scaffold backend project"
```

---

## Phase 2 — Config

### Task 2: Settings loader

**Files:**
- Create: `backend/app/config.py`
- Test: `backend/tests/test_config.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_config.py
from app.config import Settings


def test_settings_load_from_env_values():
    s = Settings(
        ICAL_URL="https://example.com/basic.ics",
        ODOO_URL="https://odoo.example.com",
        ODOO_DB="mydb",
        ODOO_USERNAME="me@example.com",
        ODOO_API_KEY="secret",
        LOCAL_TZ="Europe/Lisbon",
        USER_EMAIL="me@example.com",
        DATA_DIR="data",
    )
    assert s.ICAL_URL == "https://example.com/basic.ics"
    assert s.LOCAL_TZ == "Europe/Lisbon"
    assert s.data_path("rules.json").name == "rules.json"


def test_local_tz_defaults_to_lisbon():
    s = Settings(
        ICAL_URL="x", ODOO_URL="x", ODOO_DB="x",
        ODOO_USERNAME="x", ODOO_API_KEY="x",
    )
    assert s.LOCAL_TZ == "Europe/Lisbon"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_config.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.config'`.

- [ ] **Step 3: Implement `backend/app/config.py`**

```python
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    ICAL_URL: str
    ODOO_URL: str
    ODOO_DB: str
    ODOO_USERNAME: str
    ODOO_API_KEY: str
    LOCAL_TZ: str = "Europe/Lisbon"
    USER_EMAIL: str = ""
    DATA_DIR: str = "data"

    def data_path(self, filename: str) -> Path:
        d = Path(self.DATA_DIR)
        d.mkdir(parents=True, exist_ok=True)
        return d / filename


def get_settings() -> Settings:
    return Settings()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_config.py -v`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/app/config.py backend/tests/test_config.py
git commit -m "feat: add settings loader from .env"
```

---

## Phase 3 — Schemas

### Task 3: Shared Pydantic models

**Files:**
- Create: `backend/app/schemas.py`
- Test: `backend/tests/test_schemas.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_schemas.py
from datetime import date, datetime

from app.schemas import CalendarEvent, Rule, RuleCreate, PushEntry


def test_calendar_event_roundtrip():
    ev = CalendarEvent(
        uid="abc",
        title="GreenVolt standup",
        start=datetime(2026, 6, 1, 9, 0),
        end=datetime(2026, 6, 1, 9, 30),
        hours=0.5,
        date=date(2026, 6, 1),
    )
    assert ev.hours == 0.5
    assert ev.title == "GreenVolt standup"


def test_rule_create_defaults_active_true():
    rc = RuleCreate(
        name="GreenVolt",
        keywords=["greenvolt"],
        project_id=10,
        project_name="GreenVolt",
        task_id=55,
        task_name="Meetings",
        priority=1,
    )
    assert rc.active is True


def test_push_entry_requires_targets():
    pe = PushEntry(
        uid="abc",
        start=datetime(2026, 6, 1, 9, 0),
        date=date(2026, 6, 1),
        hours=0.5,
        description="GreenVolt standup",
        project_id=10,
        task_id=55,
    )
    assert pe.project_id == 10
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_schemas.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.schemas'`.

- [ ] **Step 3: Implement `backend/app/schemas.py`**

```python
from datetime import date as Date
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class CalendarEvent(BaseModel):
    uid: str
    title: str
    start: datetime
    end: datetime
    hours: float
    date: Date


class RuleCreate(BaseModel):
    name: str
    keywords: list[str]
    project_id: int
    project_name: str
    task_id: Optional[int] = None
    task_name: Optional[str] = None
    priority: int = 100
    active: bool = True


class Rule(RuleCreate):
    id: int


class MatchResult(BaseModel):
    rule_id: Optional[int] = None
    project_id: Optional[int] = None
    project_name: Optional[str] = None
    task_id: Optional[int] = None
    task_name: Optional[str] = None
    alternative_rule_ids: list[int] = Field(default_factory=list)


class ProposedEntry(BaseModel):
    event: CalendarEvent
    match: MatchResult
    already_logged: bool = False
    overlaps: bool = False


class PushEntry(BaseModel):
    uid: str
    start: datetime
    date: Date
    hours: float
    description: str
    project_id: int
    task_id: Optional[int] = None


class PushResult(BaseModel):
    uid: str
    start: datetime
    success: bool
    odoo_line_id: Optional[int] = None
    error: Optional[str] = None


class OdooRef(BaseModel):
    id: int
    name: str


class ContractTotal(BaseModel):
    project_id: int
    project_name: str
    task_id: Optional[int] = None
    task_name: Optional[str] = None
    hours: float
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_schemas.py -v`
Expected: PASS (3 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/app/schemas.py backend/tests/test_schemas.py
git commit -m "feat: add shared pydantic schemas"
```

---

## Phase 4 — Calendar source

### Task 4: Parse iCal events (duration, all-day, recurrence, declined)

**Files:**
- Create: `backend/app/calendar_source.py`
- Create: `backend/tests/fixtures/sample.ics`
- Test: `backend/tests/test_calendar_source.py`

- [ ] **Step 1: Create the fixture `backend/tests/fixtures/sample.ics`**

```
BEGIN:VCALENDAR
PRODID:-//Test//Test//EN
VERSION:2.0
BEGIN:VEVENT
UID:evt-timed-1
SUMMARY:GreenVolt standup
DTSTART:20260601T080000Z
DTEND:20260601T083000Z
END:VEVENT
BEGIN:VEVENT
UID:evt-allday-1
SUMMARY:Public holiday
DTSTART;VALUE=DATE:20260601
DTEND;VALUE=DATE:20260602
END:VEVENT
BEGIN:VEVENT
UID:evt-declined-1
SUMMARY:Some meeting I declined
DTSTART:20260601T100000Z
DTEND:20260601T110000Z
ATTENDEE;PARTSTAT=DECLINED:mailto:me@example.com
END:VEVENT
BEGIN:VEVENT
UID:evt-weekly-1
SUMMARY:Weekly sync
DTSTART:20260601T140000Z
DTEND:20260601T150000Z
RRULE:FREQ=WEEKLY;COUNT=3
END:VEVENT
END:VCALENDAR
```

- [ ] **Step 2: Write the failing test**

```python
# backend/tests/test_calendar_source.py
from datetime import date
from pathlib import Path

from app.calendar_source import parse_events

FIXTURE = (Path(__file__).parent / "fixtures" / "sample.ics").read_text()


def _by_uid(events):
    out = {}
    for e in events:
        out.setdefault(e.uid, []).append(e)
    return out


def test_timed_event_hours_and_date():
    events = parse_events(FIXTURE, date(2026, 6, 1), date(2026, 6, 1),
                          local_tz="Europe/Lisbon", user_email="me@example.com")
    by = _by_uid(events)
    assert "evt-timed-1" in by
    ev = by["evt-timed-1"][0]
    assert ev.hours == 0.5
    assert ev.date == date(2026, 6, 1)


def test_all_day_event_skipped():
    events = parse_events(FIXTURE, date(2026, 6, 1), date(2026, 6, 1),
                          local_tz="Europe/Lisbon", user_email="me@example.com")
    assert "evt-allday-1" not in _by_uid(events)


def test_declined_event_skipped_when_email_matches():
    events = parse_events(FIXTURE, date(2026, 6, 1), date(2026, 6, 1),
                          local_tz="Europe/Lisbon", user_email="me@example.com")
    assert "evt-declined-1" not in _by_uid(events)


def test_declined_event_kept_when_no_user_email():
    events = parse_events(FIXTURE, date(2026, 6, 1), date(2026, 6, 1),
                          local_tz="Europe/Lisbon", user_email="")
    assert "evt-declined-1" in _by_uid(events)


def test_recurring_event_expanded_into_instances():
    events = parse_events(FIXTURE, date(2026, 6, 1), date(2026, 6, 30),
                          local_tz="Europe/Lisbon", user_email="me@example.com")
    instances = _by_uid(events).get("evt-weekly-1", [])
    assert len(instances) == 3
    starts = sorted(e.start.date() for e in instances)
    assert starts[0] == date(2026, 6, 1)
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pytest tests/test_calendar_source.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.calendar_source'`.

- [ ] **Step 4: Implement `backend/app/calendar_source.py`**

```python
from datetime import date as Date
from datetime import datetime, time
from zoneinfo import ZoneInfo

import httpx
import recurring_ical_events
from icalendar import Calendar

from app.schemas import CalendarEvent


def fetch_ical(url: str, timeout: float = 30.0) -> str:
    resp = httpx.get(url, timeout=timeout, follow_redirects=True)
    resp.raise_for_status()
    return resp.text


def _is_declined(component, user_email: str) -> bool:
    if not user_email:
        return False
    attendees = component.get("ATTENDEE")
    if attendees is None:
        return False
    if not isinstance(attendees, list):
        attendees = [attendees]
    target = user_email.lower()
    for att in attendees:
        addr = str(att).lower().replace("mailto:", "").strip()
        if addr == target:
            partstat = str(att.params.get("PARTSTAT", "")).upper()
            if partstat == "DECLINED":
                return True
    return False


def parse_events(
    ics_text: str,
    start: Date,
    end: Date,
    local_tz: str,
    user_email: str = "",
) -> list[CalendarEvent]:
    cal = Calendar.from_ical(ics_text)
    tz = ZoneInfo(local_tz)
    # recurring_ical_events.between is inclusive of the start, exclusive of end+1day
    window_end = datetime.combine(end, time(23, 59, 59))
    window_start = datetime.combine(start, time(0, 0, 0))
    components = recurring_ical_events.of(cal).between(window_start, window_end)

    events: list[CalendarEvent] = []
    for comp in components:
        dtstart = comp.get("DTSTART").dt
        dtend_field = comp.get("DTEND")
        # All-day events have a `date` (not datetime) DTSTART -> skip
        if not isinstance(dtstart, datetime):
            continue
        if dtend_field is None:
            continue
        dtend = dtend_field.dt
        if not isinstance(dtend, datetime):
            continue
        if _is_declined(comp, user_email):
            continue

        # Normalize to local tz (naive datetimes are assumed already local)
        if dtstart.tzinfo is not None:
            dtstart = dtstart.astimezone(tz)
            dtend = dtend.astimezone(tz)

        hours = round((dtend - dtstart).total_seconds() / 3600.0, 2)
        if hours <= 0:
            continue

        events.append(
            CalendarEvent(
                uid=str(comp.get("UID")),
                title=str(comp.get("SUMMARY", "")),
                start=dtstart,
                end=dtend,
                hours=hours,
                date=dtstart.date(),
            )
        )
    return events
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pytest tests/test_calendar_source.py -v`
Expected: PASS (5 passed).

- [ ] **Step 6: Commit**

```bash
git add backend/app/calendar_source.py backend/tests/test_calendar_source.py backend/tests/fixtures/sample.ics
git commit -m "feat: parse ical events with recurrence, all-day and declined handling"
```

---

## Phase 5 — Matcher

### Task 5: Title-keyword matching

**Files:**
- Create: `backend/app/matcher.py`
- Test: `backend/tests/test_matcher.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_matcher.py
from app.matcher import match_title
from app.schemas import Rule


def _rule(id, name, keywords, project_id, priority=100, active=True, task_id=None):
    return Rule(
        id=id, name=name, keywords=keywords, project_id=project_id,
        project_name=name, task_id=task_id, task_name=None,
        priority=priority, active=active,
    )


def test_single_keyword_match():
    rules = [_rule(1, "GreenVolt", ["greenvolt"], 10)]
    m = match_title("GreenVolt standup", rules)
    assert m.rule_id == 1
    assert m.project_id == 10


def test_match_is_case_insensitive():
    rules = [_rule(1, "GreenVolt", ["GREENVOLT"], 10)]
    m = match_title("greenvolt sync", rules)
    assert m.rule_id == 1


def test_priority_decides_winner_and_records_alternatives():
    rules = [
        _rule(1, "Generic", ["sync"], 99, priority=200),
        _rule(2, "GreenVolt", ["greenvolt"], 10, priority=1),
    ]
    m = match_title("GreenVolt sync", rules)
    assert m.rule_id == 2
    assert m.alternative_rule_ids == [1]


def test_inactive_rule_ignored():
    rules = [_rule(1, "GreenVolt", ["greenvolt"], 10, active=False)]
    m = match_title("GreenVolt standup", rules)
    assert m.rule_id is None


def test_no_match_returns_empty_result():
    rules = [_rule(1, "GreenVolt", ["greenvolt"], 10)]
    m = match_title("Lunch", rules)
    assert m.rule_id is None
    assert m.project_id is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_matcher.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.matcher'`.

- [ ] **Step 3: Implement `backend/app/matcher.py`**

```python
from app.schemas import MatchResult, Rule


def match_title(title: str, rules: list[Rule]) -> MatchResult:
    title_l = (title or "").lower()
    active = [r for r in rules if r.active]
    ordered = sorted(active, key=lambda r: r.priority)

    matched = [
        r for r in ordered
        if any(kw.lower() in title_l for kw in r.keywords if kw)
    ]
    if not matched:
        return MatchResult()

    winner = matched[0]
    return MatchResult(
        rule_id=winner.id,
        project_id=winner.project_id,
        project_name=winner.project_name,
        task_id=winner.task_id,
        task_name=winner.task_name,
        alternative_rule_ids=[r.id for r in matched[1:]],
    )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_matcher.py -v`
Expected: PASS (5 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/app/matcher.py backend/tests/test_matcher.py
git commit -m "feat: add title-keyword matcher"
```

---

## Phase 6 — Rules store

### Task 6: JSON-backed rules CRUD

**Files:**
- Create: `backend/app/rules.py`
- Test: `backend/tests/test_rules.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_rules.py
from app.rules import RulesStore
from app.schemas import RuleCreate


def _store(tmp_path):
    return RulesStore(tmp_path / "rules.json")


def _payload(name="GreenVolt"):
    return RuleCreate(
        name=name, keywords=["greenvolt"], project_id=10,
        project_name="GreenVolt", task_id=55, task_name="Meetings", priority=1,
    )


def test_list_empty_when_no_file(tmp_path):
    assert _store(tmp_path).list() == []


def test_create_assigns_incrementing_ids(tmp_path):
    s = _store(tmp_path)
    r1 = s.create(_payload("A"))
    r2 = s.create(_payload("B"))
    assert r1.id == 1
    assert r2.id == 2
    assert [r.name for r in s.list()] == ["A", "B"]


def test_create_persists_across_instances(tmp_path):
    _store(tmp_path).create(_payload())
    reloaded = _store(tmp_path)
    assert len(reloaded.list()) == 1


def test_update_changes_fields(tmp_path):
    s = _store(tmp_path)
    r = s.create(_payload())
    updated = s.update(r.id, RuleCreate(
        name="GreenVolt", keywords=["gv", "greenvolt"], project_id=10,
        project_name="GreenVolt", task_id=55, task_name="Meetings", priority=5,
    ))
    assert updated.priority == 5
    assert "gv" in updated.keywords


def test_delete_removes_rule(tmp_path):
    s = _store(tmp_path)
    r = s.create(_payload())
    s.delete(r.id)
    assert s.list() == []
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_rules.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.rules'`.

- [ ] **Step 3: Implement `backend/app/rules.py`**

```python
import json
from pathlib import Path

from app.schemas import Rule, RuleCreate


class RulesStore:
    def __init__(self, path: Path):
        self.path = Path(path)

    def _load_raw(self) -> list[dict]:
        if not self.path.exists():
            return []
        return json.loads(self.path.read_text() or "[]")

    def _save_raw(self, items: list[dict]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(items, indent=2, default=str))

    def list(self) -> list[Rule]:
        return [Rule(**item) for item in self._load_raw()]

    def create(self, data: RuleCreate) -> Rule:
        items = self._load_raw()
        next_id = max((item["id"] for item in items), default=0) + 1
        rule = Rule(id=next_id, **data.model_dump())
        items.append(rule.model_dump())
        self._save_raw(items)
        return rule

    def update(self, rule_id: int, data: RuleCreate) -> Rule:
        items = self._load_raw()
        for idx, item in enumerate(items):
            if item["id"] == rule_id:
                updated = Rule(id=rule_id, **data.model_dump())
                items[idx] = updated.model_dump()
                self._save_raw(items)
                return updated
        raise KeyError(f"Rule {rule_id} not found")

    def delete(self, rule_id: int) -> None:
        items = [i for i in self._load_raw() if i["id"] != rule_id]
        self._save_raw(items)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_rules.py -v`
Expected: PASS (5 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/app/rules.py backend/tests/test_rules.py
git commit -m "feat: add json-backed rules store"
```

---

## Phase 7 — Ledger (dedup)

### Task 7: JSON-backed dedup ledger

**Files:**
- Create: `backend/app/ledger.py`
- Test: `backend/tests/test_ledger.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_ledger.py
from datetime import datetime

from app.ledger import Ledger


def _ledger(tmp_path):
    return Ledger(tmp_path / "ledger.json")


def test_not_logged_initially(tmp_path):
    lg = _ledger(tmp_path)
    assert lg.is_logged("uid-1", datetime(2026, 6, 1, 9, 0)) is False


def test_record_then_is_logged(tmp_path):
    lg = _ledger(tmp_path)
    lg.record("uid-1", datetime(2026, 6, 1, 9, 0), odoo_line_id=500,
              project_id=10, task_id=55, hours=0.5, pushed_at="2026-06-01T10:00:00")
    assert lg.is_logged("uid-1", datetime(2026, 6, 1, 9, 0)) is True


def test_same_uid_different_start_is_separate(tmp_path):
    lg = _ledger(tmp_path)
    lg.record("uid-1", datetime(2026, 6, 1, 9, 0), odoo_line_id=500,
              project_id=10, task_id=55, hours=0.5, pushed_at="x")
    assert lg.is_logged("uid-1", datetime(2026, 6, 8, 9, 0)) is False


def test_persists_across_instances(tmp_path):
    _ledger(tmp_path).record("uid-1", datetime(2026, 6, 1, 9, 0), odoo_line_id=1,
                             project_id=10, task_id=None, hours=1.0, pushed_at="x")
    assert _ledger(tmp_path).is_logged("uid-1", datetime(2026, 6, 1, 9, 0)) is True
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_ledger.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.ledger'`.

- [ ] **Step 3: Implement `backend/app/ledger.py`**

```python
import json
from datetime import datetime
from pathlib import Path
from typing import Optional


def _key(uid: str, start: datetime) -> str:
    return f"{uid}|{start.isoformat()}"


class Ledger:
    def __init__(self, path: Path):
        self.path = Path(path)

    def _load(self) -> list[dict]:
        if not self.path.exists():
            return []
        return json.loads(self.path.read_text() or "[]")

    def _save(self, items: list[dict]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(items, indent=2, default=str))

    def _keys(self) -> set[str]:
        return {f"{i['event_uid']}|{i['event_start']}" for i in self._load()}

    def is_logged(self, uid: str, start: datetime) -> bool:
        return _key(uid, start) in self._keys()

    def record(self, uid: str, start: datetime, odoo_line_id: int,
               project_id: int, task_id: Optional[int], hours: float,
               pushed_at: str) -> None:
        items = self._load()
        items.append({
            "event_uid": uid,
            "event_start": start.isoformat(),
            "odoo_line_id": odoo_line_id,
            "project_id": project_id,
            "task_id": task_id,
            "hours": hours,
            "pushed_at": pushed_at,
        })
        self._save(items)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_ledger.py -v`
Expected: PASS (4 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/app/ledger.py backend/tests/test_ledger.py
git commit -m "feat: add json-backed dedup ledger"
```

---

## Phase 8 — Aggregations

### Task 8: Daily grouping + weekly-per-contract totals

**Files:**
- Create: `backend/app/aggregations.py`
- Test: `backend/tests/test_aggregations.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_aggregations.py
from datetime import date, datetime

from app.aggregations import group_by_day, weekly_by_contract
from app.schemas import CalendarEvent, ProposedEntry, MatchResult


def _event(uid, d, hours, title="x"):
    start = datetime(d.year, d.month, d.day, 9, 0)
    return CalendarEvent(uid=uid, title=title, start=start,
                         end=start, hours=hours, date=d)


def test_group_by_day_buckets_events():
    events = [
        _event("a", date(2026, 6, 1), 1.0),
        _event("b", date(2026, 6, 1), 0.5),
        _event("c", date(2026, 6, 2), 2.0),
    ]
    grouped = group_by_day(events)
    assert sorted(grouped.keys()) == [date(2026, 6, 1), date(2026, 6, 2)]
    assert len(grouped[date(2026, 6, 1)]) == 2


def test_weekly_by_contract_sums_per_project_task():
    def proposed(uid, hours, pid, pname, tid, tname):
        ev = _event(uid, date(2026, 6, 1), hours)
        match = MatchResult(project_id=pid, project_name=pname,
                            task_id=tid, task_name=tname)
        return ProposedEntry(event=ev, match=match)

    entries = [
        proposed("a", 1.0, 10, "GreenVolt", 55, "Meetings"),
        proposed("b", 0.5, 10, "GreenVolt", 55, "Meetings"),
        proposed("c", 2.0, 20, "Lisport", None, None),
    ]
    totals = weekly_by_contract(entries)
    gv = [t for t in totals if t.project_id == 10][0]
    assert gv.hours == 1.5
    assert gv.task_name == "Meetings"
    lisport = [t for t in totals if t.project_id == 20][0]
    assert lisport.hours == 2.0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_aggregations.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.aggregations'`.

- [ ] **Step 3: Implement `backend/app/aggregations.py`**

```python
from collections import defaultdict
from datetime import date as Date

from app.schemas import CalendarEvent, ContractTotal, ProposedEntry


def group_by_day(events: list[CalendarEvent]) -> dict[Date, list[CalendarEvent]]:
    grouped: dict[Date, list[CalendarEvent]] = defaultdict(list)
    for ev in events:
        grouped[ev.date].append(ev)
    return dict(grouped)


def weekly_by_contract(entries: list[ProposedEntry]) -> list[ContractTotal]:
    buckets: dict[tuple, ContractTotal] = {}
    for entry in entries:
        m = entry.match
        if m.project_id is None:
            continue
        key = (m.project_id, m.task_id)
        if key not in buckets:
            buckets[key] = ContractTotal(
                project_id=m.project_id,
                project_name=m.project_name or "",
                task_id=m.task_id,
                task_name=m.task_name,
                hours=0.0,
            )
        buckets[key].hours = round(buckets[key].hours + entry.event.hours, 2)
    return list(buckets.values())
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_aggregations.py -v`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/app/aggregations.py backend/tests/test_aggregations.py
git commit -m "feat: add daily and weekly-per-contract aggregations"
```

---

## Phase 9 — Odoo client

### Task 9: XML-RPC Odoo wrapper

**Files:**
- Create: `backend/app/odoo_client.py`
- Test: `backend/tests/test_odoo_client.py`

The client calls `self.common.authenticate(...)` and `self.models.execute_kw(...)`. Both proxies are injectable so tests can pass mocks (no real Odoo needed).

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_odoo_client.py
from unittest.mock import MagicMock

from app.odoo_client import OdooClient


def _client():
    common = MagicMock()
    common.authenticate.return_value = 7  # uid
    models = MagicMock()
    return OdooClient(url="https://odoo.example.com", db="db",
                      username="me", api_key="key",
                      common=common, models=models)


def test_authenticate_caches_uid():
    c = _client()
    assert c.uid() == 7
    assert c.uid() == 7
    c.common.authenticate.assert_called_once()


def test_list_projects_returns_refs():
    c = _client()
    c.models.execute_kw.return_value = [{"id": 10, "name": "GreenVolt"}]
    projects = c.list_projects()
    assert projects[0].id == 10
    assert projects[0].name == "GreenVolt"
    args = c.models.execute_kw.call_args[0]
    assert args[3] == "project.project"
    assert args[4] == "search_read"


def test_list_tasks_filters_by_project():
    c = _client()
    c.models.execute_kw.return_value = [{"id": 55, "name": "Meetings"}]
    tasks = c.list_tasks(10)
    domain = c.models.execute_kw.call_args[0][5][0]
    assert domain == [["project_id", "=", 10]]
    assert tasks[0].name == "Meetings"


def test_create_timesheet_returns_line_id():
    c = _client()
    c.models.execute_kw.side_effect = [
        [{"id": 99}],  # employee lookup
        500,            # create
    ]
    line_id = c.create_timesheet(date="2026-06-01", name="GreenVolt standup",
                                 hours=0.5, project_id=10, task_id=55)
    assert line_id == 500
    create_call = c.models.execute_kw.call_args_list[-1][0]
    assert create_call[3] == "account.analytic.line"
    assert create_call[4] == "create"
    vals = create_call[5][0]
    assert vals["unit_amount"] == 0.5
    assert vals["project_id"] == 10
    assert vals["employee_id"] == 99
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_odoo_client.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.odoo_client'`.

- [ ] **Step 3: Implement `backend/app/odoo_client.py`**

```python
import xmlrpc.client
from typing import Optional

from app.schemas import OdooRef


class OdooClient:
    def __init__(self, url: str, db: str, username: str, api_key: str,
                 common=None, models=None):
        self.url = url.rstrip("/")
        self.db = db
        self.username = username
        self.api_key = api_key
        self._common = common
        self._models = models
        self._uid: Optional[int] = None
        self._employee_id: Optional[int] = None

    @property
    def common(self):
        if self._common is None:
            self._common = xmlrpc.client.ServerProxy(f"{self.url}/xmlrpc/2/common")
        return self._common

    @property
    def models(self):
        if self._models is None:
            self._models = xmlrpc.client.ServerProxy(f"{self.url}/xmlrpc/2/object")
        return self._models

    def uid(self) -> int:
        if self._uid is None:
            self._uid = self.common.authenticate(self.db, self.username,
                                                 self.api_key, {})
            if not self._uid:
                raise RuntimeError("Odoo authentication failed")
        return self._uid

    def _exec(self, model: str, method: str, *args, **kwargs):
        return self.models.execute_kw(self.db, self.uid(), self.api_key,
                                      model, method, list(args), kwargs)

    def list_projects(self) -> list[OdooRef]:
        rows = self._exec("project.project", "search_read", [],
                          fields=["id", "name"], order="name")
        return [OdooRef(**row) for row in rows]

    def list_tasks(self, project_id: int) -> list[OdooRef]:
        rows = self._exec("project.task", "search_read",
                          [["project_id", "=", project_id]],
                          fields=["id", "name"], order="name")
        return [OdooRef(**row) for row in rows]

    def employee_id(self) -> int:
        if self._employee_id is None:
            rows = self._exec("hr.employee", "search_read",
                              [["user_id", "=", self.uid()]],
                              fields=["id"], limit=1)
            if not rows:
                raise RuntimeError("No hr.employee linked to this user")
            self._employee_id = rows[0]["id"]
        return self._employee_id

    def create_timesheet(self, date: str, name: str, hours: float,
                         project_id: int, task_id: Optional[int] = None) -> int:
        vals = {
            "date": date,
            "name": name,
            "unit_amount": hours,
            "project_id": project_id,
            "employee_id": self.employee_id(),
        }
        if task_id:
            vals["task_id"] = task_id
        return self._exec("account.analytic.line", "create", vals)

    def test_connection(self) -> bool:
        return bool(self.uid())
```

> Note: `_exec` passes positional args inside a list and kwargs as the options dict, matching Odoo's `execute_kw(db, uid, key, model, method, args_list, kwargs_dict)`. The test asserts on `call_args[0]` positions: index 3 = model, 4 = method, 5 = args list.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_odoo_client.py -v`
Expected: PASS (4 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/app/odoo_client.py backend/tests/test_odoo_client.py
git commit -m "feat: add xml-rpc odoo client"
```

---

## Phase 10 — FastAPI app

### Task 10: Wire endpoints with dependency injection

**Files:**
- Create: `backend/app/deps.py`
- Create: `backend/app/main.py`
- Test: `backend/tests/test_api.py`

`deps.py` builds singletons (settings, rules store, ledger, odoo client) and exposes them as FastAPI dependencies so tests can override them.

- [ ] **Step 1: Implement `backend/app/deps.py`**

```python
from functools import lru_cache

from app.config import Settings, get_settings
from app.ledger import Ledger
from app.odoo_client import OdooClient
from app.rules import RulesStore


@lru_cache
def settings() -> Settings:
    return get_settings()


@lru_cache
def rules_store() -> RulesStore:
    return RulesStore(settings().data_path("rules.json"))


@lru_cache
def ledger() -> Ledger:
    return Ledger(settings().data_path("ledger.json"))


@lru_cache
def odoo() -> OdooClient:
    s = settings()
    return OdooClient(s.ODOO_URL, s.ODOO_DB, s.ODOO_USERNAME, s.ODOO_API_KEY)
```

- [ ] **Step 2: Write the failing test**

```python
# backend/tests/test_api.py
from datetime import datetime
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from app import deps
from app.main import app
from app.ledger import Ledger
from app.odoo_client import OdooClient
from app.rules import RulesStore
from app.schemas import OdooRef


@pytest.fixture
def client(tmp_path, monkeypatch):
    rs = RulesStore(tmp_path / "rules.json")
    lg = Ledger(tmp_path / "ledger.json")

    fake_odoo = MagicMock(spec=OdooClient)
    fake_odoo.list_projects.return_value = [OdooRef(id=10, name="GreenVolt")]
    fake_odoo.list_tasks.return_value = [OdooRef(id=55, name="Meetings")]
    fake_odoo.create_timesheet.return_value = 500
    fake_odoo.test_connection.return_value = True

    app.dependency_overrides[deps.rules_store] = lambda: rs
    app.dependency_overrides[deps.ledger] = lambda: lg
    app.dependency_overrides[deps.odoo] = lambda: fake_odoo

    yield TestClient(app), fake_odoo, lg
    app.dependency_overrides.clear()


def test_health(client):
    c, _, _ = client
    assert c.get("/api/health").json() == {"status": "ok"}


def test_projects_endpoint(client):
    c, _, _ = client
    resp = c.get("/api/odoo/projects")
    assert resp.status_code == 200
    assert resp.json()[0]["name"] == "GreenVolt"


def test_rules_crud_flow(client):
    c, _, _ = client
    payload = {"name": "GreenVolt", "keywords": ["greenvolt"],
               "project_id": 10, "project_name": "GreenVolt",
               "task_id": 55, "task_name": "Meetings", "priority": 1}
    created = c.post("/api/rules", json=payload).json()
    assert created["id"] == 1
    assert len(c.get("/api/rules").json()) == 1
    c.delete(f"/api/rules/{created['id']}")
    assert c.get("/api/rules").json() == []


def test_push_creates_line_and_records_ledger(client):
    c, fake_odoo, lg = client
    entry = {
        "uid": "evt-1",
        "start": "2026-06-01T09:00:00",
        "date": "2026-06-01",
        "hours": 0.5,
        "description": "GreenVolt standup",
        "project_id": 10,
        "task_id": 55,
    }
    resp = c.post("/api/timesheet/push", json={"entries": [entry]})
    body = resp.json()
    assert body["results"][0]["success"] is True
    assert body["results"][0]["odoo_line_id"] == 500
    fake_odoo.create_timesheet.assert_called_once()
    assert lg.is_logged("evt-1", datetime(2026, 6, 1, 9, 0)) is True


def test_push_skips_already_logged(client):
    c, fake_odoo, lg = client
    lg.record("evt-1", datetime(2026, 6, 1, 9, 0), odoo_line_id=1,
              project_id=10, task_id=55, hours=0.5, pushed_at="x")
    entry = {
        "uid": "evt-1", "start": "2026-06-01T09:00:00", "date": "2026-06-01",
        "hours": 0.5, "description": "x", "project_id": 10, "task_id": 55,
    }
    resp = c.post("/api/timesheet/push", json={"entries": [entry]})
    assert resp.json()["results"][0]["success"] is False
    assert "already logged" in resp.json()["results"][0]["error"].lower()
    fake_odoo.create_timesheet.assert_not_called()
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pytest tests/test_api.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.main'`.

- [ ] **Step 4: Implement `backend/app/main.py`**

```python
from datetime import date as Date
from datetime import datetime, timezone

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app import deps
from app.aggregations import group_by_day, weekly_by_contract
from app.calendar_source import fetch_ical, parse_events
from app.config import Settings
from app.ledger import Ledger
from app.matcher import match_title
from app.odoo_client import OdooClient
from app.rules import RulesStore
from app.schemas import (
    CalendarEvent, ContractTotal, OdooRef, ProposedEntry,
    PushEntry, PushResult, Rule, RuleCreate,
)

app = FastAPI(title="Odoo Hours Logger")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class PushRequest(BaseModel):
    entries: list[PushEntry]


class PushResponse(BaseModel):
    results: list[PushResult]


def _build_proposals(events: list[CalendarEvent], rules: list[Rule],
                     ledger: Ledger) -> list[ProposedEntry]:
    proposals: list[ProposedEntry] = []
    # Mark overlaps: any two events whose intervals intersect
    for i, ev in enumerate(events):
        overlaps = any(
            other.start < ev.end and ev.start < other.end
            for j, other in enumerate(events) if j != i
        )
        proposals.append(ProposedEntry(
            event=ev,
            match=match_title(ev.title, rules),
            already_logged=ledger.is_logged(ev.uid, ev.start),
            overlaps=overlaps,
        ))
    return proposals


def _load_events(start: Date, end: Date, settings: Settings) -> list[CalendarEvent]:
    ics = fetch_ical(settings.ICAL_URL)
    return parse_events(ics, start, end, settings.LOCAL_TZ, settings.USER_EMAIL)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/odoo/projects", response_model=list[OdooRef])
def projects(odoo: OdooClient = Depends(deps.odoo)):
    return odoo.list_projects()


@app.get("/api/odoo/projects/{project_id}/tasks", response_model=list[OdooRef])
def tasks(project_id: int, odoo: OdooClient = Depends(deps.odoo)):
    return odoo.list_tasks(project_id)


@app.get("/api/calendar/events", response_model=list[ProposedEntry])
def calendar_events(start: Date, end: Date,
                    settings: Settings = Depends(deps.settings),
                    rules: RulesStore = Depends(deps.rules_store),
                    ledger: Ledger = Depends(deps.ledger)):
    events = _load_events(start, end, settings)
    return _build_proposals(events, rules.list(), ledger)


@app.get("/api/timesheet/daily")
def daily(start: Date, end: Date,
          settings: Settings = Depends(deps.settings),
          rules: RulesStore = Depends(deps.rules_store),
          ledger: Ledger = Depends(deps.ledger)):
    events = _load_events(start, end, settings)
    proposals = _build_proposals(events, rules.list(), ledger)
    by_day: dict[str, list[ProposedEntry]] = {}
    for p in proposals:
        by_day.setdefault(p.event.date.isoformat(), []).append(p)
    return by_day


@app.get("/api/timesheet/weekly", response_model=list[ContractTotal])
def weekly(start: Date, end: Date,
           settings: Settings = Depends(deps.settings),
           rules: RulesStore = Depends(deps.rules_store),
           ledger: Ledger = Depends(deps.ledger)):
    events = _load_events(start, end, settings)
    proposals = _build_proposals(events, rules.list(), ledger)
    return weekly_by_contract(proposals)


@app.get("/api/rules", response_model=list[Rule])
def list_rules(rules: RulesStore = Depends(deps.rules_store)):
    return rules.list()


@app.post("/api/rules", response_model=Rule)
def create_rule(data: RuleCreate, rules: RulesStore = Depends(deps.rules_store)):
    return rules.create(data)


@app.put("/api/rules/{rule_id}", response_model=Rule)
def update_rule(rule_id: int, data: RuleCreate,
                rules: RulesStore = Depends(deps.rules_store)):
    try:
        return rules.update(rule_id, data)
    except KeyError:
        raise HTTPException(status_code=404, detail="Rule not found")


@app.delete("/api/rules/{rule_id}")
def delete_rule(rule_id: int, rules: RulesStore = Depends(deps.rules_store)):
    rules.delete(rule_id)
    return {"status": "deleted"}


@app.post("/api/timesheet/push", response_model=PushResponse)
def push(req: PushRequest,
         odoo: OdooClient = Depends(deps.odoo),
         ledger: Ledger = Depends(deps.ledger)):
    results: list[PushResult] = []
    for entry in req.entries:
        if ledger.is_logged(entry.uid, entry.start):
            results.append(PushResult(uid=entry.uid, start=entry.start,
                                      success=False, error="Already logged"))
            continue
        try:
            line_id = odoo.create_timesheet(
                date=entry.date.isoformat(), name=entry.description,
                hours=entry.hours, project_id=entry.project_id,
                task_id=entry.task_id,
            )
            ledger.record(entry.uid, entry.start, odoo_line_id=line_id,
                          project_id=entry.project_id, task_id=entry.task_id,
                          hours=entry.hours,
                          pushed_at=datetime.now(timezone.utc).isoformat())
            results.append(PushResult(uid=entry.uid, start=entry.start,
                                      success=True, odoo_line_id=line_id))
        except Exception as exc:  # surface per-row failure
            results.append(PushResult(uid=entry.uid, start=entry.start,
                                      success=False, error=str(exc)))
    return PushResponse(results=results)


@app.post("/api/settings/test-connection")
def test_connection(settings: Settings = Depends(deps.settings),
                    odoo: OdooClient = Depends(deps.odoo)):
    result = {"odoo": False, "ical": False, "errors": {}}
    try:
        result["odoo"] = odoo.test_connection()
    except Exception as exc:
        result["errors"]["odoo"] = str(exc)
    try:
        fetch_ical(settings.ICAL_URL)
        result["ical"] = True
    except Exception as exc:
        result["errors"]["ical"] = str(exc)
    return result
```

> Note: `datetime.now(timezone.utc)` is used for `pushed_at`. The test asserts only that the ledger records the entry, not the timestamp value.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pytest tests/test_api.py -v`
Expected: PASS (6 passed).

- [ ] **Step 6: Run the full backend suite**

Run: `pytest`
Expected: PASS (all tests across all modules green).

- [ ] **Step 7: Commit**

```bash
git add backend/app/deps.py backend/app/main.py backend/tests/test_api.py
git commit -m "feat: wire fastapi endpoints"
```

---

### Task 11: Manual backend smoke test + run script

**Files:**
- Create: `backend/run.sh`

- [ ] **Step 1: Create `backend/run.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
. .venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

- [ ] **Step 2: Make it executable**

Run: `chmod +x backend/run.sh`

- [ ] **Step 3: Smoke test health endpoint**

Create a real `backend/.env` from `.env.example` with your actual values, then run:
```bash
cd backend && . .venv/bin/activate && uvicorn app.main:app --port 8000 &
sleep 2 && curl -s http://localhost:8000/api/health && kill %1
```
Expected: `{"status":"ok"}`.

- [ ] **Step 4: Commit**

```bash
git add backend/run.sh
git commit -m "chore: add backend run script"
```

---

## Phase 11 — Frontend (React + Vite + TS)

> **Design note:** Before building the pages (Task 14), invoke the **ui-ux-pro-max** skill to establish the visual design system (palette, typography, layout, component styling) for a clean, professional internal tool. The tasks below define the data contracts and behaviors precisely; ui-ux-pro-max produces the styled component implementations against those contracts.

### Task 12: Scaffold Vite React TS app

**Files:**
- Create: `frontend/` (via scaffolder)
- Modify: `frontend/vite.config.ts` (proxy `/api` to backend)

- [ ] **Step 1: Scaffold the app**

Run:
```bash
cd /Users/martimsantos/Work/Daredata/odoo-hours-logger
npm create vite@latest frontend -- --template react-ts
cd frontend && npm install && npm install react-router-dom
```
Expected: `frontend/` created with React + TS template; dependencies installed.

- [ ] **Step 2: Configure dev proxy in `frontend/vite.config.ts`**

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8000",
    },
  },
});
```

- [ ] **Step 3: Verify dev server boots**

Run: `cd frontend && npm run dev`
Expected: Vite serves on `http://localhost:5173`. Stop with Ctrl-C.

- [ ] **Step 4: Commit**

```bash
git add frontend/ -- ':!frontend/node_modules'
git commit -m "chore: scaffold react frontend with vite"
```

---

### Task 13: API client + types

**Files:**
- Create: `frontend/src/api/types.ts`
- Create: `frontend/src/api/client.ts`

- [ ] **Step 1: Create `frontend/src/api/types.ts`**

```ts
export interface OdooRef { id: number; name: string; }

export interface CalendarEvent {
  uid: string;
  title: string;
  start: string;
  end: string;
  hours: number;
  date: string;
}

export interface MatchResult {
  rule_id: number | null;
  project_id: number | null;
  project_name: string | null;
  task_id: number | null;
  task_name: string | null;
  alternative_rule_ids: number[];
}

export interface ProposedEntry {
  event: CalendarEvent;
  match: MatchResult;
  already_logged: boolean;
  overlaps: boolean;
}

export interface Rule {
  id: number;
  name: string;
  keywords: string[];
  project_id: number;
  project_name: string;
  task_id: number | null;
  task_name: string | null;
  priority: number;
  active: boolean;
}

export type RuleCreate = Omit<Rule, "id">;

export interface PushEntry {
  uid: string;
  start: string;
  date: string;
  hours: number;
  description: string;
  project_id: number;
  task_id: number | null;
}

export interface PushResult {
  uid: string;
  start: string;
  success: boolean;
  odoo_line_id: number | null;
  error: string | null;
}

export interface ContractTotal {
  project_id: number;
  project_name: string;
  task_id: number | null;
  task_name: string | null;
  hours: number;
}
```

- [ ] **Step 2: Create `frontend/src/api/client.ts`**

```ts
import type {
  ContractTotal, OdooRef, ProposedEntry, PushEntry, PushResult, Rule, RuleCreate,
} from "./types";

async function req<T>(url: string, options?: RequestInit): Promise<T> {
  const resp = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`${resp.status}: ${text}`);
  }
  return resp.json() as Promise<T>;
}

export const api = {
  health: () => req<{ status: string }>("/api/health"),
  projects: () => req<OdooRef[]>("/api/odoo/projects"),
  tasks: (projectId: number) => req<OdooRef[]>(`/api/odoo/projects/${projectId}/tasks`),
  events: (start: string, end: string) =>
    req<ProposedEntry[]>(`/api/calendar/events?start=${start}&end=${end}`),
  daily: (start: string, end: string) =>
    req<Record<string, ProposedEntry[]>>(`/api/timesheet/daily?start=${start}&end=${end}`),
  weekly: (start: string, end: string) =>
    req<ContractTotal[]>(`/api/timesheet/weekly?start=${start}&end=${end}`),
  listRules: () => req<Rule[]>("/api/rules"),
  createRule: (data: RuleCreate) =>
    req<Rule>("/api/rules", { method: "POST", body: JSON.stringify(data) }),
  updateRule: (id: number, data: RuleCreate) =>
    req<Rule>(`/api/rules/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteRule: (id: number) =>
    req<{ status: string }>(`/api/rules/${id}`, { method: "DELETE" }),
  push: (entries: PushEntry[]) =>
    req<{ results: PushResult[] }>("/api/timesheet/push", {
      method: "POST", body: JSON.stringify({ entries }),
    }),
  testConnection: () =>
    req<{ odoo: boolean; ical: boolean; errors: Record<string, string> }>(
      "/api/settings/test-connection", { method: "POST" }),
};
```

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api
git commit -m "feat: add frontend api client and types"
```

---

### Task 14: App shell, routing, and pages (styled via ui-ux-pro-max)

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/main.tsx`
- Create: `frontend/src/pages/DailyView.tsx`
- Create: `frontend/src/pages/WeeklyByContract.tsx`
- Create: `frontend/src/pages/MappingRules.tsx`
- Create: `frontend/src/pages/Settings.tsx`

- [ ] **Step 1: Invoke ui-ux-pro-max for the design system**

Use the ui-ux-pro-max skill to define the visual system (a clean, dense, professional internal-tool look) and the styled implementations of the components below. Provide it these page/behavior contracts.

- [ ] **Step 2: Set up routing in `frontend/src/main.tsx`**

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
```

- [ ] **Step 3: App shell with nav in `frontend/src/App.tsx`**

```tsx
import { NavLink, Route, Routes } from "react-router-dom";
import DailyView from "./pages/DailyView";
import WeeklyByContract from "./pages/WeeklyByContract";
import MappingRules from "./pages/MappingRules";
import Settings from "./pages/Settings";

export default function App() {
  return (
    <div className="app">
      <nav>
        <NavLink to="/">Daily hours</NavLink>
        <NavLink to="/weekly">Weekly by contract</NavLink>
        <NavLink to="/rules">Mapping rules</NavLink>
        <NavLink to="/settings">Settings</NavLink>
      </nav>
      <main>
        <Routes>
          <Route path="/" element={<DailyView />} />
          <Route path="/weekly" element={<WeeklyByContract />} />
          <Route path="/rules" element={<MappingRules />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  );
}
```

- [ ] **Step 4: Build `DailyView.tsx` — the core review/push screen**

Behavior contract (ui-ux-pro-max styles it):
- Date-range picker (default: current week) + **Refresh from calendar** button → `api.events(start, end)`.
- Render proposals grouped by `event.date`. Each row shows: start time, `event.title`, `event.hours`, an editable **Project** dropdown (`api.projects()`) and **Task** dropdown (`api.tasks(projectId)`), a status badge (`already_logged` → "Logged", else "New"), an ⚠ badge when `overlaps`.
- Pre-select project/task from `match` when present; rows with `already_logged` are not checkable.
- An "approve" checkbox per non-logged row; **Push approved** button builds `PushEntry[]` from checked rows and calls `api.push(...)`, then shows per-row ✓/✗ results and re-fetches.

```tsx
import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { OdooRef, ProposedEntry, PushEntry, PushResult } from "../api/types";

function startOfWeek(d: Date): string {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // Monday=0
  x.setDate(x.getDate() - day);
  return x.toISOString().slice(0, 10);
}
function addDays(iso: string, n: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

interface RowState { projectId: number | null; taskId: number | null; approved: boolean; }

export default function DailyView() {
  const today = new Date().toISOString().slice(0, 10);
  const [start, setStart] = useState(startOfWeek(new Date()));
  const [end, setEnd] = useState(addDays(startOfWeek(new Date()), 6));
  const [proposals, setProposals] = useState<ProposedEntry[]>([]);
  const [projects, setProjects] = useState<OdooRef[]>([]);
  const [tasksByProject, setTasksByProject] = useState<Record<number, OdooRef[]>>({});
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [results, setResults] = useState<Record<string, PushResult>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const key = (p: ProposedEntry) => `${p.event.uid}|${p.event.start}`;

  useEffect(() => { api.projects().then(setProjects).catch((e) => setError(String(e))); }, []);

  async function loadTasks(projectId: number) {
    if (tasksByProject[projectId]) return;
    const t = await api.tasks(projectId);
    setTasksByProject((prev) => ({ ...prev, [projectId]: t }));
  }

  async function refresh() {
    setLoading(true); setError(null); setResults({});
    try {
      const data = await api.events(start, end);
      setProposals(data);
      const init: Record<string, RowState> = {};
      for (const p of data) {
        init[key(p)] = {
          projectId: p.match.project_id,
          taskId: p.match.task_id,
          approved: false,
        };
        if (p.match.project_id) loadTasks(p.match.project_id);
      }
      setRows(init);
    } catch (e) { setError(String(e)); } finally { setLoading(false); }
  }

  async function pushApproved() {
    const entries: PushEntry[] = proposals
      .filter((p) => rows[key(p)]?.approved && rows[key(p)]?.projectId)
      .map((p) => ({
        uid: p.event.uid,
        start: p.event.start,
        date: p.event.date,
        hours: p.event.hours,
        description: p.event.title,
        project_id: rows[key(p)]!.projectId!,
        task_id: rows[key(p)]!.taskId,
      }));
    if (entries.length === 0) return;
    try {
      const resp = await api.push(entries);
      const map: Record<string, PushResult> = {};
      for (const r of resp.results) map[`${r.uid}|${r.start}`] = r;
      setResults(map);
      await refresh();
    } catch (e) { setError(String(e)); }
  }

  const byDay: Record<string, ProposedEntry[]> = {};
  for (const p of proposals) (byDay[p.event.date] ??= []).push(p);

  // ui-ux-pro-max: render date pickers, the grouped tables with dropdowns,
  // status/overlap badges, per-row result icons, and the Push approved button.
  return null; // replaced by styled markup
}
```

- [ ] **Step 5: Build `WeeklyByContract.tsx`**

Behavior contract: week picker (default current week) → `api.weekly(start, end)` → table of `ContractTotal` (project, task, hours) plus a simple bar chart of hours per contract and a total.

- [ ] **Step 6: Build `MappingRules.tsx`**

Behavior contract: list rules via `api.listRules()`; a form to create/edit with name, keywords (comma-separated), **Project** dropdown (`api.projects()`), **Task** dropdown (`api.tasks(projectId)`), priority, active toggle; create/update/delete via the matching `api` calls; reflect changes immediately.

- [ ] **Step 7: Build `Settings.tsx`**

Behavior contract: a **Test connection** button → `api.testConnection()` shows green/red for Odoo and iCal with any error messages; display read-only config status (which env vars are set, without revealing secrets).

- [ ] **Step 8: Type-check and run**

Run: `cd frontend && npx tsc --noEmit && npm run build`
Expected: no type errors; production build succeeds.

- [ ] **Step 9: Commit**

```bash
git add frontend/src
git commit -m "feat: add frontend pages (daily, weekly, rules, settings)"
```

---

### Task 15: End-to-end manual verification

- [ ] **Step 1: Start backend**

Run: `cd backend && ./run.sh` (serves on :8000)

- [ ] **Step 2: Start frontend (separate terminal)**

Run: `cd frontend && npm run dev` (serves on :5173)

- [ ] **Step 3: Verify the full loop**

1. Open `http://localhost:5173`.
2. **Settings** → Test connection: Odoo and iCal both green.
3. **Mapping rules** → add a rule (keyword → project/task).
4. **Daily hours** → Refresh from calendar → events appear with proposed matches; edit one, approve a row, **Push approved** → ✓ result; reload shows it as "Logged" (dedup works).
5. Confirm the timesheet line exists in Odoo.
6. **Weekly by contract** → totals reflect the pushed hours.

- [ ] **Step 4: Write `README.md`**

```markdown
# Odoo Hours Logger

Log Google Calendar hours into Odoo timesheets.

## Setup
1. `cd backend && python -m venv .venv && . .venv/bin/activate && pip install -e ".[dev]"`
2. Copy `backend/.env.example` to `backend/.env` and fill in values
   (private iCal URL + Odoo URL/db/username/API key).
3. `cd frontend && npm install`

## Run
- Backend: `cd backend && ./run.sh`  (http://localhost:8000)
- Frontend: `cd frontend && npm run dev`  (http://localhost:5173)

## Test
- Backend: `cd backend && . .venv/bin/activate && pytest`

## How it works
Calendar events are read from the private iCal URL, matched to an Odoo
Project/Task by keyword rules on the event title (managed in-app), reviewed,
then pushed to Odoo as timesheet lines. A local `data/ledger.json` prevents
double-logging. No database; rules and ledger are JSON files.
```

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: add project README"
```

---

## Self-Review Notes

- **Spec coverage:** Odoo Project+Task target (Tasks 9, 10) · review-then-push (Task 10 push + Task 14 DailyView) · title-keyword matching (Task 5) · in-app rule editor with Odoo dropdowns (Tasks 6, 10, 14) · private iCal URL (Task 4) · daily + weekly views (Tasks 8, 14) · JSON persistence, no DB (Tasks 6, 7) · dedup ledger (Tasks 7, 10) · all-day/declined/recurring/overlap handling (Tasks 4, 10) · error handling per-row + connection test (Task 10) · testing (every backend task) · React + ui-ux-pro-max (Tasks 12–14). All spec sections map to a task.
- **Config addition:** `USER_EMAIL` was added to `.env` for declined-event detection (matches the spec's "declined events skipped when the feed exposes attendee status").
- **Type consistency:** `match_title` (matcher) → `MatchResult`; `ProposedEntry`/`PushEntry`/`PushResult`/`ContractTotal`/`OdooRef`/`Rule`/`RuleCreate` shared between schemas, API, and TS types; `OdooClient.create_timesheet` signature matches its call in `push`.
```
