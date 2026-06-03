# backend/tests/test_ledger.py
from datetime import datetime

from app.ledger import Ledger


def _ledger(tmp_path):
    return Ledger(tmp_path / "ledger.json")


def test_not_logged_initially(tmp_path):
    lg = _ledger(tmp_path)
    assert lg.is_logged("uid-1", datetime(2026, 6, 1, 9, 0)) is False


def test_record_then_is_logged(tmp_path):
    lg = _ledger(tmp_path)
    lg.record("uid-1", datetime(2026, 6, 1, 9, 0), odoo_line_id=500,
              project_id=10, task_id=55, hours=0.5, pushed_at="2026-06-01T10:00:00")
    assert lg.is_logged("uid-1", datetime(2026, 6, 1, 9, 0)) is True


def test_same_uid_different_start_is_separate(tmp_path):
    lg = _ledger(tmp_path)
    lg.record("uid-1", datetime(2026, 6, 1, 9, 0), odoo_line_id=500,
              project_id=10, task_id=55, hours=0.5, pushed_at="x")
    assert lg.is_logged("uid-1", datetime(2026, 6, 8, 9, 0)) is False


def test_persists_across_instances(tmp_path):
    _ledger(tmp_path).record("uid-1", datetime(2026, 6, 1, 9, 0), odoo_line_id=1,
                             project_id=10, task_id=None, hours=1.0, pushed_at="x")
    assert _ledger(tmp_path).is_logged("uid-1", datetime(2026, 6, 1, 9, 0)) is True
