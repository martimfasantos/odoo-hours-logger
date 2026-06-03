from functools import lru_cache

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
def odoo() -> OdooClient:
    s = settings()
    return OdooClient(s.ODOO_URL, s.ODOO_DB, s.ODOO_USERNAME, s.ODOO_API_KEY)
