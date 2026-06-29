from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.spa import SPAStaticFiles


def _make_app(dist):
    app = FastAPI()

    @app.get("/api/ping")
    def ping():
        return {"ok": True}

    app.mount("/", SPAStaticFiles(directory=str(dist), html=True), name="spa")
    return app


def test_serves_index_at_root(tmp_path):
    (tmp_path / "index.html").write_text("<!doctype html><title>SPA</title>")
    client = TestClient(_make_app(tmp_path))
    r = client.get("/")
    assert r.status_code == 200
    assert "SPA" in r.text


def test_unknown_client_route_falls_back_to_index(tmp_path):
    (tmp_path / "index.html").write_text("<!doctype html><title>SPA</title>")
    client = TestClient(_make_app(tmp_path))
    r = client.get("/logged")
    assert r.status_code == 200
    assert "SPA" in r.text


def test_real_asset_is_served(tmp_path):
    (tmp_path / "index.html").write_text("INDEX")
    assets = tmp_path / "assets"
    assets.mkdir()
    (assets / "app.js").write_text("console.log(1)")
    client = TestClient(_make_app(tmp_path))
    r = client.get("/assets/app.js")
    assert r.status_code == 200
    assert "console.log" in r.text


def test_api_route_still_returns_json(tmp_path):
    (tmp_path / "index.html").write_text("INDEX")
    client = TestClient(_make_app(tmp_path))
    r = client.get("/api/ping")
    assert r.status_code == 200
    assert r.json() == {"ok": True}
