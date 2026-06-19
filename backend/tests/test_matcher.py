# backend/tests/test_matcher.py
from app.matcher import match_title
from app.schemas import Rule


def _rule(id, name, keywords, contract_id, active=True):
    return Rule(
        id=id, name=name, keywords=keywords, contract_id=contract_id,
        contract_name=name, active=active,
    )


def test_single_keyword_match():
    rules = [_rule(1, "GreenVolt", ["greenvolt"], 10)]
    m = match_title("GreenVolt standup", rules)
    assert m.rule_id == 1
    assert m.contract_id == 10
    assert m.contract_name == "GreenVolt"


def test_match_is_case_insensitive():
    rules = [_rule(1, "GreenVolt", ["GREENVOLT"], 10)]
    m = match_title("greenvolt sync", rules)
    assert m.rule_id == 1


def test_id_order_decides_winner_and_records_alternatives():
    # id=1 comes first by id order, so it wins even though id=2 also matches.
    rules = [
        _rule(2, "GreenVolt", ["greenvolt"], 10),
        _rule(1, "Generic", ["sync"], 99),
    ]
    m = match_title("GreenVolt sync", rules)
    assert m.rule_id == 1
    assert m.alternative_rule_ids == [2]


def test_inactive_rule_ignored():
    rules = [_rule(1, "GreenVolt", ["greenvolt"], 10, active=False)]
    m = match_title("GreenVolt standup", rules)
    assert m.rule_id is None


def test_no_match_returns_empty_result():
    rules = [_rule(1, "GreenVolt", ["greenvolt"], 10)]
    m = match_title("Lunch", rules)
    assert m.rule_id is None
    assert m.contract_id is None
