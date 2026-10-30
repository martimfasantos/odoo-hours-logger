from collections import defaultdict
from datetime import date as Date

from app.schemas import (
    AnalyticsEntry, AnalyticsProject, AnalyticsResponse,
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


def build_analytics(entries: list[dict], rates: dict[int, dict],
                    currency: str = "EUR") -> AnalyticsResponse:
    """Aggregate logged timesheet entries into per-project analytics.

    Each entry is a dict with: contract_id, contract_name, duration_h,
    internal_cost, external_cost, local_date (date). `rates` maps contract_id →
    {internal_rate, external_rate, margin}. Entries are also returned one row
    each so the client can bucket them by any period.
    """
    agg: dict[int, dict] = {}
    rows: list[AnalyticsEntry] = []
    for e in entries:
        cid = e.get("contract_id")
        if cid is None:
            continue
        hours = e.get("duration_h", 0.0) or 0.0
        revenue = e.get("external_cost", 0.0) or 0.0
        cost = e.get("internal_cost", 0.0) or 0.0
        b = agg.setdefault(cid, {
            "name": e.get("contract_name") or f"Contract {cid}",
            "hours": 0.0, "revenue": 0.0, "cost": 0.0,
        })
        b["hours"] += hours
        b["revenue"] += revenue
        b["cost"] += cost
        rows.append(AnalyticsEntry(date=e["local_date"], contract_id=cid,
                                   hours=hours, revenue=revenue, cost=cost))

    projects: list[AnalyticsProject] = []
    for cid, b in agg.items():
        r = rates.get(cid, {})
        margin = b["revenue"] - b["cost"]
        projects.append(AnalyticsProject(
            contract_id=cid,
            contract_name=b["name"],
            hours=round(b["hours"], 2),
            internal_rate=r.get("internal_rate"),
            external_rate=r.get("external_rate"),
            revenue=round(b["revenue"], 2),
            cost=round(b["cost"], 2),
            margin=round(margin, 2),
            margin_pct=round(margin / b["revenue"] * 100, 1) if b["revenue"] else None,
        ))
    projects.sort(key=lambda p: p.revenue, reverse=True)

    return AnalyticsResponse(projects=projects, entries=rows, currency=currency)
