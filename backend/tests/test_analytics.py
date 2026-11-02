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
    res = build_analytics(entries, rates)

    by_id = {p.contract_id: p for p in res.projects}
    assert by_id[1].hours == 6.0
    assert by_id[1].revenue == 600.0
    assert by_id[1].cost == 240.0
    assert by_id[1].margin == 360.0
    assert by_id[1].margin_pct == 60.0
    assert by_id[1].external_rate == 100.0
    # contract 2 had no rates provided
    assert by_id[2].external_rate is None
    # projects sorted by revenue desc
    assert res.projects[0].contract_id == 1


def test_build_analytics_zero_revenue_margin_pct_none():
    entries = [_entry(3, 2.0, 90.0, 0.0, date(2026, 6, 1))]
    res = build_analytics(entries, {})
    assert res.projects[0].revenue == 0.0
    assert res.projects[0].margin == -90.0
    assert res.projects[0].margin_pct is None


def test_build_analytics_returns_one_entry_row_per_logged_entry():
    entries = [
        _entry(1, 3.0, 120.0, 300.0, date(2026, 6, 1)),
        _entry(2, 1.5, 60.0, 0.0, date(2026, 7, 2)),
        _entry(None, 9.0, 0.0, 0.0, date(2026, 6, 3)),  # unmatched: skipped
    ]
    res = build_analytics(entries, {})
    assert [e.model_dump() for e in res.entries] == [
        {"date": date(2026, 6, 1), "contract_id": 1,
         "hours": 3.0, "revenue": 300.0, "cost": 120.0},
        {"date": date(2026, 7, 2), "contract_id": 2,
         "hours": 1.5, "revenue": 0.0, "cost": 60.0},
    ]


def test_build_analytics_empty():
    res = build_analytics([], {})
    assert res.projects == []
    assert res.entries == []
