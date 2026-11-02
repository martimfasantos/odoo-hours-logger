from datetime import date, datetime

from app.schemas import CalendarEvent, OdooRef, PushEntry, RuleCreate


def test_calendar_event_roundtrip():
    ev = CalendarEvent(
        uid="abc",
        title="Client A standup",
        start=datetime(2026, 6, 1, 9, 0),
        end=datetime(2026, 6, 1, 9, 30),
        hours=0.5,
        date=date(2026, 6, 1),
    )
    assert ev.hours == 0.5
    assert ev.title == "Client A standup"


def test_rule_create_defaults_active_true():
    rc = RuleCreate(
        name="Client A",
        keywords=["client a"],
        contract_id=10,
        contract_name="[10] Client A",
    )
    assert rc.active is True
    assert rc.contract_id == 10


def test_push_entry_requires_contract():
    pe = PushEntry(
        uid="abc",
        start=datetime(2026, 6, 1, 9, 0),
        end=datetime(2026, 6, 1, 9, 30),
        description="Client A standup",
        contract_id=10,
    )
    assert pe.contract_id == 10


def test_odoo_ref_coerces_falsy_name():
    ref = OdooRef(id=5, name=False)
    assert ref.name == ""
