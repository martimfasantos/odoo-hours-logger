# backend/tests/test_matcher.py
from app.matcher import match_title
from app.schemas import Rule


def _rule(id, name, keywords, project_id, priority=100, active=True, task_id=None):
    return Rule(
        id=id, name=name, keywords=keywords, project_id=project_id,
        project_name=name, task_id=task_id, task_name=None,
        priority=priority, active=active,
    )


def test_single_keyword_match():
    rules = [_rule(1, "GreenVolt", ["greenvolt"], 10)]
    m = match_title("GreenVolt standup", rules)
    assert m.rule_id == 1
    assert m.project_id == 10


def test_match_is_case_insensitive():
    rules = [_rule(1, "GreenVolt", ["GREENVOLT"], 10)]
    m = match_title("greenvolt sync", rules)
    assert m.rule_id == 1


def test_priority_decides_winner_and_records_alternatives():
    rules = [
        _rule(1, "Generic", ["sync"], 99, priority=200),
        _rule(2, "GreenVolt", ["greenvolt"], 10, priority=1),
    ]
    m = match_title("GreenVolt sync", rules)
    assert m.rule_id == 2
    assert m.alternative_rule_ids == [1]


def test_inactive_rule_ignored():
    rules = [_rule(1, "GreenVolt", ["greenvolt"], 10, active=False)]
    m = match_title("GreenVolt standup", rules)
    assert m.rule_id is None


def test_no_match_returns_empty_result():
    rules = [_rule(1, "GreenVolt", ["greenvolt"], 10)]
    m = match_title("Lunch", rules)
    assert m.rule_id is None
    assert m.project_id is None
