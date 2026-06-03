from datetime import date as Date
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class CalendarEvent(BaseModel):
    uid: str
    title: str
    start: datetime
    end: datetime
    hours: float
    date: Date


class RuleCreate(BaseModel):
    name: str
    keywords: list[str]
    project_id: int
    project_name: str
    task_id: Optional[int] = None
    task_name: Optional[str] = None
    priority: int = 100
    active: bool = True


class Rule(RuleCreate):
    id: int


class MatchResult(BaseModel):
    rule_id: Optional[int] = None
    project_id: Optional[int] = None
    project_name: Optional[str] = None
    task_id: Optional[int] = None
    task_name: Optional[str] = None
    alternative_rule_ids: list[int] = Field(default_factory=list)


class ProposedEntry(BaseModel):
    event: CalendarEvent
    match: MatchResult
    already_logged: bool = False
    overlaps: bool = False


class PushEntry(BaseModel):
    uid: str
    start: datetime
    date: Date
    hours: float
    description: str
    project_id: int
    task_id: Optional[int] = None


class PushResult(BaseModel):
    uid: str
    start: datetime
    success: bool
    odoo_line_id: Optional[int] = None
    error: Optional[str] = None


class OdooRef(BaseModel):
    id: int
    name: str


class ContractTotal(BaseModel):
    project_id: int
    project_name: str
    task_id: Optional[int] = None
    task_name: Optional[str] = None
    hours: float
