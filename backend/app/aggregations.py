from collections import defaultdict
from datetime import date as Date

from app.schemas import CalendarEvent, ContractTotal, ProposedEntry


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
