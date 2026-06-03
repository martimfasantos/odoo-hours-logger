import pytest
from pydantic import ValidationError

from app.config import Settings

_REQUIRED = dict(
    ICAL_URL="https://example.com/basic.ics",
    ODOO_URL="https://odoo.example.com",
    ODOO_DB="mydb",
    ODOO_USERNAME="me@example.com",
    ODOO_API_KEY="secret",
)


def test_settings_load_from_env_values(tmp_path):
    s = Settings(
        **_REQUIRED,
        LOCAL_TZ="Europe/Lisbon",
        USER_EMAIL="me@example.com",
        DATA_DIR=str(tmp_path / "data"),
    )
    assert s.ICAL_URL == "https://example.com/basic.ics"
    assert s.LOCAL_TZ == "Europe/Lisbon"
    result = s.data_path("rules.json")
    assert result.name == "rules.json"
    # data_path must be pure — it must NOT create the directory
    assert not (tmp_path / "data").exists()


def test_local_tz_defaults_to_lisbon():
    s = Settings(
        ICAL_URL="x", ODOO_URL="x", ODOO_DB="x",
        ODOO_USERNAME="x", ODOO_API_KEY="x",
    )
    assert s.LOCAL_TZ == "Europe/Lisbon"


def test_invalid_local_tz_raises():
    with pytest.raises(ValidationError):
        Settings(**_REQUIRED, LOCAL_TZ="Not/AZone")
