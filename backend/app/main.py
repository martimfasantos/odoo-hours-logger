import logging
from contextlib import asynccontextmanager
from datetime import date as Date
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app import demo, deps, env_file
from app.paths import ensure_app_dirs, frontend_dist_dir
from app.spa import SPAStaticFiles
from app.aggregations import build_analytics, weekly_by_contract
from app.calendar_source import fetch_ical, parse_events
from app.config import Settings
from app.excluded import ExcludedStore
from app.ignore import IgnoreStore
from app.ledger import Ledger
from app.matcher import match_title
from app.odoo_client import OdooClient, OdooSessionExpired, OdooUnreachable, parse_odoo_utc, to_odoo_utc
from app.colors import ColorStore
from app.rules import RulesStore
from app.schemas import (
    AnalyticsResponse, CalendarEvent, ColorUpdate, ConfigValues, ContractOverview,
    ContractTotal, ExcludedEntryRef, OdooRef, OverviewBlock, OverviewResponse,
    ProposedEntry, PushEntry, PushResult, RemovedEvent, Rule, RuleCreate,
)

@asynccontextmanager
async def lifespan(app: FastAPI):
    ensure_app_dirs()
    yield


app = FastAPI(title="Odoo Hours Logger", lifespan=lifespan)

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
                     demo_mode: bool,
                     excluded_keys: set[str] = frozenset()) -> list[ProposedEntry]:
    # Removed occurrences are dropped entirely (hidden; restorable from Settings).
    if excluded_keys:
        events = [ev for ev in events
                  if f"{ev.uid}|{ev.start.isoformat()}" not in excluded_keys]
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


def _settings_to_config(s: Settings) -> ConfigValues:
    """Convert a Settings instance to the ConfigValues response model."""
    return ConfigValues(
        GOOGLE_CALENDAR_URL=s.GOOGLE_CALENDAR_URL,
        ODOO_URL=s.ODOO_URL,
        ODOO_DB=s.ODOO_DB,
        ODOO_SESSION_ID=s.ODOO_SESSION_ID,
        ODOO_VISITOR_UUID=s.ODOO_VISITOR_UUID,
        ODOO_USER_ID=s.ODOO_USER_ID,
        ODOO_NETWORK_MEMBER_ID=s.ODOO_NETWORK_MEMBER_ID,
        LOCAL_TZ=s.LOCAL_TZ,
        USER_EMAIL=s.USER_EMAIL,
        DEMO_MODE=s.DEMO_MODE,
    )


@app.get("/api/config", response_model=ConfigValues)
def get_config(settings: Settings = Depends(deps.settings)):
    return _settings_to_config(settings)


@app.put("/api/config", response_model=ConfigValues)
def put_config(body: ConfigValues, settings: Settings = Depends(deps.settings)):
    updates: dict[str, str] = {}
    data = body.model_dump(exclude_none=True)
    for key, value in data.items():
        if key == "DEMO_MODE":
            updates[key] = "true" if value else "false"
        else:
            updates[key] = str(value)

    env_file.write_env(updates)

    # Clear all lru_caches so the new .env values take effect immediately.
    deps.settings.cache_clear()
    deps.odoo.cache_clear()
    deps.rules_store.cache_clear()
    deps.ledger.cache_clear()
    deps.ignore_store.cache_clear()
    deps.colors_store.cache_clear()
    deps.excluded_store.cache_clear()

    # Re-read settings after cache clear; in tests the dep override takes
    # precedence, so this falls back to the injected settings.
    try:
        new_settings = deps.settings()
    except Exception:
        new_settings = settings
    return _settings_to_config(new_settings)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/odoo/contracts", response_model=list[OdooRef])
def contracts(query: str = "",
              settings: Settings = Depends(deps.settings),
              odoo: OdooClient = Depends(deps.odoo)):
    if settings.DEMO_MODE:
        return demo.DEMO_CONTRACTS
    try:
        return odoo.list_contracts(query)
    except OdooUnreachable as exc:
        raise HTTPException(status_code=503,
                            detail="Could not reach Odoo — check your VPN connection.")
    except OdooSessionExpired as exc:
        raise HTTPException(status_code=401, detail=str(exc))


@app.get("/api/calendar/events", response_model=list[ProposedEntry])
def calendar_events(start: Date, end: Date,
                    settings: Settings = Depends(deps.settings),
                    rules: RulesStore = Depends(deps.rules_store),
                    ledger: Ledger = Depends(deps.ledger),
                    odoo: OdooClient = Depends(deps.odoo),
                    ignore_store: IgnoreStore = Depends(deps.ignore_store),
                    excluded_store: ExcludedStore = Depends(deps.excluded_store)):
    user_email = settings.USER_EMAIL if settings.DEMO_MODE else _resolve_user_email(settings, odoo)
    events = _load_events(start, end, settings, user_email)
    kws = ignore_store.get()
    events = [ev for ev in events if not _is_ignored(ev.title, kws)]
    return _build_proposals(events, rules.list(), ledger, odoo,
                            settings.DEMO_MODE, excluded_store.keys())


