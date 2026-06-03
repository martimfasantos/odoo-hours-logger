# backend/tests/test_rules.py
from app.rules import RulesStore
from app.schemas import RuleCreate


def _store(tmp_path):
    return RulesStore(tmp_path / "rules.json")


def _payload(name="GreenVolt"):
    return RuleCreate(
        name=name, keywords=["greenvolt"], project_id=10,
        project_name="GreenVolt", task_id=55, task_name="Meetings", priority=1,
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
        name="GreenVolt", keywords=["gv", "greenvolt"], project_id=10,
        project_name="GreenVolt", task_id=55, task_name="Meetings", priority=5,
    ))
    assert updated.priority == 5
    assert "gv" in updated.keywords


def test_delete_removes_rule(tmp_path):
    s = _store(tmp_path)
    r = s.create(_payload())
    s.delete(r.id)
    assert s.list() == []
