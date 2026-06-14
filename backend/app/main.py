from datetime import date as Date
from datetime import datetime, timezone

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app import demo, deps
from app.aggregations import weekly_by_contract
from app.calendar_source import fetch_ical, parse_events
from app.config import Settings
from app.ignore import IgnoreStore
from app.ledger import Ledger
from app.matcher import match_title
from app.odoo_client import OdooClient, OdooSessionExpired, to_odoo_utc
from app.colors import ColorStore
from app.rules import RulesStore
from app.schemas import (
    CalendarEvent, ColorUpdate, ContractTotal, OdooRef, ProposedEntry,
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


class IgnoreUpdate(BaseModel):
    keywords: list[str]


def _is_ignored(title: str, keywords: list[str]) -> bool:
    """Return True if any keyword (lowercased, trimmed, non-empty) is a
    substring of title.lower()."""
    title_lower = title.lower()
    for kw in keywords:
        kw_clean = kw.strip().lower()
        if kw_clean and kw_clean in title_lower:
            return True
    return False


def _odoo_entry_keys(events: list[CalendarEvent], odoo: OdooClient,
                     demo_mode: bool) -> set[tuple[int, str, str]]:
    """Best-effort set of (contract_id, start_utc, end_utc) keys for entries
    already in Odoo. Falls back to an empty set on any failure so the request
    never fails just because Odoo is unreachable or the session expired."""
    if demo_mode or not events:
        return set()
    range_start = min(ev.start for ev in events)
    range_end = max(ev.end for ev in events)
    try:
        existing = odoo.existing_entries(range_start, range_end)
    except Exception:
        return set()
    keys: set[tuple[int, str, str]] = set()
    for row in existing:
        cid = row.get("contract_id")
        if cid is None:
            continue
        keys.add((cid, row.get("start_time"), row.get("end_time")))
    return keys


def _build_proposals(events: list[CalendarEvent], rules: list[Rule],
                     ledger: Ledger, odoo: OdooClient,
                     demo_mode: bool) -> list[ProposedEntry]:
    odoo_keys = _odoo_entry_keys(events, odoo, demo_mode)
    proposals: list[ProposedEntry] = []
    # Mark overlaps: any two events whose intervals intersect
    for i, ev in enumerate(events):
        overlaps = any(
            other.start < ev.end and ev.start < other.end
            for j, other in enumerate(events) if j != i
        )
        match = match_title(ev.title, rules)
        already_logged = ledger.is_logged(ev.uid, ev.start)
        if not already_logged and match.contract_id is not None:
            key = (match.contract_id, to_odoo_utc(ev.start), to_odoo_utc(ev.end))
            if key in odoo_keys:
                already_logged = True
        proposals.append(ProposedEntry(
            event=ev,
            match=match,
            already_logged=already_logged,
            overlaps=overlaps,
        ))
    return proposals


def _resolve_user_email(settings: Settings, odoo: OdooClient) -> str:
    """Return the effective user email for declined-event detection.

    Priority:
    1. ``settings.USER_EMAIL`` if set (explicit override).
    2. Email auto-derived from the Odoo session (``get_session_info`` → username).
    3. Empty string if the session call fails (best-effort; declined events will
       not be filtered, but the request won't fail).
    """
    if settings.USER_EMAIL:
        return settings.USER_EMAIL
    try:
        return odoo.user_email()
    except Exception:
        return ""


def _load_events(start: Date, end: Date, settings: Settings,
                 user_email: str = "") -> list[CalendarEvent]:
    if settings.DEMO_MODE:
        return demo.demo_events(start, end, settings.LOCAL_TZ)
    try:
        ics = fetch_ical(settings.GOOGLE_CALENDAR_URL)
        return parse_events(ics, start, end, settings.LOCAL_TZ, user_email)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to load calendar: {exc}")


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/odoo/contracts", response_model=list[OdooRef])
def contracts(query: str = "",
              settings: Settings = Depends(deps.settings),
              odoo: OdooClient = Depends(deps.odoo)):
    if settings.DEMO_MODE:
        return demo.DEMO_CONTRACTS
    return odoo.list_contracts(query)


@app.get("/api/calendar/events", response_model=list[ProposedEntry])
def calendar_events(start: Date, end: Date,
                    settings: Settings = Depends(deps.settings),
                    rules: RulesStore = Depends(deps.rules_store),
                    ledger: Ledger = Depends(deps.ledger),
                    odoo: OdooClient = Depends(deps.odoo),
                    ignore_store: IgnoreStore = Depends(deps.ignore_store)):
    user_email = settings.USER_EMAIL if settings.DEMO_MODE else _resolve_user_email(settings, odoo)
    events = _load_events(start, end, settings, user_email)
    kws = ignore_store.get()
    events = [ev for ev in events if not _is_ignored(ev.title, kws)]
    return _build_proposals(events, rules.list(), ledger, odoo,
                            settings.DEMO_MODE)


@app.get("/api/timesheet/daily")
def daily(start: Date, end: Date,
          settings: Settings = Depends(deps.settings),
          rules: RulesStore = Depends(deps.rules_store),
          ledger: Ledger = Depends(deps.ledger),
          odoo: OdooClient = Depends(deps.odoo),
          ignore_store: IgnoreStore = Depends(deps.ignore_store)):
    user_email = settings.USER_EMAIL if settings.DEMO_MODE else _resolve_user_email(settings, odoo)
    events = _load_events(start, end, settings, user_email)
    kws = ignore_store.get()
    events = [ev for ev in events if not _is_ignored(ev.title, kws)]
    proposals = _build_proposals(events, rules.list(), ledger, odoo,
                                 settings.DEMO_MODE)
    by_day: dict[str, list[ProposedEntry]] = {}
    for p in proposals:
        by_day.setdefault(p.event.date.isoformat(), []).append(p)
    return by_day


@app.get("/api/timesheet/weekly", response_model=list[ContractTotal])
def weekly(start: Date, end: Date,
           settings: Settings = Depends(deps.settings),
           rules: RulesStore = Depends(deps.rules_store),
           ledger: Ledger = Depends(deps.ledger),
           odoo: OdooClient = Depends(deps.odoo),
           ignore_store: IgnoreStore = Depends(deps.ignore_store)):
    user_email = settings.USER_EMAIL if settings.DEMO_MODE else _resolve_user_email(settings, odoo)
    events = _load_events(start, end, settings, user_email)
    kws = ignore_store.get()
    events = [ev for ev in events if not _is_ignored(ev.title, kws)]
    proposals = _build_proposals(events, rules.list(), ledger, odoo,
                                 settings.DEMO_MODE)
    return weekly_by_contract(proposals)


@app.get("/api/ignore", response_model=list[str])
def get_ignore(ignore_store: IgnoreStore = Depends(deps.ignore_store)):
    return ignore_store.get()


@app.put("/api/ignore", response_model=list[str])
def put_ignore(body: IgnoreUpdate,
               ignore_store: IgnoreStore = Depends(deps.ignore_store)):
    return ignore_store.set(body.keywords)


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


@app.get("/api/colors", response_model=dict[str, str])
def get_colors(colors: ColorStore = Depends(deps.colors_store)):
    return colors.get_all()


@app.put("/api/colors/{project_id}", response_model=dict[str, str])
def set_color(project_id: int, body: ColorUpdate,
              colors: ColorStore = Depends(deps.colors_store)):
    colors.set(project_id, body.color)
    return colors.get_all()


@app.post("/api/timesheet/push", response_model=PushResponse)
def push(req: PushRequest,
         settings: Settings = Depends(deps.settings),
         odoo: OdooClient = Depends(deps.odoo),
         ledger: Ledger = Depends(deps.ledger)):
    results: list[PushResult] = []
    for idx, entry in enumerate(req.entries):
        if ledger.is_logged(entry.uid, entry.start):
            results.append(PushResult(uid=entry.uid, start=entry.start,
                                      success=False, error="Already logged"))
            continue
        if settings.DEMO_MODE:
            sim_id = 9000 + idx
            ledger.record(entry.uid, entry.start, odoo_id=sim_id,
                          contract_id=entry.contract_id,
                          pushed_at=datetime.now(timezone.utc).isoformat())
            results.append(PushResult(uid=entry.uid, start=entry.start,
                                      success=True, odoo_id=sim_id))
            continue
        try:
            odoo_id = odoo.create_timesheet(
                contract_id=entry.contract_id, description=entry.description,
                start=entry.start, end=entry.end,
            )
            ledger.record(entry.uid, entry.start, odoo_id=odoo_id,
                          contract_id=entry.contract_id,
                          pushed_at=datetime.now(timezone.utc).isoformat())
            results.append(PushResult(uid=entry.uid, start=entry.start,
                                      success=True, odoo_id=odoo_id))
        except OdooSessionExpired as exc:
            results.append(PushResult(uid=entry.uid, start=entry.start,
                                      success=False, error=str(exc)))
        except Exception as exc:  # surface per-row failure
            results.append(PushResult(uid=entry.uid, start=entry.start,
                                      success=False, error=str(exc)))
    return PushResponse(results=results)


@app.post("/api/settings/test-connection")
def test_connection(settings: Settings = Depends(deps.settings),
                    odoo: OdooClient = Depends(deps.odoo)):
    if settings.DEMO_MODE:
        return {"odoo": True, "calendar": True, "errors": {}}
    result = {"odoo": False, "calendar": False, "errors": {}}
    try:
        result["odoo"] = odoo.test_connection()
    except OdooSessionExpired as exc:
        result["odoo"] = False
        result["errors"]["odoo"] = str(exc)
    except Exception as exc:
        result["errors"]["odoo"] = str(exc)
    try:
        fetch_ical(settings.GOOGLE_CALENDAR_URL)
        result["calendar"] = True
    except Exception as exc:
        result["errors"]["calendar"] = str(exc)
    return result
