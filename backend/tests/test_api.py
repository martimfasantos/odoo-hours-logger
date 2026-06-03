from datetime import datetime
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from app import deps
from app.main import app
from app.ledger import Ledger
from app.odoo_client import OdooClient
from app.rules import RulesStore
from app.schemas import OdooRef


@pytest.fixture
def client(tmp_path, monkeypatch):
    rs = RulesStore(tmp_path / "rules.json")
    lg = Ledger(tmp_path / "ledger.json")

    fake_odoo = MagicMock(spec=OdooClient)
    fake_odoo.list_projects.return_value = [OdooRef(id=10, name="GreenVolt")]
    fake_odoo.list_tasks.return_value = [OdooRef(id=55, name="Meetings")]
    fake_odoo.create_timesheet.return_value = 500
    fake_odoo.test_connection.return_value = True

    app.dependency_overrides[deps.rules_store] = lambda: rs
    app.dependency_overrides[deps.ledger] = lambda: lg
    app.dependency_overrides[deps.odoo] = lambda: fake_odoo

    yield TestClient(app), fake_odoo, lg
    app.dependency_overrides.clear()


def test_health(client):
    c, _, _ = client
    assert c.get("/api/health").json() == {"status": "ok"}


def test_projects_endpoint(client):
    c, _, _ = client
    resp = c.get("/api/odoo/projects")
    assert resp.status_code == 200
    assert resp.json()[0]["name"] == "GreenVolt"


def test_rules_crud_flow(client):
    c, _, _ = client
    payload = {"name": "GreenVolt", "keywords": ["greenvolt"],
               "project_id": 10, "project_name": "GreenVolt",
               "task_id": 55, "task_name": "Meetings", "priority": 1}
    created = c.post("/api/rules", json=payload).json()
    assert created["id"] == 1
    assert len(c.get("/api/rules").json()) == 1
    c.delete(f"/api/rules/{created['id']}")
    assert c.get("/api/rules").json() == []


def test_push_creates_line_and_records_ledger(client):
    c, fake_odoo, lg = client
    entry = {
        "uid": "evt-1",
        "start": "2026-06-01T09:00:00",
        "date": "2026-06-01",
        "hours": 0.5,
        "description": "GreenVolt standup",
        "project_id": 10,
        "task_id": 55,
    }
    resp = c.post("/api/timesheet/push", json={"entries": [entry]})
    body = resp.json()
    assert body["results"][0]["success"] is True
    assert body["results"][0]["odoo_line_id"] == 500
    fake_odoo.create_timesheet.assert_called_once()
    assert lg.is_logged("evt-1", datetime(2026, 6, 1, 9, 0)) is True


def test_push_skips_already_logged(client):
    c, fake_odoo, lg = client
    lg.record("evt-1", datetime(2026, 6, 1, 9, 0), odoo_line_id=1,
              project_id=10, task_id=55, hours=0.5, pushed_at="x")
    entry = {
        "uid": "evt-1", "start": "2026-06-01T09:00:00", "date": "2026-06-01",
        "hours": 0.5, "description": "x", "project_id": 10, "task_id": 55,
    }
    resp = c.post("/api/timesheet/push", json={"entries": [entry]})
    assert resp.json()["results"][0]["success"] is False
    assert "already logged" in resp.json()["results"][0]["error"].lower()
    fake_odoo.create_timesheet.assert_not_called()
