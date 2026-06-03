# backend/tests/test_odoo_client.py
from unittest.mock import MagicMock

from app.odoo_client import OdooClient


def _client():
    common = MagicMock()
    common.authenticate.return_value = 7  # uid
    models = MagicMock()
    return OdooClient(url="https://odoo.example.com", db="db",
                      username="me", api_key="key",
                      common=common, models=models)


def test_authenticate_caches_uid():
    c = _client()
    assert c.uid() == 7
    assert c.uid() == 7
    c.common.authenticate.assert_called_once()


def test_list_projects_returns_refs():
    c = _client()
    c.models.execute_kw.return_value = [{"id": 10, "name": "GreenVolt"}]
    projects = c.list_projects()
    assert projects[0].id == 10
    assert projects[0].name == "GreenVolt"
    args = c.models.execute_kw.call_args[0]
    assert args[3] == "project.project"
    assert args[4] == "search_read"


def test_list_tasks_filters_by_project():
    c = _client()
    c.models.execute_kw.return_value = [{"id": 55, "name": "Meetings"}]
    tasks = c.list_tasks(10)
    domain = c.models.execute_kw.call_args[0][5][0]
    assert domain == [["project_id", "=", 10]]
    assert tasks[0].name == "Meetings"


def test_create_timesheet_returns_line_id():
    c = _client()
    c.models.execute_kw.side_effect = [
        [{"id": 99}],  # employee lookup
        500,            # create
    ]
    line_id = c.create_timesheet(date="2026-06-01", name="GreenVolt standup",
                                 hours=0.5, project_id=10, task_id=55)
    assert line_id == 500
    create_call = c.models.execute_kw.call_args_list[-1][0]
    assert create_call[3] == "account.analytic.line"
    assert create_call[4] == "create"
    vals = create_call[5][0]
    assert vals["unit_amount"] == 0.5
    assert vals["project_id"] == 10
    assert vals["employee_id"] == 99
