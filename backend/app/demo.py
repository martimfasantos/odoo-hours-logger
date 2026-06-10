from datetime import date as Date
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from app.schemas import CalendarEvent, OdooRef

DEMO_PROJECTS: list[OdooRef] = [
    OdooRef(id=101, name="GreenVolt"),
    OdooRef(id=102, name="Lisport"),
    OdooRef(id=103, name="Internal"),
]

DEMO_TASKS: dict[int, list[OdooRef]] = {
    101: [OdooRef(id=1001, name="Meetings"), OdooRef(id=1002, name="Development")],
    102: [OdooRef(id=1003, name="Workshops"), OdooRef(id=1004, name="Support")],
    103: [OdooRef(id=1005, name="Admin")],
}

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
