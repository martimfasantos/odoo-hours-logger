from datetime import date as Date
from datetime import datetime, timezone
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from app import deps
from app.colors import ColorStore
from app.config import Settings
from app.excluded import ExcludedStore
from app.ignore import IgnoreStore
from app.ledger import Ledger
from app.main import app
from app.odoo_client import OdooClient, OdooUnreachable, OdooSessionExpired
from app.rules import RulesStore
from app.schemas import CalendarEvent, OdooRef


@pytest.fixture
def client(tmp_path, monkeypatch):
    rs = RulesStore(tmp_path / "rules.json")
    lg = Ledger(tmp_path / "ledger.json")
    cs = ColorStore(tmp_path / "project_colors.json")
    ig = IgnoreStore(tmp_path / "ignore_keywords.json")
    ex = ExcludedStore(tmp_path / "excluded.json")

    fake_odoo = MagicMock(spec=OdooClient)
    fake_odoo.list_contracts.return_value = [OdooRef(id=10, name="[10] GreenVolt")]
    fake_odoo.existing_entries.return_value = []
    fake_odoo.create_timesheet.return_value = 500
    fake_odoo.test_connection.return_value = True
    fake_odoo.user_email.return_value = "test.user@example.com"

    fake_settings = Settings(
        GOOGLE_CALENDAR_URL="https://example.com/calendar.ics",
        ODOO_URL="https://odoo.example.com",
        ODOO_DB="odoo",
        ODOO_SESSION_ID="sess-123",
        DEMO_MODE=False,
        DATA_DIR=str(tmp_path),
    )

    app.dependency_overrides[deps.rules_store] = lambda: rs
    app.dependency_overrides[deps.ledger] = lambda: lg
    app.dependency_overrides[deps.odoo] = lambda: fake_odoo
    app.dependency_overrides[deps.settings] = lambda: fake_settings
    app.dependency_overrides[deps.colors_store] = lambda: cs
    app.dependency_overrides[deps.ignore_store] = lambda: ig
    app.dependency_overrides[deps.excluded_store] = lambda: ex

    yield TestClient(app), fake_odoo, lg
    app.dependency_overrides.clear()


def test_health(client):
    c, _, _ = client
    assert c.get("/api/health").json() == {"status": "ok"}


def test_contracts_endpoint(client):
    c, fake_odoo, _ = client
    resp = c.get("/api/odoo/contracts")
    assert resp.status_code == 200
    assert resp.json()[0]["name"] == "[10] GreenVolt"
    fake_odoo.list_contracts.assert_called_once()


def test_contracts_endpoint_passes_query(client):
    c, fake_odoo, _ = client
    c.get("/api/odoo/contracts?query=green")
    fake_odoo.list_contracts.assert_called_once_with("green")


def test_rules_crud_flow(client):
    c, _, _ = client
    payload = {"name": "GreenVolt", "keywords": ["greenvolt"],
               "contract_id": 10, "contract_name": "[10] GreenVolt"}
    created = c.post("/api/rules", json=payload).json()
    assert created["id"] == 1
    assert len(c.get("/api/rules").json()) == 1
    c.delete(f"/api/rules/{created['id']}")
    assert c.get("/api/rules").json() == []


def test_analytics_endpoint(client):
    c, fake_odoo, _ = client
    fake_odoo.existing_entries.return_value = [
        {"contract_id": 10, "contract_name": "[10] GreenVolt",
         "start_time": "2026-06-01 09:00:00", "end_time": "2026-06-01 13:00:00",
         "work_description": "x", "duration_h": 4.0,
         "internal_cost": 160.0, "external_cost": 400.0},
    ]
    fake_odoo.contract_rates.return_value = {
        10: {"internal_rate": 40.0, "external_rate": 100.0, "margin": 0.6}}
    resp = c.get("/api/analytics?start=2026-06-01&end=2026-06-07")
    assert resp.status_code == 200
    body = resp.json()
    assert body["projects"][0]["contract_id"] == 10
    assert body["projects"][0]["revenue"] == 400.0
    assert body["projects"][0]["external_rate"] == 100.0
    assert body["totals"]["hours"] == 4.0
    assert body["currency"] == "EUR"
    assert len(body["weekly"]) >= 1


