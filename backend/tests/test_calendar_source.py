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
