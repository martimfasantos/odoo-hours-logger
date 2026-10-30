from datetime import datetime, timezone
from typing import Optional
from zoneinfo import ZoneInfo

import httpx

from app.schemas import OdooRef


class OdooSessionExpired(RuntimeError):
    """Raised when Odoo rejects our credentials (expired session cookie or bad API key)."""


class OdooUnreachable(RuntimeError):
    """Raised when Odoo cannot be reached (e.g. VPN is off)."""


def to_odoo_utc(dt: datetime) -> str:
    """Convert a tz-aware datetime to Odoo's UTC string format."""
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def parse_odoo_utc(odoo_str: str, local_tz: str) -> datetime:
    """Parse an Odoo UTC string ("YYYY-MM-DD HH:MM:SS") and return a
    tz-aware datetime in the given local timezone."""
    dt_utc = datetime.strptime(odoo_str, "%Y-%m-%d %H:%M:%S").replace(
        tzinfo=timezone.utc
    )
    return dt_utc.astimezone(ZoneInfo(local_tz))


_EXPIRED_HINTS = ("session", "expired", "login")
_SESSION_EXPIRED_MSG = (
    "Odoo session expired — copy a fresh session_id from a logged-in Odoo "
    "browser tab and paste it into Settings → Odoo Session ID."
)
_API_KEY_REJECTED_MSG = (
    "Odoo rejected your API key — create a new one in Odoo and paste it "
    "into Settings → Odoo API key."
)


