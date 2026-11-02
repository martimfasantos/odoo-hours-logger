from datetime import date as Date
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from app.schemas import CalendarEvent, OdooRef

_TODAY = Date.today()

# Client B has already ended so the contract-date warnings show in demo mode.
DEMO_CONTRACTS: list[OdooRef] = [
    OdooRef(id=9001, name="[9001] Demo Client A",
            start_date=_TODAY - timedelta(days=365),
            end_date=_TODAY + timedelta(days=365)),
    OdooRef(id=9002, name="[9002] Demo Client B",
            start_date=_TODAY - timedelta(days=365),
            end_date=_TODAY - timedelta(days=30)),
    OdooRef(id=9003, name="[9003] Internal"),
]

# Template: (uid, title, day_offset, hour_start, hour_end)
# demo-1 and demo-2 intentionally overlap (9:00–10:00 and 9:30–10:30)
_TEMPLATES = [
    ("demo-1", "Client A standup",    0,  9,    10),
    ("demo-2", "Client A dev sync",   0,  9.5,  10.5),
    ("demo-3", "Team lunch",          0,  12,   13),
    ("demo-4", "Client B workshop",   1,  14,   15.5),
    ("demo-5", "Internal admin",      2,  16,   16.5),
]


def demo_analytics(start: Date, end: Date, local_tz: str):
    """Deterministic sample analytics so the tab works offline (demo mode).

    Every weekday in the range gets Client A hours, most get Client B, and
    Fridays add non-billable Internal time, so the chart's day/week/month and
    billable/margin views all have something to show.
    """
    from app.aggregations import build_analytics

    rates = {
        9001: {"internal_rate": 40.0, "external_rate": 100.0, "margin": 0.6},
        9002: {"internal_rate": 50.0, "external_rate": 90.0, "margin": 0.44},
        9003: {"internal_rate": 45.0, "external_rate": 0.0, "margin": 0.0},
    }
    names = {c.id: c.name for c in DEMO_CONTRACTS}

    def entry(cid, d, hours):
        r = rates[cid]
        return {
            "contract_id": cid, "contract_name": names[cid],
            "duration_h": hours, "internal_cost": hours * r["internal_rate"],
            "external_cost": hours * r["external_rate"], "local_date": d,
        }

    entries = []
    d = start
    while d <= end:
        n = d.toordinal()
        if d.weekday() < 5:
            entries.append(entry(9001, d, 2.0 + n % 4))
            if n % 3:
                entries.append(entry(9002, d, 1.5 + n % 2))
            if d.weekday() == 4:
                entries.append(entry(9003, d, 1.5))
        d += timedelta(days=1)
    return build_analytics(entries, rates)


def demo_events(start: Date, end: Date, local_tz: str) -> list[CalendarEvent]:
    tz = ZoneInfo(local_tz)
    span = (end - start).days  # number of extra days available (0 = single day)
    events: list[CalendarEvent] = []
    for uid, title, day_off, h_start, h_end in _TEMPLATES:
        actual_offset = min(day_off, span)
        ev_date = start + timedelta(days=actual_offset)
        ev_start = datetime(ev_date.year, ev_date.month, ev_date.day,
                            int(h_start), int((h_start % 1) * 60), tzinfo=tz)
        ev_end = datetime(ev_date.year, ev_date.month, ev_date.day,
                          int(h_end), int((h_end % 1) * 60), tzinfo=tz)
        hours = round((ev_end - ev_start).total_seconds() / 3600.0, 2)
        events.append(CalendarEvent(
            uid=uid,
            title=title,
            start=ev_start,
            end=ev_end,
            hours=hours,
            date=ev_date,
        ))
    return events