def test_push_creates_entry_and_records_ledger(client):
    c, fake_odoo, lg = client
    entry = {
        "uid": "evt-1",
        "start": "2026-06-01T09:00:00",
        "end": "2026-06-01T09:30:00",
        "description": "GreenVolt standup",
        "contract_id": 10,
    }
    resp = c.post("/api/timesheet/push", json={"entries": [entry]})
    body = resp.json()
    assert body["results"][0]["success"] is True
    assert body["results"][0]["odoo_id"] == 500
    fake_odoo.create_timesheet.assert_called_once()
    assert lg.is_logged("evt-1", datetime(2026, 6, 1, 9, 0)) is True


def test_push_skips_already_logged(client):
    c, fake_odoo, lg = client
    lg.record("evt-1", datetime(2026, 6, 1, 9, 0), odoo_id=1,
              contract_id=10, pushed_at="x")
    entry = {
        "uid": "evt-1", "start": "2026-06-01T09:00:00",
        "end": "2026-06-01T09:30:00", "description": "x", "contract_id": 10,
    }
    resp = c.post("/api/timesheet/push", json={"entries": [entry]})
    assert resp.json()["results"][0]["success"] is False
    assert "already logged" in resp.json()["results"][0]["error"].lower()
    fake_odoo.create_timesheet.assert_not_called()


def test_calendar_events_returns_502_when_ical_fails(client, monkeypatch):
    c, _, _ = client

    def _fail(url, **kw):
        raise RuntimeError("boom")

    monkeypatch.setattr("app.main.fetch_ical", _fail)
    resp = c.get("/api/calendar/events?start=2026-06-01&end=2026-06-07")
    assert resp.status_code == 502
    assert "Failed to load calendar" in resp.json()["detail"]


@pytest.fixture
def demo_client(tmp_path):
    rs = RulesStore(tmp_path / "rules.json")
    lg = Ledger(tmp_path / "ledger.json")
    cs = ColorStore(tmp_path / "project_colors.json")
    ig = IgnoreStore(tmp_path / "ignore_keywords.json")
    ex = ExcludedStore(tmp_path / "excluded.json")

    demo_settings = Settings(
        GOOGLE_CALENDAR_URL="",
        ODOO_URL="",
        ODOO_DB="",
        ODOO_SESSION_ID="",
        DEMO_MODE=True,
        DATA_DIR=str(tmp_path),
    )

    app.dependency_overrides[deps.rules_store] = lambda: rs
    app.dependency_overrides[deps.ledger] = lambda: lg
    app.dependency_overrides[deps.settings] = lambda: demo_settings
    app.dependency_overrides[deps.colors_store] = lambda: cs
    app.dependency_overrides[deps.ignore_store] = lambda: ig
    app.dependency_overrides[deps.excluded_store] = lambda: ex

    yield TestClient(app), lg, ig
    app.dependency_overrides.clear()


def test_excluded_hides_and_restores(demo_client):
    c, _, _ = demo_client
    url = "/api/calendar/events?start=2026-06-01&end=2026-06-05"
    events = c.get(url).json()
    assert len(events) > 0
    ev = events[0]["event"]
    uid, start = ev["uid"], ev["start"]

    # Exclude with metadata → disappears from the feed.
    assert c.post("/api/excluded", json={
        "uid": uid, "start": start, "end": ev["end"],
        "title": ev["title"], "date": ev["date"],
    }).status_code == 200
    after = c.get(url).json()
    assert len(after) == len(events) - 1
    assert all(not (e["event"]["uid"] == uid and e["event"]["start"] == start)
               for e in after)

    # Listed in GET with its metadata.
    removed = c.get("/api/excluded").json()
    assert any(r["uid"] == uid and r["start"] == start and r["title"] == ev["title"]
               for r in removed)

    # Restore → reappears, list empties.
    assert c.request("DELETE", "/api/excluded",
                     json={"uid": uid, "start": start}).status_code == 200
    assert c.get("/api/excluded").json() == []
    back = c.get(url).json()
    assert any(e["event"]["uid"] == uid and e["event"]["start"] == start for e in back)


