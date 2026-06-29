"""Desktop launcher: run the FastAPI app behind a native pywebview window.

This is the PyInstaller entry point. It boots uvicorn on a free loopback port
in a background thread, waits for the server to report healthy, then opens a
native window pointed at it. Closing the window exits the process.
"""
import socket
import threading
import time

import httpx
import uvicorn

from app.main import app


def find_free_port() -> int:
    """Return an OS-assigned free TCP port on the loopback interface."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def run_server(port: int) -> uvicorn.Server:
    """Start uvicorn on 127.0.0.1:<port> in a daemon thread; return the server."""
    config = uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning")
    server = uvicorn.Server(config)
    threading.Thread(target=server.run, daemon=True).start()
    return server


def wait_for_health(port: int, timeout: float = 30.0, interval: float = 0.2) -> bool:
    """Poll /api/health until it reports ok, or until *timeout* seconds pass."""
    url = f"http://127.0.0.1:{port}/api/health"
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            resp = httpx.get(url, timeout=1.0)
            if resp.status_code == 200 and resp.json().get("status") == "ok":
                return True
        except Exception:
            pass
        time.sleep(interval)
    return False


def main() -> None:
    import webview  # lazy import so the module is importable headless/in CI

    port = find_free_port()
    server = run_server(port)
    if not wait_for_health(port):
        raise RuntimeError("Backend failed to start within the timeout")

    webview.create_window(
        "Odoo Hours Logger",
        f"http://127.0.0.1:{port}",
        width=1280,
        height=860,
        min_size=(960, 600),
    )
    webview.start()  # blocks until all windows are closed
    server.should_exit = True  # window closed → stop uvicorn


if __name__ == "__main__":
    main()
