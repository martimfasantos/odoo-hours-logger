import socket

from app import desktop


def test_find_free_port_is_bindable():
    port = desktop.find_free_port()
    assert isinstance(port, int)
    assert 1024 <= port <= 65535
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.bind(("127.0.0.1", port))  # must be free/bindable
    s.close()


def test_wait_for_health_returns_true_when_ok(monkeypatch):
    class _Resp:
        status_code = 200

        @staticmethod
        def json():
            return {"status": "ok"}

    monkeypatch.setattr(desktop.httpx, "get", lambda url, timeout: _Resp())
    assert desktop.wait_for_health(12345, timeout=1.0, interval=0.01) is True


def test_wait_for_health_returns_false_on_timeout(monkeypatch):
    def _down(url, timeout):
        raise RuntimeError("connection refused")

    monkeypatch.setattr(desktop.httpx, "get", _down)
    assert desktop.wait_for_health(12345, timeout=0.2, interval=0.05) is False
