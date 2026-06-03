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
