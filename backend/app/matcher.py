from app.schemas import MatchResult, Rule


def match_title(title: str, rules: list[Rule]) -> MatchResult:
    title_l = (title or "").lower()
    active = sorted([r for r in rules if r.active], key=lambda r: r.id)

    matched = [
        r for r in active
        if any(kw.lower() in title_l for kw in r.keywords if kw)
    ]
    if not matched:
        return MatchResult()

    winner = matched[0]
    return MatchResult(
        rule_id=winner.id,
        contract_id=winner.contract_id,
        contract_name=winner.contract_name,
        alternative_rule_ids=[r.id for r in matched[1:]],
    )
