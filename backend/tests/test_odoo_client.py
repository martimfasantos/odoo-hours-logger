# backend/tests/test_odoo_client.py
from datetime import datetime, timezone

import httpx
import pytest

from app.odoo_client import OdooAuthError, OdooClient, OdooUnreachable, parse_odoo_utc, to_odoo_utc

UID = 1098
API_KEY_REJECTED = (
    "Odoo rejected your API key — create a new one in Odoo and paste it "
    "into Settings → Odoo API key."
)


class FakeResponse:
    def __init__(self, payload, content_type="application/json"):
        self._payload = payload
        self.headers = {"content-type": content_type}

    def json(self):
        return self._payload


class FakeHttp:
    """Stub httpx.Client whose .post returns canned JSON-RPC responses.

    `responses` is a list consumed in order; each item is a FakeResponse.
    Captured calls are recorded in `self.calls` as (url, json_body) tuples.
    """

    def __init__(self, responses):
        self._responses = list(responses)
        self.calls = []

    def post(self, url, json=None):
        self.calls.append((url, json))
        if self._responses:
            return self._responses.pop(0)
        return FakeResponse({"result": []})


def _client(responses, login="me@example.com", api_key="key-abc", **kwargs):
    http = FakeHttp(responses)
    client = OdooClient(
        base_url="https://odoo.example.com",
        local_tz="Europe/Lisbon",
        db="odoo",
        login=login,
        api_key=api_key,
        http_client=http,
        **kwargs,
    )
    return client, http


def _ok(result):
    return FakeResponse({"jsonrpc": "2.0", "result": result})


def _execute_kw(call):
    """Return (model, method, args, kwargs) from a recorded execute_kw call."""
    url, body = call
    assert url == "https://odoo.example.com/jsonrpc"
    params = body["params"]
    assert (params["service"], params["method"]) == ("object", "execute_kw")
    db, uid, key, model, method, args, kwargs = params["args"]
    assert (db, uid, key) == ("odoo", UID, "key-abc")
    return model, method, args, kwargs


def test_to_odoo_utc_formats_in_utc():
    dt = datetime(2026, 6, 1, 10, 0, tzinfo=timezone.utc)
    assert to_odoo_utc(dt) == "2026-06-01 10:00:00"


def test_parse_odoo_utc_converts_to_local_tz():
    from zoneinfo import ZoneInfo
    result = parse_odoo_utc("2026-06-01 09:00:00", "Europe/Lisbon")
    assert result.tzinfo is not None
    # Europe/Lisbon in summer is UTC+1
    assert result.astimezone(timezone.utc) == datetime(2026, 6, 1, 9, 0, tzinfo=timezone.utc)
    # Should be in Europe/Lisbon tz, so hour is 10 (UTC+1 in June)
    assert result.hour == 10
    assert result.tzinfo == ZoneInfo("Europe/Lisbon")


def test_uid_authenticates_via_jsonrpc_and_caches():
    c, http = _client([_ok(UID)])
    assert c.uid() == UID
    assert c.uid() == UID
    assert http.calls == [("https://odoo.example.com/jsonrpc", {
        "jsonrpc": "2.0", "method": "call",
        "params": {"service": "common", "method": "authenticate",
                   "args": ["odoo", "me@example.com", "key-abc", {}]},
    })]


def test_call_kw_uses_execute_kw():
    c, http = _client([_ok(UID), _ok([{"id": 1}])])
    assert c.call_kw("contract", "search_read", [[]], {"limit": 5}) == [{"id": 1}]
    assert http.calls[1] == ("https://odoo.example.com/jsonrpc", {
        "jsonrpc": "2.0", "method": "call",
        "params": {"service": "object", "method": "execute_kw",
                   "args": ["odoo", UID, "key-abc", "contract", "search_read",
                            [[]], {"limit": 5}]},
    })


@pytest.mark.parametrize("login,api_key", [
    ("", ""), ("me@example.com", ""), ("", "key-abc"),
])
def test_missing_credentials_raise_before_any_network_call(login, api_key):
    c, http = _client([], login=login, api_key=api_key)
    with pytest.raises(OdooAuthError) as excinfo:
        c.call_kw("contract", "search_read", [[]])
    assert str(excinfo.value) == "Add your Odoo login and API key in Settings."
    assert http.calls == []


def test_rejected_key_when_authenticate_returns_false():
    c, _ = _client([_ok(False)])
    with pytest.raises(OdooAuthError) as excinfo:
        c.uid()
    assert str(excinfo.value) == API_KEY_REJECTED


def test_access_denied_raises_api_key_error():
    c, _ = _client([_ok(UID), FakeResponse({"error": {
        "message": "Odoo Server Error",
        "data": {"name": "odoo.exceptions.AccessDenied", "message": "Access Denied"},
    }})])
    with pytest.raises(OdooAuthError) as excinfo:
        c.call_kw("contract", "search_read", [[]])
    assert str(excinfo.value) == API_KEY_REJECTED


def test_generic_error_raises_runtime_error():
    c, _ = _client([_ok(UID), FakeResponse(
        {"error": {"data": {"message": "Boom"}}})])
    with pytest.raises(RuntimeError) as excinfo:
        c.call_kw("contract", "search_read", [[]])
    assert str(excinfo.value) == "Boom"
    assert not isinstance(excinfo.value, OdooAuthError)


def test_non_json_response_raises_runtime_error():
    c, _ = _client([FakeResponse("<html></html>", content_type="text/html")])
    with pytest.raises(RuntimeError) as excinfo:
        c.uid()
    assert str(excinfo.value) == (
        "Odoo did not return JSON — check the Odoo URL in Settings.")
    assert not isinstance(excinfo.value, OdooAuthError)