def test_demo_contracts(demo_client):
    c, _, _ = demo_client
    resp = c.get("/api/odoo/contracts")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 3
    names = {p["name"] for p in data}
    assert "[9001] Demo Client A" in names
    assert "[9003] Internal" in names


def test_demo_events_returns_sample(demo_client):
    c, _, _ = demo_client
    resp = c.get("/api/calendar/events?start=2026-06-08&end=2026-06-12")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) >= 1
    # At least one entry should have overlaps=True (two events share time on same day)
    assert any(entry["overlaps"] for entry in data)


def test_demo_push_simulates_and_dedups(demo_client):
    c, lg, _ = demo_client
    entry = {
        "uid": "demo-1",
        "start": "2026-06-08T09:00:00+01:00",
        "end": "2026-06-08T10:00:00+01:00",
        "description": "GreenVolt standup",
        "contract_id": 9001,
    }
    resp = c.post("/api/timesheet/push", json={"entries": [entry]})
    assert resp.status_code == 200
    result = resp.json()["results"][0]
    assert result["success"] is True
    assert result["odoo_id"] is not None

    # Verify ledger recorded it
    start_dt = datetime.fromisoformat(entry["start"])
    assert lg.is_logged("demo-1", start_dt) is True

    # Push again — should be already logged
    resp2 = c.post("/api/timesheet/push", json={"entries": [entry]})
    result2 = resp2.json()["results"][0]
    assert result2["success"] is False
    assert "already logged" in result2["error"].lower()


def test_demo_test_connection(demo_client):
    c, _, _ = demo_client
    resp = c.post("/api/settings/test-connection")
    assert resp.status_code == 200
    body = resp.json()
    assert body["odoo"] is True
    assert body["calendar"] is True
    assert body["odoo_unreachable"] is False
    assert body["errors"] == {}


def test_daily_groups_events_by_date(client, monkeypatch):
    c, _, _ = client

    day1 = Date(2026, 6, 1)
    day2 = Date(2026, 6, 2)
    tz = timezone.utc

    fake_events = [
        CalendarEvent(
            uid="evt-a",
            title="Meeting A",
            start=datetime(2026, 6, 1, 9, 0, tzinfo=tz),
            end=datetime(2026, 6, 1, 10, 0, tzinfo=tz),
            hours=1.0,
            date=day1,
        ),
        CalendarEvent(
            uid="evt-b",
            title="Meeting B",
            start=datetime(2026, 6, 1, 11, 0, tzinfo=tz),
            end=datetime(2026, 6, 1, 12, 0, tzinfo=tz),
            hours=1.0,
            date=day1,
        ),
        CalendarEvent(
            uid="evt-c",
            title="Meeting C",
            start=datetime(2026, 6, 2, 9, 0, tzinfo=tz),
            end=datetime(2026, 6, 2, 10, 0, tzinfo=tz),
            hours=1.0,
            date=day2,
        ),
    ]

    monkeypatch.setattr("app.main._load_events", lambda start, end, settings, user_email="": fake_events)
    resp = c.get("/api/timesheet/daily?start=2026-06-01&end=2026-06-02")
    assert resp.status_code == 200
    body = resp.json()
    assert "2026-06-01" in body
    assert "2026-06-02" in body
    assert len(body["2026-06-01"]) == 2


