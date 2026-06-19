# backend/tests/test_rules.py
import json

from app.rules import RulesStore
from app.schemas import RuleCreate


def _store(tmp_path):
    return RulesStore(tmp_path / "rules.json")


def _payload(name="GreenVolt"):
    return RuleCreate(
        name=name, keywords=["greenvolt"], contract_id=10,
        contract_name="[10] GreenVolt",
    )


def test_list_empty_when_no_file(tmp_path):
    assert _store(tmp_path).list() == []


def test_create_assigns_incrementing_ids(tmp_path):
    s = _store(tmp_path)
    r1 = s.create(_payload("A"))
    r2 = s.create(_payload("B"))
    assert r1.id == 1
    assert r2.id == 2
    assert [r.name for r in s.list()] == ["A", "B"]


def test_create_persists_across_instances(tmp_path):
    _store(tmp_path).create(_payload())
    reloaded = _store(tmp_path)
    assert len(reloaded.list()) == 1


def test_update_changes_fields(tmp_path):
    s = _store(tmp_path)
    r = s.create(_payload())
    updated = s.update(r.id, RuleCreate(
        name="GreenVolt", keywords=["gv", "greenvolt"], contract_id=10,
        contract_name="[10] GreenVolt",
    ))
    assert "gv" in updated.keywords


def test_delete_removes_rule(tmp_path):
    s = _store(tmp_path)
    r = s.create(_payload())
    s.delete(r.id)
    assert s.list() == []


def test_corrupt_file_returns_empty(tmp_path):
    path = tmp_path / "rules.json"
    path.write_text("{not json")
    assert RulesStore(path).list() == []


def test_list_skips_stale_old_shaped_rules(tmp_path):
    path = tmp_path / "rules.json"
    # First record uses the legacy project/task shape and must be skipped;
    # the second is a valid contract-based rule.
    path.write_text(json.dumps([
        {"id": 1, "name": "Legacy", "keywords": ["x"],
         "project_id": 101, "project_name": "GreenVolt",
         "task_id": None, "task_name": None, "priority": 100, "active": True},
        {"id": 2, "name": "New", "keywords": ["y"],
         "contract_id": 50, "contract_name": "[50] Client", "priority": 1,
         "active": True},
    ]))
    rules = RulesStore(path).list()
    assert [r.id for r in rules] == [2]
    assert rules[0].contract_id == 50