@app.get("/api/timesheet/daily")
def daily(start: Date, end: Date,
          settings: Settings = Depends(deps.settings),
          rules: RulesStore = Depends(deps.rules_store),
          ledger: Ledger = Depends(deps.ledger),
          odoo: OdooClient = Depends(deps.odoo),
          ignore_store: IgnoreStore = Depends(deps.ignore_store),
          excluded_store: ExcludedStore = Depends(deps.excluded_store)):
    user_email = settings.USER_EMAIL if settings.DEMO_MODE else _resolve_user_email(settings, odoo)
    events = _load_events(start, end, settings, user_email)
    kws = ignore_store.get()
    events = [ev for ev in events if not _is_ignored(ev.title, kws)]
    proposals = _build_proposals(events, rules.list(), ledger, odoo,
                                 settings.DEMO_MODE, excluded_store.keys())
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
           ignore_store: IgnoreStore = Depends(deps.ignore_store),
           excluded_store: ExcludedStore = Depends(deps.excluded_store)):
    user_email = settings.USER_EMAIL if settings.DEMO_MODE else _resolve_user_email(settings, odoo)
    events = _load_events(start, end, settings, user_email)
    kws = ignore_store.get()
    events = [ev for ev in events if not _is_ignored(ev.title, kws)]
    proposals = _build_proposals(events, rules.list(), ledger, odoo,
                                 settings.DEMO_MODE, excluded_store.keys())
    return weekly_by_contract(proposals)


@app.get("/api/analytics", response_model=AnalyticsResponse)
def analytics(start: Date, end: Date,
              settings: Settings = Depends(deps.settings),
              odoo: OdooClient = Depends(deps.odoo)):
    if settings.DEMO_MODE:
        return demo.demo_analytics(start, end, settings.LOCAL_TZ)
    try:
        entries_raw = odoo.existing_entries(
            datetime(start.year, start.month, start.day, tzinfo=timezone.utc),
            datetime(end.year, end.month, end.day, 23, 59, 59, tzinfo=timezone.utc),
        )
    except OdooUnreachable:
        raise HTTPException(status_code=503,
                            detail="Could not reach Odoo — check your VPN connection.")
    except OdooSessionExpired as exc:
        raise HTTPException(status_code=401, detail=str(exc))

    entries: list[dict] = []
    for row in entries_raw:
        st = row.get("start_time")
        if not st:
            continue
        try:
            local_date = parse_odoo_utc(st, settings.LOCAL_TZ).date()
        except Exception:
            continue
        entries.append({**row, "local_date": local_date})

    contract_ids = {e["contract_id"] for e in entries if e.get("contract_id") is not None}
    try:
        rates = odoo.contract_rates(list(contract_ids))
    except (OdooUnreachable, OdooSessionExpired):
        rates = {}
    return build_analytics(entries, rates, start, end)