class OdooClient:
    """Odoo JSON-RPC client. Uses the external `/jsonrpc` API when both `login`
    and `api_key` are set, otherwise the browser session cookie."""

    def __init__(self, base_url: str, session_id: str, local_tz: str, db: str,
                 visitor_uuid: str = "", user_id: Optional[int] = None,
                 network_member_id: Optional[int] = None, http_client=None,
                 login: str = "", api_key: str = ""):
        self.base_url = base_url.rstrip("/")
        self.session_id = session_id
        self.local_tz = local_tz
        self.db = db
        self.visitor_uuid = visitor_uuid
        self.login = login
        self.api_key = api_key
        self.uses_api_key = bool(login and api_key)
        self._user_id_override = user_id
        self._network_member_id_override = network_member_id
        self._uid: Optional[int] = None
        self._network_member_id: Optional[int] = None
        self._user_email: Optional[str] = None
        if self.uses_api_key:
            self._auth_error_msg = _API_KEY_REJECTED_MSG
            # A bad key on execute_kw comes back as AccessDenied ("Access Denied").
            self._auth_hints = ("access denied",)
        else:
            self._auth_error_msg = _SESSION_EXPIRED_MSG
            self._auth_hints = _EXPIRED_HINTS

        cookies = {}
        if visitor_uuid:
            cookies["visitor_uuid"] = visitor_uuid
        headers = {
            "Referer": f"{self.base_url}/web",
            "Content-Type": "application/json",
        }
        if not self.uses_api_key:
            cookies["session_id"] = session_id
            headers["X-Openerp-Session-Id"] = session_id
        if http_client is None:
            # Short connect timeout so an unreachable Odoo (e.g. VPN off) fails
            # fast and surfaces the "check your VPN" prompt quickly; allow a
            # longer read timeout for normal (slower) responses.
            http_client = httpx.Client(headers=headers, cookies=cookies,
                                       timeout=httpx.Timeout(20.0, connect=6.0))
        else:
            # Allow injecting a pre-built client (e.g. tests) but still apply
            # headers/cookies when the client supports it.
            for attr, value in (("headers", headers), ("cookies", cookies)):
                target = getattr(http_client, attr, None)
                if target is not None:
                    try:
                        target.update(value)
                    except (AttributeError, TypeError):
                        pass
        self._http = http_client

    # -- low-level transport ------------------------------------------------

    def _call(self, path: str, params: dict) -> dict:
        envelope = {"jsonrpc": "2.0", "method": "call", "params": params}
        try:
            resp = self._http.post(f"{self.base_url}{path}", json=envelope)
        except httpx.RequestError as exc:
            raise OdooUnreachable(
                "Could not reach Odoo — check your VPN connection."
            ) from exc
        content_type = resp.headers.get("content-type", "")
        if "json" not in content_type.lower():
            # HTML login page → session is gone.
            raise OdooSessionExpired(self._auth_error_msg)
        data = resp.json()
        if data.get("error"):
            message = _error_message(data["error"])
            if any(hint in message.lower() for hint in self._auth_hints):
                raise OdooSessionExpired(self._auth_error_msg)
            raise RuntimeError(message)
        return data.get("result")

    def call_kw(self, model: str, method: str, args: list,
                kwargs: Optional[dict] = None):
        if self.uses_api_key:
            return self._call("/jsonrpc", {
                "service": "object", "method": "execute_kw",
                "args": [self.db, self.uid(), self.api_key, model, method,
                         args, kwargs or {}],
            })
        return self._call(
            f"/web/dataset/call_kw/{model}/{method}",
            {"model": model, "method": method, "args": args,
             "kwargs": kwargs or {}},
        )

    # -- identity -----------------------------------------------------------

    def session_info(self) -> dict:
        return self._call("/web/session/get_session_info", {})

    def uid(self) -> int:
        if self._user_id_override:
            return self._user_id_override
        if self._uid is None:
            if self.uses_api_key:
                uid = self._call("/jsonrpc", {
                    "service": "common", "method": "authenticate",
                    "args": [self.db, self.login, self.api_key, {}],
                })
            else:
                uid = (self.session_info() or {}).get("uid")
            if not uid:
                raise OdooSessionExpired(self._auth_error_msg)
            self._uid = uid
        return self._uid

    def user_email(self) -> str:
        if self.uses_api_key:
            return self.login
        if self._user_email is None:
            info = self.session_info() or {}
            self._user_email = info.get("username") or ""
        return self._user_email

    def network_member_id(self) -> int:
        if self._network_member_id_override:
            return self._network_member_id_override
        if self._network_member_id is None:
            rows = self.call_kw(
                "network_member", "search_read",
                [[["user", "=", self.uid()]]],
                {"fields": ["id"], "limit": 1},
            )
            if not rows:
                raise RuntimeError(
                    "No network_member linked to this user")
            self._network_member_id = rows[0]["id"]
        return self._network_member_id

    # -- reads --------------------------------------------------------------

    def list_contracts(self, query: str = "", limit: int = 500) -> list[OdooRef]:
        domain: list = [["network_member", "=", self.network_member_id()]]
        if query:
            domain.append(["display_name", "ilike", query])
        rows = self.call_kw(
            "contract", "search_read",
            [domain],
            {"fields": ["display_name"], "order": "display_name",
             "limit": limit},
        )
        return [OdooRef(id=row["id"], name=row.get("display_name") or "")
                for row in rows]

    def existing_entries(self, start: datetime, end: datetime) -> list[dict]:
        start_utc = to_odoo_utc(start)
        end_utc = to_odoo_utc(end)
        rows = self.call_kw(
            "timesheet_entry", "search_read",
            [[["network_member_user_id", "=", self.uid()],
              ["start_time", "<=", end_utc],
              ["end_time", ">=", start_utc]]],
            {"fields": ["contract", "start_time", "end_time",
                        "work_description", "duration_h",
                        "internal_cost", "external_cost"],
             "context": self._context()},
        )
        normalized = []
        for row in rows or []:
            contract = row.get("contract")
            if isinstance(contract, (list, tuple)) and contract:
                contract_id = contract[0]
                contract_name = contract[1] if len(contract) > 1 else ""
            else:
                contract_id = None
                contract_name = ""
            normalized.append({
                "contract_id": contract_id,
                "contract_name": contract_name or "",
                "start_time": row.get("start_time"),
                "end_time": row.get("end_time"),
                "work_description": row.get("work_description") or "",
                "duration_h": float(row.get("duration_h") or 0.0),
                "internal_cost": float(row.get("internal_cost") or 0.0),
                "external_cost": float(row.get("external_cost") or 0.0),
            })
        return normalized

    def contract_rates(self, contract_ids: list[int]) -> dict[int, dict]:
        """Fetch per-contract rate attributes, keyed by contract id."""
        if not contract_ids:
            return {}
        rows = self.call_kw(
            "contract", "read",
            [list(contract_ids)],
            {"fields": ["internal_rate", "external_rate", "margin"]},
        )
        out: dict[int, dict] = {}
        for row in rows or []:
            out[row["id"]] = {
                "internal_rate": float(row.get("internal_rate") or 0.0),
                "external_rate": float(row.get("external_rate") or 0.0),
                "margin": float(row.get("margin") or 0.0),
            }
        return out

    # -- writes -------------------------------------------------------------

    def create_timesheet(self, contract_id: int, description: str,
                         start: datetime, end: datetime) -> int:
        start_utc = to_odoo_utc(start)
        end_utc = to_odoo_utc(end)
        uid = self.uid()
        member_id = self.network_member_id()
        vals = {
            "network_member": member_id,
            "contract": contract_id,
            "work_description": description,
            "start_time": start_utc,
            "end_time": end_utc,
        }
        context = {
            "lang": "en_US",
            "tz": self.local_tz,
            "uid": uid,
            "allowed_company_ids": [1],
            "default_start_time": start_utc,
            "default_end_time": end_utc,
        }
        return self.call_kw("timesheet_entry", "create", [vals],
                            {"context": context})

    # -- misc ---------------------------------------------------------------

    def test_connection(self) -> bool:
        return bool(self.uid())

    def _context(self) -> dict:
        return {
            "lang": "en_US",
            "tz": self.local_tz,
            "uid": self.uid(),
            "allowed_company_ids": [1],
        }


def _error_message(error) -> str:
    if isinstance(error, dict):
        data = error.get("data") or {}
        return (data.get("message") or error.get("message")
                or error.get("data", {}).get("debug") or str(error))
    return str(error)
