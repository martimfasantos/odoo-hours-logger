import pytest
from pydantic import ValidationError

from app.config import Settings

_REQUIRED = dict(
    GOOGLE_CALENDAR_URL="https://example.com/basic.ics",
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
    assert s.GOOGLE_CALENDAR_URL == "https://example.com/basic.ics"
    assert s.LOCAL_TZ == "Europe/Lisbon"
    result = s.data_path("rules.json")
    assert result.name == "rules.json"
    # data_path must be pure — it must NOT create the directory
    assert not (tmp_path / "data").exists()


def test_local_tz_defaults_to_lisbon():
    s = Settings(
        GOOGLE_CALENDAR_URL="x", ODOO_URL="x", ODOO_DB="x",
        ODOO_USERNAME="x", ODOO_API_KEY="x",
    )
    assert s.LOCAL_TZ == "Europe/Lisbon"


def test_invalid_local_tz_raises():
    with pytest.raises(ValidationError):
        Settings(**_REQUIRED, LOCAL_TZ="Not/AZone")


def test_data_dir_default_resolves_under_app_data_dir():
    from app.config import Settings
    from app.paths import app_data_dir

    # _env_file=None avoids reading a real backend/.env that could set DATA_DIR.
    s = Settings(_env_file=None)
    assert s.DATA_DIR == str(app_data_dir() / "data")


def test_old_session_cookie_keys_in_env_file_are_ignored(tmp_path):
    env = tmp_path / ".env"
    env.write_text(
        "ODOO_SESSION_ID=old-sess\nODOO_VISITOR_UUID=old-visitor\n"
        "ODOO_USER_ID=7\nODOO_USERNAME=me@example.com\nODOO_API_KEY=key-abc\n"
    )
    s = Settings(_env_file=str(env))
    assert (s.ODOO_USERNAME, s.ODOO_API_KEY) == ("me@example.com", "key-abc")
    assert "ODOO_SESSION_ID" not in s.model_dump()


def test_data_path_anchors_relative_dir_to_app_data_dir(monkeypatch, tmp_path):
    # A relative DATA_DIR (the historical "data") must resolve UNDER
    # app_data_dir(), not the process CWD. Otherwise a packaged app launched
    # from "/" reads/writes /data and silently loses the user's rules.
    from app import config as config_mod

    monkeypatch.setattr(config_mod, "app_data_dir", lambda: tmp_path)
    s = config_mod.Settings(_env_file=None, DATA_DIR="data")
    assert s.data_path("rules.json") == tmp_path / "data" / "rules.json"


def test_data_path_keeps_absolute_dir_as_is(tmp_path):
    # An absolute DATA_DIR (e.g. what the tests inject) is used verbatim.
    from app.config import Settings

    abs_dir = tmp_path / "abs"
    s = Settings(_env_file=None, DATA_DIR=str(abs_dir))
    assert s.data_path("rules.json") == abs_dir / "rules.json"
