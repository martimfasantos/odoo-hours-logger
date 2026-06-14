from functools import lru_cache

from app.colors import ColorStore
from app.config import Settings, get_settings
from app.ledger import Ledger
from app.odoo_client import OdooClient
from app.rules import RulesStore


@lru_cache
def settings() -> Settings:
    return get_settings()


@lru_cache
def rules_store() -> RulesStore:
    return RulesStore(settings().data_path("rules.json"))


@lru_cache
def ledger() -> Ledger:
    return Ledger(settings().data_path("ledger.json"))


@lru_cache
def colors_store() -> ColorStore:
    return ColorStore(settings().data_path("project_colors.json"))


@lru_cache
def odoo() -> OdooClient:
    s = settings()
    return OdooClient(
        base_url=s.ODOO_URL,
        session_id=s.ODOO_SESSION_ID,
        local_tz=s.LOCAL_TZ,
        db=s.ODOO_DB,
        visitor_uuid=s.ODOO_VISITOR_UUID,
        user_id=s.ODOO_USER_ID,
        network_member_id=s.ODOO_NETWORK_MEMBER_ID,
    )
