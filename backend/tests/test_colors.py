import pytest

from app.colors import ColorStore


def test_empty_when_no_file(tmp_path):
    store = ColorStore(tmp_path / "colors.json")
    assert store.get_all() == {}


def test_set_and_get_all(tmp_path):
    store = ColorStore(tmp_path / "colors.json")
    store.set(101, "#3B82F6")
    result = store.get_all()
    assert result == {"101": "#3B82F6"}


def test_multiple_set_and_get_all(tmp_path):
    store = ColorStore(tmp_path / "colors.json")
    store.set(101, "#3B82F6")
    store.set(102, "#D97706")
    result = store.get_all()
    assert result["101"] == "#3B82F6"
    assert result["102"] == "#D97706"


def test_persists_across_instances(tmp_path):
    path = tmp_path / "colors.json"
    store1 = ColorStore(path)
    store1.set(101, "#3B82F6")

    store2 = ColorStore(path)
    assert store2.get_all() == {"101": "#3B82F6"}


def test_corrupt_file_returns_empty(tmp_path):
    path = tmp_path / "colors.json"
    path.write_text("not valid json!!!")
    store = ColorStore(path)
    assert store.get_all() == {}


def test_whitespace_file_returns_empty(tmp_path):
    path = tmp_path / "colors.json"
    path.write_text("   \n  ")
    store = ColorStore(path)
    assert store.get_all() == {}


def test_set_overwrites_existing_color(tmp_path):
    store = ColorStore(tmp_path / "colors.json")
    store.set(101, "#3B82F6")
    store.set(101, "#D97706")
    assert store.get_all() == {"101": "#D97706"}