def test_list_contracts_parses_rows():
    # Use network_member_id override to avoid an extra round-trip.
    c, http = _client([_ok(UID), _ok([
        {"id": 10, "display_name": "[10] Client A"},
        {"id": 20, "display_name": "[20] Client B"},
    ])], network_member_id=1095)
    contracts = c.list_contracts()
    assert [(r.id, r.name) for r in contracts] == [
        (10, "[10] Client A"), (20, "[20] Client B")]
    assert _execute_kw(http.calls[1]) == (
        "contract", "search_read",
        [[["network_member", "=", 1095]]],
        {"fields": ["display_name"], "order": "display_name", "limit": 500},
    )


def test_list_contracts_applies_ilike_query():
    c, http = _client([_ok(UID), _ok([])], network_member_id=1095)
    c.list_contracts(query="green")
    _, _, args, _ = _execute_kw(http.calls[1])
    assert args == [[["network_member", "=", 1095],
                     ["display_name", "ilike", "green"]]]


def test_list_contracts_coerces_falsy_name():
    c, _ = _client([_ok(UID), _ok([{"id": 5, "display_name": False}])],
                   network_member_id=1095)
    contracts = c.list_contracts()
    assert contracts[0].id == 5
    assert contracts[0].name == ""


def test_create_timesheet_payload_and_utc():
    c, http = _client([_ok(UID), _ok(777)], network_member_id=1095)
    tz = timezone.utc
    start = datetime(2026, 6, 1, 9, 0, tzinfo=tz)
    end = datetime(2026, 6, 1, 9, 30, tzinfo=tz)
    new_id = c.create_timesheet(contract_id=42, description="Standup",
                                start=start, end=end)
    assert new_id == 777
    assert _execute_kw(http.calls[1]) == (
        "timesheet_entry", "create",
        [{"network_member": 1095, "contract": 42,
          "work_description": "Standup",
          "start_time": "2026-06-01 09:00:00",
          "end_time": "2026-06-01 09:30:00"}],
        {"context": {"lang": "en_US", "tz": "Europe/Lisbon", "uid": UID,
                     "allowed_company_ids": [1],
                     "default_start_time": "2026-06-01 09:00:00",
                     "default_end_time": "2026-06-01 09:30:00"}},
    )


def test_existing_entries_normalization():
    c, _ = _client([_ok(UID), _ok([
        {"contract": [42, "[42] Client A"],
         "start_time": "2026-06-01 09:00:00",
         "end_time": "2026-06-01 09:30:00",
         "work_description": "Standup",
         "duration_h": 0.5},
    ])])
    start = datetime(2026, 6, 1, 0, 0, tzinfo=timezone.utc)
    end = datetime(2026, 6, 1, 23, 59, tzinfo=timezone.utc)
    rows = c.existing_entries(start, end)
    assert rows == [{
        "contract_id": 42,
        "contract_name": "[42] Client A",
        "start_time": "2026-06-01 09:00:00",
        "end_time": "2026-06-01 09:30:00",
        "work_description": "Standup",
        "duration_h": 0.5,
        "internal_cost": 0.0,
        "external_cost": 0.0,
    }]


def test_existing_entries_falsy_contract():
    """When contract is False/None, contract_id is None and contract_name is ''."""
    c, _ = _client([_ok(UID), _ok([
        {"contract": False,
         "start_time": "2026-06-01 09:00:00",
         "end_time": "2026-06-01 09:30:00",
         "work_description": "",
         "duration_h": 1.0},
    ])])
    start = datetime(2026, 6, 1, 0, 0, tzinfo=timezone.utc)
    end = datetime(2026, 6, 1, 23, 59, tzinfo=timezone.utc)
    rows = c.existing_entries(start, end)
    assert rows[0]["contract_id"] is None
    assert rows[0]["contract_name"] == ""
    assert rows[0]["duration_h"] == 1.0


def test_network_member_resolution_and_caching():
    c, http = _client([_ok(UID), _ok([{"id": 1095}])])
    assert c.network_member_id() == 1095
    assert c.network_member_id() == 1095  # cached
    # 2 calls total: one to authenticate, one for the member lookup.
    assert len(http.calls) == 2
    assert _execute_kw(http.calls[1]) == (
        "network_member", "search_read", [[["user", "=", UID]]],
        {"fields": ["id"], "limit": 1},
    )


def test_network_member_override_skips_lookup():
    c, http = _client([], network_member_id=1095)
    assert c.network_member_id() == 1095
    assert http.calls == []


def test_network_member_missing_raises():
    c, _ = _client([_ok(UID), _ok([])])
    with pytest.raises(RuntimeError) as excinfo:
        c.network_member_id()
    assert str(excinfo.value) == "No network_member linked to this user"


def test_test_connection_true():
    c, _ = _client([_ok(UID)])
    assert c.test_connection() is True


def test_connect_error_raises_odoo_unreachable():
    """httpx.ConnectError (and any RequestError) must surface as OdooUnreachable."""

    class ErrorHttp:
        def post(self, url, json=None):
            raise httpx.ConnectError("boom")

    client = OdooClient(
        base_url="https://odoo.example.com",
        local_tz="Europe/Lisbon",
        db="odoo",
        login="me@example.com",
        api_key="key-abc",
        http_client=ErrorHttp(),
    )
    with pytest.raises(OdooUnreachable):
        client.uid()

    with pytest.raises(OdooUnreachable):
        client.call_kw("contract", "search_read", [[]])
