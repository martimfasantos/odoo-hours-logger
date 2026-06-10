from datetime import date as Date
from datetime import datetime, timezone

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app import demo, deps
from app.aggregations import weekly_by_contract
from app.calendar_source import fetch_ical, parse_events
from app.config import Settings
from app.ledger import Ledger
from app.matcher import match_title
from app.odoo_client import OdooClient
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
    if settings.DEMO_MODE:
        return demo.demo_events(start, end, settings.LOCAL_TZ)
    try:
        ics = fetch_ical(settings.GOOGLE_CALENDAR_URL)
        return parse_events(ics, start, end, settings.LOCAL_TZ, settings.USER_EMAIL)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to load calendar: {exc}")


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/odoo/projects", response_model=list[OdooRef])
def projects(settings: Settings = Depends(deps.settings),
             odoo: OdooClient = Depends(deps.odoo)):
    if settings.DEMO_MODE:
        return demo.DEMO_PROJECTS
    return odoo.list_projects()


@app.get("/api/odoo/projects/{project_id}/tasks", response_model=list[OdooRef])
def tasks(project_id: int,
          settings: Settings = Depends(deps.settings),
          odoo: OdooClient = Depends(deps.odoo)):
    if settings.DEMO_MODE:
        return demo.DEMO_TASKS.get(project_id, [])
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
            sim_line_id = 9000 + idx
            ledger.record(entry.uid, entry.start, odoo_line_id=sim_line_id,
                          project_id=entry.project_id, task_id=entry.task_id,
                          hours=entry.hours,
                          pushed_at=datetime.now(timezone.utc).isoformat())
            results.append(PushResult(uid=entry.uid, start=entry.start,
                                      success=True, odoo_line_id=sim_line_id))
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
    if settings.DEMO_MODE:
        return {"odoo": True, "calendar": True, "errors": {}}
    result = {"odoo": False, "calendar": False, "errors": {}}
    try:
        result["odoo"] = odoo.test_connection()
    except Exception as exc:
        result["errors"]["odoo"] = str(exc)
    try:
        fetch_ical(settings.GOOGLE_CALENDAR_URL)
        result["calendar"] = True
    except Exception as exc:
        result["errors"]["calendar"] = str(exc)
    return result
