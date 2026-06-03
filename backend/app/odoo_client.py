import xmlrpc.client
from typing import Optional

from app.schemas import OdooRef


class OdooClient:
    def __init__(self, url: str, db: str, username: str, api_key: str,
                 common=None, models=None):
        self.url = url.rstrip("/")
        self.db = db
        self.username = username
        self.api_key = api_key
        self._common = common
        self._models = models
        self._uid: Optional[int] = None
        self._employee_id: Optional[int] = None

    @property
    def common(self):
        if self._common is None:
            self._common = xmlrpc.client.ServerProxy(f"{self.url}/xmlrpc/2/common")
        return self._common

    @property
    def models(self):
        if self._models is None:
            self._models = xmlrpc.client.ServerProxy(f"{self.url}/xmlrpc/2/object")
        return self._models

    def uid(self) -> int:
        if self._uid is None:
            self._uid = self.common.authenticate(self.db, self.username,
                                                 self.api_key, {})
            if not self._uid:
                raise RuntimeError("Odoo authentication failed")
        return self._uid

    def _exec(self, model: str, method: str, *args, **kwargs):
        return self.models.execute_kw(self.db, self.uid(), self.api_key,
                                      model, method, list(args), kwargs)

    def list_projects(self) -> list[OdooRef]:
        rows = self._exec("project.project", "search_read", [],
                          fields=["id", "name"], order="name")
        return [OdooRef(**row) for row in rows]

    def list_tasks(self, project_id: int) -> list[OdooRef]:
        rows = self._exec("project.task", "search_read",
                          [["project_id", "=", project_id]],
                          fields=["id", "name"], order="name")
        return [OdooRef(**row) for row in rows]

    def employee_id(self) -> int:
        if self._employee_id is None:
            rows = self._exec("hr.employee", "search_read",
                              [["user_id", "=", self.uid()]],
                              fields=["id"], limit=1)
            if not rows:
                raise RuntimeError("No hr.employee linked to this user")
            self._employee_id = rows[0]["id"]
        return self._employee_id

    def create_timesheet(self, date: str, name: str, hours: float,
                         project_id: int, task_id: Optional[int] = None) -> int:
        vals = {
            "date": date,
            "name": name,
            "unit_amount": hours,
            "project_id": project_id,
            "employee_id": self.employee_id(),
        }
        if task_id is not None:
            vals["task_id"] = task_id
        return self._exec("account.analytic.line", "create", vals)

    def test_connection(self) -> bool:
        return bool(self.uid())
