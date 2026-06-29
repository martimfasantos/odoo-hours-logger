import sys
from pathlib import Path

from app import paths


def test_app_data_dir_dev_is_backend_dir():
    # From source, app_data_dir() is the backend/ directory (parent of app/).
    d = paths.app_data_dir()
    assert d.name == "backend"
    assert (d / "app" / "paths.py").exists()


def test_app_data_dir_frozen_is_application_support(tmp_path, monkeypatch):
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    monkeypatch.setattr(Path, "home", classmethod(lambda cls: tmp_path))
    expected = tmp_path / "Library" / "Application Support" / "Odoo Hours Logger"
    assert paths.app_data_dir() == expected


def test_frontend_dist_dir_frozen_returns_meipass_when_present(tmp_path, monkeypatch):
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    monkeypatch.setattr(sys, "_MEIPASS", str(tmp_path), raising=False)
    dist = tmp_path / "frontend_dist"
    dist.mkdir()
    (dist / "index.html").write_text("<!doctype html>")
    assert paths.frontend_dist_dir() == dist


def test_frontend_dist_dir_returns_none_when_no_index(tmp_path, monkeypatch):
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    monkeypatch.setattr(sys, "_MEIPASS", str(tmp_path), raising=False)
    (tmp_path / "frontend_dist").mkdir()  # no index.html
    assert paths.frontend_dist_dir() is None


def test_ensure_app_dirs_creates_data(tmp_path, monkeypatch):
    monkeypatch.setattr(paths, "app_data_dir", lambda: tmp_path)
    paths.ensure_app_dirs()
    assert (tmp_path / "data").is_dir()
