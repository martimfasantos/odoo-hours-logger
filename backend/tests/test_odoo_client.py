# backend/tests/test_odoo_client.py
from datetime import datetime, timezone

import httpx
import pytest

from app.odoo_client import OdooClient, OdooSessionExpired, OdooUnreachable, parse_odoo_utc, to_odoo_utc


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


def _client(responses, **kwargs):
    http = FakeHttp(responses)
    client = OdooClient(
        base_url="https://odoo.example.com",
        session_id="sess-123",
        local_tz="Europe/Lisbon",
        db="odoo",
        visitor_uuid="vis-1",
        http_client=http,
        **kwargs,
    )
    return client, http


def _ok(result):
    return FakeResponse({"jsonrpc": "2.0", "result": result})


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


def test_call_kw_envelope_and_shape():
    c, http = _client([_ok([{"id": 1}])])
    result = c.call_kw("contract", "search_read", [[]], {"limit": 5})
    assert result == [{"id": 1}]
    url, body = http.calls[0]
    assert url == "https://odoo.example.com/web/dataset/call_kw/contract/search_read"
    assert body["jsonrpc"] == "2.0"
    assert body["method"] == "call"
    params = body["params"]
    assert params["model"] == "contract"
    assert params["method"] == "search_read"
    assert params["args"] == [[]]
    assert params["kwargs"] == {"limit": 5}


def test_list_contracts_parses_rows():
    # Use network_member_id override to avoid an extra round-trip.
    c, http = _client([_ok([
        {"id": 10, "display_name": "[10] Client A"},
        {"id": 20, "display_name": "[20] Client B"},
    ])], network_member_id=1095)
    contracts = c.list_contracts()
    assert [(r.id, r.name) for r in contracts] == [
        (10, "[10] Client A"), (20, "[20] Client B")]
    _, body = http.calls[0]
    params = body["params"]
    assert params["model"] == "contract"
    # Domain must include the network_member filter.
    domain = params["args"][0]
    assert ["network_member", "=", 1095] in domain
    assert params["kwargs"]["fields"] == ["display_name"]
    assert params["kwargs"]["order"] == "display_name"


def test_list_contracts_applies_ilike_query():
    c, http = _client([_ok([])], network_member_id=1095)
    c.list_contracts(query="green")
    _, body = http.calls[0]
    domain = body["params"]["args"][0]
    assert ["network_member", "=", 1095] in domain
    assert ["display_name", "ilike", "green"] in domain


def test_list_contracts_no_query_excludes_ilike():
    c, http = _client([_ok([])], network_member_id=1095)
    c.list_contracts()
    _, body = http.calls[0]
    domain = body["params"]["args"][0]
    assert ["network_member", "=", 1095] in domain
    # When there is no query, there must be no display_name ilike filter.
    assert not any(
        (isinstance(clause, list) and len(clause) >= 2
         and clause[0] == "display_name")
        for clause in domain
    )


def test_list_contracts_coerces_falsy_name():
    c, _ = _client([_ok([{"id": 5, "display_name": False}])],
                   network_member_id=1095)
    contracts = c.list_contracts()
    assert contracts[0].id == 5
    assert contracts[0].name == ""


def test_create_timesheet_payload_and_utc():
    # uid override and member override avoid extra round-trips.
    c, http = _client([_ok(777)], user_id=1098, network_member_id=1095)
    tz = timezone.utc
    start = datetime(2026, 6, 1, 9, 0, tzinfo=tz)
    end = datetime(2026, 6, 1, 9, 30, tzinfo=tz)
    new_id = c.create_timesheet(contract_id=42, description="Standup",
                                start=start, end=end)
    assert new_id == 777
    _, body = http.calls[0]
    params = body["params"]
    assert params["model"] == "timesheet_entry"
    assert params["method"] == "create"
    vals = params["args"][0]
    assert vals["network_member"] == 1095
    assert vals["contract"] == 42
    assert vals["work_description"] == "Standup"
    assert vals["start_time"] == "2026-06-01 09:00:00"
    assert vals["end_time"] == "2026-06-01 09:30:00"
    ctx = params["kwargs"]["context"]
    assert ctx["uid"] == 1098
    assert ctx["tz"] == "Europe/Lisbon"
    assert ctx["default_start_time"] == "2026-06-01 09:00:00"
    assert ctx["default_end_time"] == "2026-06-01 09:30:00"


