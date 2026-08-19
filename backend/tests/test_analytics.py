from datetime import date

from app.aggregations import build_analytics


def _entry(cid, hours, internal, external, d):
    return {
        "contract_id": cid, "contract_name": f"[{cid}] C{cid}",
        "duration_h": hours, "internal_cost": internal,
        "external_cost": external, "local_date": d,
    }


def test_build_analytics_aggregates_per_project():
    entries = [
        _entry(1, 4.0, 160.0, 400.0, date(2026, 6, 1)),
        _entry(1, 2.0, 80.0, 200.0, date(2026, 6, 2)),
        _entry(2, 4.0, 200.0, 300.0, date(2026, 6, 3)),
    ]
    rates = {1: {"internal_rate": 40.0, "external_rate": 100.0, "margin": 0.6}}
    res = build_analytics(entries, rates, date(2026, 6, 1), date(2026, 6, 7))

    by_id = {p.contract_id: p for p in res.projects}
    assert by_id[1].hours == 6.0
    assert by_id[1].revenue == 600.0
    assert by_id[1].cost == 240.0
    assert by_id[1].margin == 360.0
    assert by_id[1].margin_pct == 60.0
    assert by_id[1].external_rate == 100.0
    # allocation: contract 1 has 6 of 10 total hours
    assert by_id[1].allocation_pct == 60.0
    assert by_id[2].allocation_pct == 40.0
    # contract 2 had no rates provided
    assert by_id[2].external_rate is None

    assert res.totals.hours == 10.0
    assert res.totals.revenue == 900.0
    assert res.totals.margin == 460.0
    # projects sorted by revenue desc
    assert res.projects[0].contract_id == 1


def test_build_analytics_zero_revenue_margin_pct_none():
    entries = [_entry(3, 2.0, 90.0, 0.0, date(2026, 6, 1))]
    res = build_analytics(entries, {}, date(2026, 6, 1), date(2026, 6, 7))
    assert res.projects[0].revenue == 0.0
    assert res.projects[0].margin == -90.0
    assert res.projects[0].margin_pct is None
    assert res.totals.margin_pct is None


def test_build_analytics_weekly_is_continuous():
    # one entry in week 1, none in week 2, one in week 3
    entries = [
        _entry(1, 3.0, 0.0, 0.0, date(2026, 6, 1)),   # week of Jun 1
        _entry(1, 5.0, 0.0, 0.0, date(2026, 6, 15)),  # week of Jun 15
    ]
    res = build_analytics(entries, {}, date(2026, 6, 1), date(2026, 6, 21))
    assert [w.week_start for w in res.weekly] == [
        date(2026, 6, 1), date(2026, 6, 8), date(2026, 6, 15),
    ]
    assert [w.hours for w in res.weekly] == [3.0, 0.0, 5.0]


def test_build_analytics_empty():
    res = build_analytics([], {}, date(2026, 6, 1), date(2026, 6, 7))
    assert res.projects == []
    assert res.totals.hours == 0.0
    assert res.totals.margin_pct is None
    assert len(res.weekly) == 1  # single spanned week, zero hours
