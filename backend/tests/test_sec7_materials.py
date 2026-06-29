"""
SEC7_MATERIALS — Pipes & Fittings: PUB-approved materials (LP/PE acknowledgment).

Key behaviour under test:
- PASS when materials_acknowledged is True
- WARN when materials_acknowledged is False or absent
"""

from tests.helpers import el, meta
from app.agents.section3_pipe_check import check_section3_pipes


# ---------------------------------------------------------------------------
# PASS
# ---------------------------------------------------------------------------

def test_pass_when_acknowledged():
    r = check_section3_pipes(meta([], materials_acknowledged=True))
    assert r.status == "PASS"
    assert any("confirmed" in line.lower() for line in r.detail)


# ---------------------------------------------------------------------------
# WARN — not acknowledged
# ---------------------------------------------------------------------------

def test_warn_when_not_acknowledged():
    r = check_section3_pipes(meta([], materials_acknowledged=False))
    assert r.status == "WARN"
    assert any("not confirmed" in line.lower() or "acknowledgment required" in line.lower() for line in r.detail)


def test_warn_when_field_absent():
    r = check_section3_pipes(meta([]))
    assert r.status == "WARN"


# ---------------------------------------------------------------------------
# Check ID and title
# ---------------------------------------------------------------------------

def test_check_id():
    r = check_section3_pipes(meta([]))
    assert r.check_id == "SEC7_MATERIALS"