def test_existing_entries_normalization():
    c, _ = _client([_ok([
        {"contract": [42, "[42] Client A"],
         "start_time": "2026-06-01 09:00:00",
         "end_time": "2026-06-01 09:30:00",
         "work_description": "Standup",
         "duration_h": 0.5},
    ])], user_id=1098)
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
    c, _ = _client([_ok([
        {"contract": False,
         "start_time": "2026-06-01 09:00:00",
         "end_time": "2026-06-01 09:30:00",
         "work_description": "",
         "duration_h": 1.0},
    ])], user_id=1098)
    start = datetime(2026, 6, 1, 0, 0, tzinfo=timezone.utc)
    end = datetime(2026, 6, 1, 23, 59, tzinfo=timezone.utc)
    rows = c.existing_entries(start, end)
    assert rows[0]["contract_id"] is None
    assert rows[0]["contract_name"] == ""
    assert rows[0]["duration_h"] == 1.0


def test_uid_resolution_and_caching():
    c, http = _client([
        _ok({"uid": 1098, "username": "me"}),
    ])
    assert c.uid() == 1098
    assert c.uid() == 1098  # cached — no second call
    assert len(http.calls) == 1
    assert http.calls[0][0].endswith("/web/session/get_session_info")


def test_uid_override_skips_session_call():
    c, http = _client([], user_id=1098)
    assert c.uid() == 1098
    assert http.calls == []


def test_network_member_resolution_and_caching():
    c, http = _client([
        _ok({"uid": 1098}),          # session_info for uid
        _ok([{"id": 1095}]),         # network_member search_read
    ])
    assert c.network_member_id() == 1095
    assert c.network_member_id() == 1095  # cached
    # 2 calls total: one for uid, one for member lookup.
    assert len(http.calls) == 2
    member_call = http.calls[1][1]["params"]
    assert member_call["model"] == "network_member"
    assert member_call["args"] == [[["user", "=", 1098]]]


def test_network_member_missing_raises():
    c, _ = _client([_ok([])], user_id=1098)
    with pytest.raises(RuntimeError):
        c.network_member_id()


def test_session_expired_on_html_response():
    c, _ = _client([FakeResponse("<html>login</html>", content_type="text/html")])
    with pytest.raises(OdooSessionExpired) as excinfo:
        c.session_info()
    # The UI detects the push-path error by this phrase; keep them in sync.
    assert "session expired" in str(excinfo.value).lower()


def test_session_expired_on_null_uid():
    c, _ = _client([_ok({"uid": False})])
    with pytest.raises(OdooSessionExpired):
        c.uid()


def test_error_mentioning_session_raises_expired():
    c, _ = _client([FakeResponse(
        {"error": {"data": {"message": "Session expired"}}})])
    with pytest.raises(OdooSessionExpired):
        c.session_info()


def test_generic_error_raises_runtime_error():
    c, _ = _client([FakeResponse(
        {"error": {"data": {"message": "Boom"}}})])
    with pytest.raises(RuntimeError) as excinfo:
        c.session_info()
    assert "Boom" in str(excinfo.value)
    assert not isinstance(excinfo.value, OdooSessionExpired)


def test_user_email_resolution_and_caching():
    c, http = _client([
        _ok({"uid": 1098, "username": "martim.santos@daredata.engineering"}),
    ])
    email = c.user_email()
    assert email == "martim.santos@daredata.engineering"
    # Second call must use the cached value — no additional network call.
    assert c.user_email() == email
    assert len(http.calls) == 1
    assert http.calls[0][0].endswith("/web/session/get_session_info")


def test_user_email_missing_username_returns_empty():
    c, _ = _client([_ok({"uid": 1098})])
    assert c.user_email() == ""


def test_user_email_propagates_session_expired():
    c, _ = _client([FakeResponse("<html>login</html>", content_type="text/html")])
    with pytest.raises(OdooSessionExpired):
        c.user_email()


def test_test_connection_true():
    c, _ = _client([], user_id=1098)
    assert c.test_connection() is True


def test_connect_error_raises_odoo_unreachable():
    """httpx.ConnectError (and any RequestError) must surface as OdooUnreachable."""

    class ErrorHttp:
        headers = {}
        cookies = {}

        def post(self, url, json=None):
            raise httpx.ConnectError("boom")

    client = OdooClient(
        base_url="https://odoo.example.com",
        session_id="sess-123",
        local_tz="Europe/Lisbon",
        db="odoo",
        http_client=ErrorHttp(),
    )
    with pytest.raises(OdooUnreachable):
        client.session_info()

    with pytest.raises(OdooUnreachable):
        client.call_kw("contract", "search_read", [[]])
