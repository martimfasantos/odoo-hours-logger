from datetime import date as Date
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from app.schemas import CalendarEvent, OdooRef

DEMO_CONTRACTS: list[OdooRef] = [
    OdooRef(id=9001, name="[9001] Demo Client A"),
    OdooRef(id=9002, name="[9002] Demo Client B"),
    OdooRef(id=9003, name="[9003] Internal"),
]

# Template: (uid, title, day_offset, hour_start, hour_end)
# demo-1 and demo-2 intentionally overlap (9:00–10:00 and 9:30–10:30)
_TEMPLATES = [
    ("demo-1", "GreenVolt standup",   0,  9,    10),
    ("demo-2", "GreenVolt dev sync",  0,  9.5,  10.5),
    ("demo-3", "Team lunch",          0,  12,   13),
    ("demo-4", "Lisport workshop",    1,  14,   15.5),
    ("demo-5", "Internal admin",      2,  16,   16.5),
]


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
