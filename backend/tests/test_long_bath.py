"""
LONG_BATH — Long bath installation compliance check.

Key behaviour under test:
- SKIP when no long_bath symbol present
- PASS when capacity ≤ 250 L
- WARN when capacity > 250 L (detail lists the three required provisions)
- WARN when capacity not entered (prompt to fill it in)
- Multiple baths: mixed states fold into overall WARN
"""

import pytest
from tests.helpers import el, meta
from app.agents.long_bath_check import check_long_bath_installation


def bath(id_="lb1", capacity=None):
    return el(id_, "long_bath", long_bath_capacity_l=capacity)


# ---------------------------------------------------------------------------
# SKIP
# ---------------------------------------------------------------------------

def test_skip_no_long_bath():
    r = check_long_bath_installation(meta([el("s1", "sink")]))
    assert r.status == "SKIP"


# ---------------------------------------------------------------------------
# PASS — capacity within limit
# ---------------------------------------------------------------------------

def test_pass_capacity_at_limit():
    r = check_long_bath_installation(meta([bath(capacity=250)]))
    assert r.status == "PASS"
    assert any("250" in line and "within" in line for line in r.detail)


def test_pass_capacity_below_limit():
    r = check_long_bath_installation(meta([bath(capacity=180)]))
    assert r.status == "PASS"


# ---------------------------------------------------------------------------
# WARN — capacity exceeds 250 L
# ---------------------------------------------------------------------------

def test_warn_capacity_exceeds_limit():
    r = check_long_bath_installation(meta([bath(capacity=300)]))
    assert r.status == "WARN"
    detail_blob = " ".join(r.detail)
    assert "recirculation" in detail_blob.lower()
    assert "drain plug" in detail_blob.lower() or "no direct drain" in detail_blob.lower()
    assert "backwash" in detail_blob.lower() or "sewer" in detail_blob.lower()


# ---------------------------------------------------------------------------
# WARN — capacity not entered
# ---------------------------------------------------------------------------

def test_warn_capacity_not_entered():
    r = check_long_bath_installation(meta([bath(capacity=None)]))
    assert r.status == "WARN"
    assert any("not entered" in line.lower() or "capacity" in line.lower() for line in r.detail)


# ---------------------------------------------------------------------------
# Multiple baths
# ---------------------------------------------------------------------------

def test_multiple_baths_all_pass():
    r = check_long_bath_installation(meta([bath("lb1", 200), bath("lb2", 250)]))
    assert r.status == "PASS"


def test_multiple_baths_one_exceeds_limit():
    r = check_long_bath_installation(meta([bath("lb1", 200), bath("lb2", 300)]))
    assert r.status == "WARN"


def test_multiple_baths_one_missing_capacity():
    r = check_long_bath_installation(meta([bath("lb1", 200), bath("lb2", None)]))
    assert r.status == "WARN"
    assert "1" in r.summary  # "1 long bath(s) require attention"