def test_already_logged_from_odoo_existing_entry(client, monkeypatch):
    c, fake_odoo, _ = client

    # A rule that matches the event title to contract 10.
    c.post("/api/rules", json={
        "name": "GreenVolt", "keywords": ["greenvolt"],
        "contract_id": 10, "contract_name": "[10] GreenVolt",
    })

    tz = timezone.utc
    ev = CalendarEvent(
        uid="evt-x", title="GreenVolt standup",
        start=datetime(2026, 6, 1, 9, 0, tzinfo=tz),
        end=datetime(2026, 6, 1, 9, 30, tzinfo=tz),
        hours=0.5, date=Date(2026, 6, 1),
    )
    monkeypatch.setattr("app.main._load_events", lambda start, end, settings, user_email="": [ev])
    fake_odoo.existing_entries.return_value = [{
        "contract_id": 10,
        "contract_name": "[10] GreenVolt",
        "start_time": "2026-06-01 09:00:00",
        "end_time": "2026-06-01 09:30:00",
        "work_description": "GreenVolt standup",
        "duration_h": 0.5,
    }]

    resp = c.get("/api/calendar/events?start=2026-06-01&end=2026-06-01")
    assert resp.status_code == 200
    assert resp.json()[0]["already_logged"] is True


def test_proposals_tolerate_odoo_failure(client, monkeypatch):
    c, fake_odoo, _ = client
    tz = timezone.utc
    ev = CalendarEvent(
        uid="evt-y", title="Anything",
        start=datetime(2026, 6, 1, 9, 0, tzinfo=tz),
        end=datetime(2026, 6, 1, 9, 30, tzinfo=tz),
        hours=0.5, date=Date(2026, 6, 1),
    )
    monkeypatch.setattr("app.main._load_events", lambda start, end, settings, user_email="": [ev])
    fake_odoo.existing_entries.side_effect = RuntimeError("session gone")

    resp = c.get("/api/calendar/events?start=2026-06-01&end=2026-06-01")
    assert resp.status_code == 200
    assert resp.json()[0]["already_logged"] is False


def test_colors_get_empty_initially(client):
    c, _, _ = client
    resp = c.get("/api/colors")
    assert resp.status_code == 200
    assert resp.json() == {}


