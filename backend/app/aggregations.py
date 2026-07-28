from collections import defaultdict
from datetime import date as Date
from datetime import timedelta

from app.schemas import (
    AnalyticsProject, AnalyticsResponse, AnalyticsTotals, AnalyticsWeek,
    CalendarEvent, ContractTotal, ProposedEntry,
)


def group_by_day(events: list[CalendarEvent]) -> dict[Date, list[CalendarEvent]]:
    grouped: dict[Date, list[CalendarEvent]] = defaultdict(list)
    for ev in events:
        grouped[ev.date].append(ev)
    return dict(grouped)


def weekly_by_contract(entries: list[ProposedEntry]) -> list[ContractTotal]:
    buckets: dict[int, ContractTotal] = {}
    for entry in entries:
        m = entry.match
        if m.contract_id is None:
            continue
        key = m.contract_id
        if key not in buckets:
            buckets[key] = ContractTotal(
                contract_id=m.contract_id,
                contract_name=m.contract_name or "",
                hours=0.0,
            )
        buckets[key].hours = round(buckets[key].hours + entry.event.hours, 2)
    return list(buckets.values())


def _week_start(d: Date) -> Date:
    """Monday of the ISO week containing `d`."""
    return d - timedelta(days=d.weekday())


def build_analytics(entries: list[dict], rates: dict[int, dict],
                    start: Date, end: Date,
                    currency: str = "EUR") -> AnalyticsResponse:
    """Aggregate logged timesheet entries into per-project analytics.

    Each entry is a dict with: contract_id, contract_name, duration_h,
    internal_cost, external_cost, local_date (date). `rates` maps contract_id →
    {internal_rate, external_rate, margin}. The weekly series spans every ISO
    week between `start` and `end` (empty weeks included) for a continuous trend.
    """
    agg: dict[int, dict] = {}
    total_hours = 0.0
    for e in entries:
        cid = e.get("contract_id")
        if cid is None:
            continue
        b = agg.setdefault(cid, {
            "name": e.get("contract_name") or f"Contract {cid}",
            "hours": 0.0, "revenue": 0.0, "cost": 0.0,
        })
        b["hours"] += e.get("duration_h", 0.0) or 0.0
        b["revenue"] += e.get("external_cost", 0.0) or 0.0
        b["cost"] += e.get("internal_cost", 0.0) or 0.0
        total_hours += e.get("duration_h", 0.0) or 0.0

    projects: list[AnalyticsProject] = []
    for cid, b in agg.items():
        r = rates.get(cid, {})
        margin = b["revenue"] - b["cost"]
        projects.append(AnalyticsProject(
            contract_id=cid,
            contract_name=b["name"],
            hours=round(b["hours"], 2),
            allocation_pct=round(b["hours"] / total_hours * 100, 1) if total_hours else 0.0,
            internal_rate=r.get("internal_rate"),
            external_rate=r.get("external_rate"),
            revenue=round(b["revenue"], 2),
            cost=round(b["cost"], 2),
            margin=round(margin, 2),
            margin_pct=round(margin / b["revenue"] * 100, 1) if b["revenue"] else None,
        ))
    projects.sort(key=lambda p: p.revenue, reverse=True)

    tot_rev = round(sum(p.revenue for p in projects), 2)
    tot_cost = round(sum(p.cost for p in projects), 2)
    tot_margin = round(tot_rev - tot_cost, 2)
    totals = AnalyticsTotals(
        hours=round(total_hours, 2),
        revenue=tot_rev, cost=tot_cost, margin=tot_margin,
        margin_pct=round(tot_margin / tot_rev * 100, 1) if tot_rev else None,
    )

    week_hours: dict[Date, float] = defaultdict(float)
    for e in entries:
        d = e.get("local_date")
        if d is None:
            continue
        week_hours[_week_start(d)] += e.get("duration_h", 0.0) or 0.0
    weekly: list[AnalyticsWeek] = []
    w, last = _week_start(start), _week_start(end)
    while w <= last:
        weekly.append(AnalyticsWeek(week_start=w, hours=round(week_hours.get(w, 0.0), 2)))
        w = w + timedelta(days=7)

    return AnalyticsResponse(projects=projects, totals=totals,
                             weekly=weekly, currency=currency)
