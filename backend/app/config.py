from pathlib import Path
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.paths import app_data_dir


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(app_data_dir() / ".env"), extra="ignore")

    GOOGLE_CALENDAR_URL: str = ""
    ODOO_URL: str = ""
    ODOO_DB: str = ""
    ODOO_USERNAME: str = ""
    ODOO_API_KEY: str = ""
    ODOO_NETWORK_MEMBER_ID: int | None = None
    LOCAL_TZ: str = "Europe/Lisbon"
    USER_EMAIL: str = ""
    DATA_DIR: str = str(app_data_dir() / "data")
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
        # A relative DATA_DIR (e.g. the historical "data") is anchored to
        # app_data_dir() so it resolves to the same place regardless of the
        # process CWD. This is what makes the packaged app — launched from "/"
        # — read and write its data under ~/Library/Application Support/…
        # instead of a throwaway /data. Absolute DATA_DIR values are used as-is.
        base = Path(self.DATA_DIR)
        if not base.is_absolute():
            base = app_data_dir() / base
        return base / filename


def get_settings() -> Settings:
    return Settings()
