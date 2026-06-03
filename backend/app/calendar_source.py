from datetime import date as Date
from datetime import datetime, time, timedelta
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
    # Pass date objects; end+1 day makes the upper bound exclusive so timed
    # events on `end` day are included (recurring_ical_events convention).
    components = recurring_ical_events.of(cal).between(start, end + timedelta(days=1))

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
