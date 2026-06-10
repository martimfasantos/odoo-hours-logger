from pathlib import Path
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    GOOGLE_CALENDAR_URL: str = ""
    ODOO_URL: str = ""
    ODOO_DB: str = ""
    ODOO_USERNAME: str = ""
    ODOO_API_KEY: str = ""
    LOCAL_TZ: str = "Europe/Lisbon"
    USER_EMAIL: str = ""
    DATA_DIR: str = "data"
    DEMO_MODE: bool = False

    @field_validator("LOCAL_TZ")
    @classmethod
    def _validate_tz(cls, v: str) -> str:
        try:
            ZoneInfo(v)
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise ValueError(f"Invalid LOCAL_TZ timezone: {v!r}") from exc
        return v

    def data_path(self, filename: str) -> Path:
        return Path(self.DATA_DIR) / filename


def get_settings() -> Settings:
    return Settings()
