from app.excluded import ExcludedStore


def _rec(uid="ev-1", start="2026-06-01T09:00:00+01:00"):
    return dict(uid=uid, start=start, end="2026-06-01T10:00:00+01:00",
                title="Standup", date="2026-06-01")


def test_add_list_remove(tmp_path):
    s = ExcludedStore(tmp_path / "excluded.json")
    assert s.list() == [] and s.keys() == set()
    s.add(**_rec())
    assert s.keys() == {"ev-1|2026-06-01T09:00:00+01:00"}
    assert s.list()[0]["title"] == "Standup"
    s.add(**_rec())  # idempotent upsert on the same key
    assert len(s.list()) == 1
    s.remove("ev-1", "2026-06-01T09:00:00+01:00")
    assert s.list() == []


def test_persists_and_sorts_newest_first(tmp_path):
    p = tmp_path / "excluded.json"
    st = ExcludedStore(p)
    st.add(**_rec(uid="a", start="2026-06-01T09:00:00"))
    st.add(**_rec(uid="b", start="2026-06-03T09:00:00"))
    assert [r["uid"] for r in ExcludedStore(p).list()] == ["b", "a"]


def test_legacy_keyfile_ignored(tmp_path):
    p = tmp_path / "excluded.json"
    p.write_text('["uid|start"]')  # PR #4-era list of key strings
    assert ExcludedStore(p).list() == [] and ExcludedStore(p).keys() == set()


def test_corrupt_file(tmp_path):
    p = tmp_path / "excluded.json"
    p.write_text("{not json")
    assert ExcludedStore(p).list() == []
