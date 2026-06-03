from collections import defaultdict
from datetime import date as Date
from typing import Optional

from app.schemas import CalendarEvent, ContractTotal, ProposedEntry


def group_by_day(events: list[CalendarEvent]) -> dict[Date, list[CalendarEvent]]:
    grouped: dict[Date, list[CalendarEvent]] = defaultdict(list)
    for ev in events:
        grouped[ev.date].append(ev)
    return dict(grouped)


def weekly_by_contract(entries: list[ProposedEntry]) -> list[ContractTotal]:
    buckets: dict[tuple[int, Optional[int]], ContractTotal] = {}
    for entry in entries:
        m = entry.match
        if m.project_id is None:
            continue
        key = (m.project_id, m.task_id)
        if key not in buckets:
            buckets[key] = ContractTotal(
                project_id=m.project_id,
                project_name=m.project_name or "",
                task_id=m.task_id,
                task_name=m.task_name,
                hours=0.0,
            )
        buckets[key].hours = round(buckets[key].hours + entry.event.hours, 2)
    return list(buckets.values())
