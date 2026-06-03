# backend/tests/test_aggregations.py
from datetime import date, datetime

from app.aggregations import group_by_day, weekly_by_contract
from app.schemas import CalendarEvent, ProposedEntry, MatchResult


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


def test_weekly_by_contract_sums_per_project_task():
    def proposed(uid, hours, pid, pname, tid, tname):
        ev = _event(uid, date(2026, 6, 1), hours)
        match = MatchResult(project_id=pid, project_name=pname,
                            task_id=tid, task_name=tname)
        return ProposedEntry(event=ev, match=match)

    entries = [
        proposed("a", 1.0, 10, "GreenVolt", 55, "Meetings"),
        proposed("b", 0.5, 10, "GreenVolt", 55, "Meetings"),
        proposed("c", 2.0, 20, "Lisport", None, None),
    ]
    totals = weekly_by_contract(entries)
    gv = [t for t in totals if t.project_id == 10][0]
    assert gv.hours == 1.5
    assert gv.task_name == "Meetings"
    lisport = [t for t in totals if t.project_id == 20][0]
    assert lisport.hours == 2.0