def test_colors_put_and_get(client):
    c, _, _ = client
    resp = c.put("/api/colors/101", json={"color": "#3B82F6"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["101"] == "#3B82F6"

    resp2 = c.get("/api/colors")
    assert resp2.status_code == 200
    assert resp2.json()["101"] == "#3B82F6"


def test_colors_put_invalid_color_returns_422(client):
    c, _, _ = client
    resp = c.put("/api/colors/101", json={"color": "blue"})
    assert resp.status_code == 422


def test_colors_put_multiple_projects(client):
    c, _, _ = client
    c.put("/api/colors/101", json={"color": "#3B82F6"})
    resp = c.put("/api/colors/102", json={"color": "#D97706"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["101"] == "#3B82F6"
    assert body["102"] == "#D97706"


# ---------------------------------------------------------------------------
# Ignore-keyword tests
# ---------------------------------------------------------------------------

def test_ignore_get_empty_initially(client):
    c, _, _ = client
    resp = c.get("/api/ignore")
    assert resp.status_code == 200
    assert resp.json() == []


def test_ignore_put_normalizes_and_returns_keywords(client):
    c, _, _ = client
    resp = c.put("/api/ignore", json={"keywords": ["lunch", " OOO "]})
    assert resp.status_code == 200
    assert resp.json() == ["lunch", "OOO"]


def test_ignore_get_reflects_put(client):
    c, _, _ = client
    c.put("/api/ignore", json={"keywords": ["lunch", "OOO"]})
    resp = c.get("/api/ignore")
    assert resp.status_code == 200
    assert resp.json() == ["lunch", "OOO"]


def test_demo_ignore_filters_team_lunch_event(demo_client):
    c, _, _ = demo_client
    # Set "lunch" as an ignore keyword.
    put_resp = c.put("/api/ignore", json={"keywords": ["lunch"]})
    assert put_resp.status_code == 200

    resp = c.get("/api/calendar/events?start=2026-06-08&end=2026-06-12")
    assert resp.status_code == 200
    titles = [entry["event"]["title"] for entry in resp.json()]
    # "Team lunch" should be filtered out.
    assert not any("lunch" in t.lower() for t in titles)


# ---------------------------------------------------------------------------
# Overview endpoint tests
# ---------------------------------------------------------------------------

def test_overview_demo_returns_both_statuses(demo_client):
    """DEMO_MODE: /api/overview returns by_contract and blocks with both statuses."""
    c, _, _ = demo_client
    # Add a rule so demo calendar events match a contract and appear as to_log.
    c.post("/api/rules", json={
        "name": "GreenVolt", "keywords": ["greenvolt"],
        "contract_id": 9001, "contract_name": "[9001] Demo Client A",
    })
    resp = c.get("/api/overview?start=2026-06-08&end=2026-06-12")
    assert resp.status_code == 200
    body = resp.json()
    assert "by_contract" in body
    assert "blocks" in body

    statuses = {blk["status"] for blk in body["blocks"]}
    assert "logged" in statuses, "Expected at least one logged block in demo mode"
    assert "to_log" in statuses, "Expected at least one to_log block when rules match"

    # Verify by_contract structure
    assert len(body["by_contract"]) >= 1
    for bc in body["by_contract"]:
        assert "contract_id" in bc
        assert "contract_name" in bc
        assert "logged_hours" in bc
        assert "to_log_hours" in bc


def test_overview_demo_aggregation_consistent(demo_client):
    """DEMO_MODE: by_contract sums must equal the sum of matching blocks."""
    c, _, _ = demo_client
    resp = c.get("/api/overview?start=2026-06-08&end=2026-06-12")
    assert resp.status_code == 200
    body = resp.json()

    # Rebuild sums from blocks and compare to by_contract.
    from collections import defaultdict
    logged_sums: dict = defaultdict(float)
    to_log_sums: dict = defaultdict(float)
    for blk in body["blocks"]:
        cid = blk.get("contract_id")
        if cid is None:
            continue
        if blk["status"] == "logged":
            logged_sums[cid] += blk["hours"]
        else:
            to_log_sums[cid] += blk["hours"]

    for bc in body["by_contract"]:
        cid = bc["contract_id"]
        assert round(logged_sums.get(cid, 0.0), 2) == bc["logged_hours"]
        assert round(to_log_sums.get(cid, 0.0), 2) == bc["to_log_hours"]


def test_overview_non_demo_uses_odoo_entries(client, monkeypatch):
    """Non-demo mode: logged blocks come from odoo.existing_entries."""
    c, fake_odoo, _ = client

    # Add a rule so calendar events can be marked to_log.
    c.post("/api/rules", json={
        "name": "GreenVolt", "keywords": ["meeting"],
        "contract_id": 10, "contract_name": "[10] GreenVolt",
    })

    tz = timezone.utc
    ev = CalendarEvent(
        uid="evt-ov1", title="Meeting to log",
        start=datetime(2026, 6, 9, 10, 0, tzinfo=tz),
        end=datetime(2026, 6, 9, 11, 0, tzinfo=tz),
        hours=1.0, date=Date(2026, 6, 9),
    )
    monkeypatch.setattr("app.main._load_events",
                        lambda start, end, settings, user_email="": [ev])

    fake_odoo.existing_entries.return_value = [
        {
            "contract_id": 10,
            "contract_name": "[10] GreenVolt",
            "start_time": "2026-06-08 08:00:00",
            "end_time": "2026-06-08 09:30:00",
            "work_description": "Previous logged work",
            "duration_h": 1.5,
        },
    ]

    resp = c.get("/api/overview?start=2026-06-08&end=2026-06-12")
    assert resp.status_code == 200
    body = resp.json()

    statuses = [blk["status"] for blk in body["blocks"]]
    assert "logged" in statuses
    assert "to_log" in statuses

    # The logged block should reflect the Odoo entry.
    logged_blocks = [b for b in body["blocks"] if b["status"] == "logged"]
    assert any(b["hours"] == 1.5 for b in logged_blocks)

    # by_contract for contract 10 must sum correctly.
    bc10 = next(bc for bc in body["by_contract"] if bc["contract_id"] == 10)
    assert bc10["logged_hours"] == 1.5
    assert bc10["to_log_hours"] == 1.0


def test_overview_odoo_failure_still_returns_to_log(client, monkeypatch):
    """If Odoo raises, the overview endpoint still returns 200 with to_log blocks."""
    c, fake_odoo, _ = client

    c.post("/api/rules", json={
        "name": "GreenVolt", "keywords": ["meeting"],
        "contract_id": 10, "contract_name": "[10] GreenVolt",
    })

    tz = timezone.utc
    ev = CalendarEvent(
        uid="evt-ov2", title="Meeting to log",
        start=datetime(2026, 6, 9, 10, 0, tzinfo=tz),
        end=datetime(2026, 6, 9, 11, 0, tzinfo=tz),
        hours=1.0, date=Date(2026, 6, 9),
    )
    monkeypatch.setattr("app.main._load_events",
                        lambda start, end, settings, user_email="": [ev])
    fake_odoo.existing_entries.side_effect = RuntimeError("Odoo unreachable")

    resp = c.get("/api/overview?start=2026-06-08&end=2026-06-12")
    assert resp.status_code == 200
    body = resp.json()

    to_log_blocks = [b for b in body["blocks"] if b["status"] == "to_log"]
    assert len(to_log_blocks) >= 1
    # No logged blocks since Odoo failed.
    logged_blocks = [b for b in body["blocks"] if b["status"] == "logged"]
    assert logged_blocks == []


# ---------------------------------------------------------------------------
# OdooUnreachable surface tests
# ---------------------------------------------------------------------------

def test_test_connection_odoo_unreachable(client):
    """test-connection returns odoo_unreachable=True when OdooUnreachable is raised."""
    c, fake_odoo, _ = client
    fake_odoo.test_connection.side_effect = OdooUnreachable(
        "Could not reach Odoo — check your VPN connection."
    )
    resp = c.post("/api/settings/test-connection")
    assert resp.status_code == 200
    body = resp.json()
    assert body["odoo"] is False
    assert body["odoo_unreachable"] is True
    assert "VPN" in body["errors"]["odoo"] or "Odoo" in body["errors"]["odoo"]


def test_contracts_odoo_unreachable_returns_503(client):
    """GET /api/odoo/contracts returns 503 with VPN hint when Odoo is unreachable."""
    c, fake_odoo, _ = client
    fake_odoo.list_contracts.side_effect = OdooUnreachable(
        "Could not reach Odoo — check your VPN connection."
    )
    resp = c.get("/api/odoo/contracts")
    assert resp.status_code == 503
    assert "VPN" in resp.json()["detail"]


# ---------------------------------------------------------------------------
# Config endpoint tests
# ---------------------------------------------------------------------------

def test_config_get_returns_editable_keys(client):
    """GET /api/config returns all editable keys including DEMO_MODE as a bool."""
    c, _, _ = client
    resp = c.get("/api/config")
    assert resp.status_code == 200
    body = resp.json()
    assert isinstance(body["DEMO_MODE"], bool)
    assert body["DEMO_MODE"] is False
    assert "ODOO_SESSION_ID" in body
    assert "GOOGLE_CALENDAR_URL" in body
    assert "ODOO_URL" in body


def test_config_put_writes_env_file_and_returns_200(client, tmp_path, monkeypatch):
    """PUT /api/config writes to ENV_PATH and returns a valid config response."""
    import app.env_file as ef

    env_file_path = tmp_path / ".env"
    env_file_path.write_text("ODOO_SESSION_ID=oldtoken\nODOO_URL=https://old.example.com\n")
    monkeypatch.setattr(ef, "ENV_PATH", env_file_path)

    c, _, _ = client
    resp = c.put("/api/config", json={"ODOO_SESSION_ID": "newtoken", "DEMO_MODE": False})
    assert resp.status_code == 200
    body = resp.json()
    # DEMO_MODE must always be returned as a bool
    assert isinstance(body["DEMO_MODE"], bool)

    # Verify the tmp .env was updated correctly
    written = env_file_path.read_text()
    assert "ODOO_SESSION_ID=newtoken" in written
    assert "DEMO_MODE=false" in written
    # Existing unrelated line preserved
    assert "ODOO_URL=https://old.example.com" in written
