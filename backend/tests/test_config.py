from app.config import Settings


def test_settings_load_from_env_values():
    s = Settings(
        ICAL_URL="https://example.com/basic.ics",
        ODOO_URL="https://odoo.example.com",
        ODOO_DB="mydb",
        ODOO_USERNAME="me@example.com",
        ODOO_API_KEY="secret",
        LOCAL_TZ="Europe/Lisbon",
        USER_EMAIL="me@example.com",
        DATA_DIR="data",
    )
    assert s.ICAL_URL == "https://example.com/basic.ics"
    assert s.LOCAL_TZ == "Europe/Lisbon"
    assert s.data_path("rules.json").name == "rules.json"


def test_local_tz_defaults_to_lisbon():
    s = Settings(
        ICAL_URL="x", ODOO_URL="x", ODOO_DB="x",
        ODOO_USERNAME="x", ODOO_API_KEY="x",
    )
    assert s.LOCAL_TZ == "Europe/Lisbon"
