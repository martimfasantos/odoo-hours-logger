from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    ICAL_URL: str
    ODOO_URL: str
    ODOO_DB: str
    ODOO_USERNAME: str
    ODOO_API_KEY: str
    LOCAL_TZ: str = "Europe/Lisbon"
    USER_EMAIL: str = ""
    DATA_DIR: str = "data"

    def data_path(self, filename: str) -> Path:
        d = Path(self.DATA_DIR)
        d.mkdir(parents=True, exist_ok=True)
        return d / filename


def get_settings() -> Settings:
    return Settings()
