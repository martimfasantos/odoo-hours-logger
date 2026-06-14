import json

import pytest

from app.ignore import IgnoreStore


def _store(tmp_path):
    return IgnoreStore(tmp_path / "ignore_keywords.json")


def test_get_empty_when_no_file(tmp_path):
    assert _store(tmp_path).get() == []


def test_set_saves_and_get_returns_keywords(tmp_path):
    s = _store(tmp_path)
    result = s.set(["Lunch", "OOO"])
    assert result == ["Lunch", "OOO"]
    assert s.get() == ["Lunch", "OOO"]


def test_set_trims_whitespace(tmp_path):
    s = _store(tmp_path)
    result = s.set([" lunch ", "  OOO  "])
    assert result == ["lunch", "OOO"]


def test_set_drops_empty_strings(tmp_path):
    s = _store(tmp_path)
    result = s.set(["", "  ", "Lunch"])
    assert result == ["Lunch"]


def test_set_dedupes_case_insensitively_preserving_order(tmp_path):
    s = _store(tmp_path)
    # "OOO" and "ooo" are duplicates — keep the first occurrence.
    result = s.set(["OOO", "Lunch", "ooo", "LUNCH"])
    assert result == ["OOO", "Lunch"]


def test_set_persists_across_instances(tmp_path):
    _store(tmp_path).set(["lunch", "OOO"])
    reloaded = _store(tmp_path)
    assert reloaded.get() == ["lunch", "OOO"]


def test_set_creates_parent_directories(tmp_path):
    nested_path = tmp_path / "sub" / "dir" / "ignore_keywords.json"
    s = IgnoreStore(nested_path)
    s.set(["lunch"])
    assert nested_path.exists()
    assert s.get() == ["lunch"]


def test_corrupt_file_returns_empty(tmp_path):
    path = tmp_path / "ignore_keywords.json"
    path.write_text("{not json")
    assert IgnoreStore(path).get() == []


def test_non_list_json_returns_empty(tmp_path):
    path = tmp_path / "ignore_keywords.json"
    path.write_text(json.dumps({"key": "value"}))
    assert IgnoreStore(path).get() == []


def test_set_empty_list_clears_keywords(tmp_path):
    s = _store(tmp_path)
    s.set(["Lunch"])
    result = s.set([])
    assert result == []
    assert s.get() == []