@app.get("/api/overview", response_model=OverviewResponse)
def overview(start: Date, end: Date,
             settings: Settings = Depends(deps.settings),
             rules: RulesStore = Depends(deps.rules_store),
             ledger: Ledger = Depends(deps.ledger),
             odoo: OdooClient = Depends(deps.odoo),
             ignore_store: IgnoreStore = Depends(deps.ignore_store),
             excluded_store: ExcludedStore = Depends(deps.excluded_store)):
    logger = logging.getLogger(__name__)

    user_email = (settings.USER_EMAIL if settings.DEMO_MODE
                  else _resolve_user_email(settings, odoo))
    events = _load_events(start, end, settings, user_email)
    kws = ignore_store.get()
    events = [ev for ev in events if not _is_ignored(ev.title, kws)]
    proposals = _build_proposals(events, rules.list(), ledger, odoo,
                                 settings.DEMO_MODE, excluded_store.keys())

    blocks: list[OverviewBlock] = []

    # -- to_log blocks --------------------------------------------------------
    for p in proposals:
        if p.match.contract_id is not None and not p.already_logged:
            blocks.append(OverviewBlock(
                status="to_log",
                contract_id=p.match.contract_id,
                contract_name=p.match.contract_name or "",
                title=p.event.title,
                start=p.event.start,
                end=p.event.end,
                hours=p.event.hours,
            ))

    # -- logged blocks --------------------------------------------------------
    if settings.DEMO_MODE:
        tz = ZoneInfo(settings.LOCAL_TZ)
        mid = start + timedelta(days=(end - start).days // 2)
        demo_logged = [
            OverviewBlock(
                status="logged",
                contract_id=demo.DEMO_CONTRACTS[0].id,
                contract_name=demo.DEMO_CONTRACTS[0].name,
                title="[Demo] Logged entry A",
                start=datetime(mid.year, mid.month, mid.day, 10, 0, tzinfo=tz),
                end=datetime(mid.year, mid.month, mid.day, 11, 0, tzinfo=tz),
                hours=1.0,
            ),
            OverviewBlock(
                status="logged",
                contract_id=demo.DEMO_CONTRACTS[1].id,
                contract_name=demo.DEMO_CONTRACTS[1].name,
                title="[Demo] Logged entry B",
                start=datetime(mid.year, mid.month, mid.day, 14, 0, tzinfo=tz),
                end=datetime(mid.year, mid.month, mid.day, 15, 30, tzinfo=tz),
                hours=1.5,
            ),
            OverviewBlock(
                status="logged",
                contract_id=demo.DEMO_CONTRACTS[0].id,
                contract_name=demo.DEMO_CONTRACTS[0].name,
                title="[Demo] Logged entry C",
                start=datetime(mid.year, mid.month, mid.day, 16, 0, tzinfo=tz),
                end=datetime(mid.year, mid.month, mid.day, 17, 0, tzinfo=tz),
                hours=1.0,
            ),
        ]
        blocks = demo_logged + blocks
    else:
        try:
            entries = odoo.existing_entries(
                datetime(start.year, start.month, start.day,
                         tzinfo=timezone.utc),
                datetime(end.year, end.month, end.day, 23, 59, 59,
                         tzinfo=timezone.utc),
            )
            for row in entries:
                st_str = row.get("start_time")
                et_str = row.get("end_time")
                if not st_str or not et_str:
                    continue
                try:
                    st = parse_odoo_utc(st_str, settings.LOCAL_TZ)
                    et = parse_odoo_utc(et_str, settings.LOCAL_TZ)
                except Exception:
                    continue
                duration = row.get("duration_h") or 0.0
                hours = float(duration) if duration else round(
                    (et - st).total_seconds() / 3600.0, 2)
                blocks.append(OverviewBlock(
                    status="logged",
                    contract_id=row.get("contract_id"),
                    contract_name=row.get("contract_name") or "",
                    title=row.get("work_description") or "",
                    start=st,
                    end=et,
                    hours=hours,
                ))
        except Exception:
            logger.exception("Failed to load existing Odoo entries for overview")

    # -- by_contract aggregation ----------------------------------------------
    logged_map: dict[int, float] = {}
    to_log_map: dict[int, float] = {}
    name_map: dict[int, str] = {}
    for blk in blocks:
        if blk.contract_id is None:
            continue
        cid = blk.contract_id
        name_map.setdefault(cid, blk.contract_name)
        if blk.status == "logged":
            logged_map[cid] = logged_map.get(cid, 0.0) + blk.hours
        else:
            to_log_map[cid] = to_log_map.get(cid, 0.0) + blk.hours

    all_cids = set(logged_map) | set(to_log_map)
    by_contract = [
        ContractOverview(
            contract_id=cid,
            contract_name=name_map.get(cid, ""),
            logged_hours=round(logged_map.get(cid, 0.0), 2),
            to_log_hours=round(to_log_map.get(cid, 0.0), 2),
        )
        for cid in all_cids
    ]
    by_contract.sort(
        key=lambda c: c.logged_hours + c.to_log_hours, reverse=True
    )

    return OverviewResponse(by_contract=by_contract, blocks=blocks)


@app.get("/api/ignore", response_model=list[str])
def get_ignore(ignore_store: IgnoreStore = Depends(deps.ignore_store)):
    return ignore_store.get()


@app.put("/api/ignore", response_model=list[str])
def put_ignore(body: IgnoreUpdate,
               ignore_store: IgnoreStore = Depends(deps.ignore_store)):
    return ignore_store.set(body.keywords)


@app.post("/api/excluded")
def exclude_entry(body: ExcludedEntryRef,
                  excluded_store: ExcludedStore = Depends(deps.excluded_store)):
    excluded_store.add(body.uid, body.start, body.end, body.title, body.date)
    return {"status": "excluded"}


@app.get("/api/excluded", response_model=list[RemovedEvent])
def list_excluded(excluded_store: ExcludedStore = Depends(deps.excluded_store)):
    return excluded_store.list()


@app.delete("/api/excluded")
def restore_entry(body: ExcludedEntryRef,
                  excluded_store: ExcludedStore = Depends(deps.excluded_store)):
    excluded_store.remove(body.uid, body.start)
    return {"status": "restored"}


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
        return {"odoo": True, "calendar": True, "odoo_unreachable": False, "errors": {}}
    result = {"odoo": False, "calendar": False, "odoo_unreachable": False, "errors": {}}
    try:
        result["odoo"] = odoo.test_connection()
    except OdooUnreachable as exc:
        result["odoo"] = False
        result["odoo_unreachable"] = True
        result["errors"]["odoo"] = str(exc)
    except OdooSessionExpired as exc:
        result["odoo"] = False
        result["odoo_unreachable"] = False
        result["errors"]["odoo"] = str(exc)
    except Exception as exc:
        result["errors"]["odoo"] = str(exc)
    try:
        fetch_ical(settings.GOOGLE_CALENDAR_URL)
        result["calendar"] = True
    except Exception as exc:
        result["errors"]["calendar"] = str(exc)
    return result


# Serve the built SPA last, so API routes take precedence. Only mounted when a
# built frontend exists (production / packaged app); in dev Vite serves the UI.
_dist = frontend_dist_dir()
if _dist is not None:
    app.mount("/", SPAStaticFiles(directory=str(_dist), html=True), name="spa")
