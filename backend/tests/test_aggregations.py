# backend/tests/test_aggregations.py
from datetime import date, datetime

from app.aggregations import group_by_day, weekly_by_contract
from app.schemas import CalendarEvent, MatchResult, ProposedEntry


def _event(uid, d, hours, title="x"):
    start = datetime(d.year, d.month, d.day, 9, 0)
    return CalendarEvent(uid=uid, title=title, start=start,
                         end=start, hours=hours, date=d)


def test_group_by_day_buckets_events():
    events = [
        _event("a", date(2026, 6, 1), 1.0),
        _event("b", date(2026, 6, 1), 0.5),
        _event("c", date(2026, 6, 2), 2.0),
    ]
    grouped = group_by_day(events)
    assert sorted(grouped.keys()) == [date(2026, 6, 1), date(2026, 6, 2)]
    assert len(grouped[date(2026, 6, 1)]) == 2


def test_weekly_by_contract_sums_per_contract():
    def proposed(uid, hours, cid, cname):
        ev = _event(uid, date(2026, 6, 1), hours)
        match = MatchResult(contract_id=cid, contract_name=cname)
        return ProposedEntry(event=ev, match=match)

    entries = [
        proposed("a", 1.0, 10, "GreenVolt"),
        proposed("b", 0.5, 10, "GreenVolt"),
        proposed("c", 2.0, 20, "Lisport"),
    ]
    totals = weekly_by_contract(entries)
    gv = [t for t in totals if t.contract_id == 10][0]
    assert gv.hours == 1.5
    assert gv.contract_name == "GreenVolt"
    lisport = [t for t in totals if t.contract_id == 20][0]
    assert lisport.hours == 2.0


def test_weekly_by_contract_skips_unmatched():
    ev = _event("a", date(2026, 6, 1), 1.0)
    entries = [ProposedEntry(event=ev, match=MatchResult())]
    assert weekly_by_contract(entries) == []
