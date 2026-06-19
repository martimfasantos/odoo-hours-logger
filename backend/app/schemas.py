import re
from datetime import date as Date
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator


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
    contract_id: int
    contract_name: str
    active: bool = True


class Rule(RuleCreate):
    id: int


class MatchResult(BaseModel):
    rule_id: Optional[int] = None
    contract_id: Optional[int] = None
    contract_name: Optional[str] = None
    alternative_rule_ids: list[int] = Field(default_factory=list)


class ProposedEntry(BaseModel):
    event: CalendarEvent
    match: MatchResult
    already_logged: bool = False
    overlaps: bool = False


class PushEntry(BaseModel):
    uid: str
    start: datetime
    end: datetime
    description: str
    contract_id: int


class PushResult(BaseModel):
    uid: str
    start: datetime
    success: bool
    odoo_id: Optional[int] = None
    error: Optional[str] = None


class OdooRef(BaseModel):
    id: int
    name: str

    @field_validator("name", mode="before")
    @classmethod
    def _coerce_name(cls, v):
        return v or ""


class ContractTotal(BaseModel):
    contract_id: int
    contract_name: str
    hours: float


class ColorUpdate(BaseModel):
    color: str

    @field_validator("color")
    @classmethod
    def _hex(cls, v: str) -> str:
        if not re.fullmatch(r"#[0-9a-fA-F]{6}", v):
            raise ValueError("color must be a #RRGGBB hex string")
        return v


class OverviewBlock(BaseModel):
    contract_id: Optional[int] = None
    contract_name: str
    title: str
    start: datetime
    end: datetime
    hours: float
    status: str  # "logged" or "to_log"


class ContractOverview(BaseModel):
    contract_id: int
    contract_name: str
    logged_hours: float
    to_log_hours: float


class OverviewResponse(BaseModel):
    by_contract: list[ContractOverview]
    blocks: list[OverviewBlock]


class ConfigValues(BaseModel):
    GOOGLE_CALENDAR_URL: Optional[str] = None
    ODOO_URL: Optional[str] = None
    ODOO_DB: Optional[str] = None
    ODOO_SESSION_ID: Optional[str] = None
    ODOO_VISITOR_UUID: Optional[str] = None
    ODOO_USER_ID: Optional[int] = None
    ODOO_NETWORK_MEMBER_ID: Optional[int] = None
    LOCAL_TZ: Optional[str] = None
    USER_EMAIL: Optional[str] = None
    DEMO_MODE: Optional[bool] = None
