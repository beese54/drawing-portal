"""
REG28 — Backflow Prevention (Regulation 28 / SS636 §6.4 / §6.5)

Key behaviour under test:
- Risk elements are now identified by the exported `backflow_requirement` field,
  NOT by hardcoded symbol_id sets.
- "check_valve"  → element needs a check_valve upstream (Reg 28 / §6.4)
- "vacuum_breaker" → element needs a vacuum_breaker upstream (§6.5)
"""

import pytest
from tests.helpers import el, pipe, meta
from app.agents.compliance_checks import check_backflow_prevention


# ---------------------------------------------------------------------------
# SKIP
# ---------------------------------------------------------------------------

def test_skip_when_no_risk_elements():
    m = meta([el("s1", "shower_head")])
    r = check_backflow_prevention(m)
    assert r.status == "SKIP"


def test_skip_when_no_backflow_requirement_field_even_on_known_symbols():
    """If the frontend omits backflow_requirement (e.g. old export), backend skips gracefully."""
    # water_heater with NO backflow_requirement field — should not be treated as a risk element
    m = meta([el("h1", "water_heater")])
    r = check_backflow_prevention(m)
    assert r.status == "SKIP"


# ---------------------------------------------------------------------------
# Water heater (check_valve required — Reg 28 / §6.4)
# ---------------------------------------------------------------------------

def test_water_heater_pass_with_adjacent_check_valve():
    elements = [
        el("h1", "water_heater", backflow_requirement="check_valve"),
        el("cv1", "check_valve"),
    ]
    pipes = [pipe("p1", "cv1", "h1")]
    r = check_backflow_prevention(meta(elements, pipes))
    assert r.status == "PASS"
    assert any("✓" in d for d in r.detail)


def test_water_heater_fail_no_check_valve():
    m = meta([el("h1", "water_heater", backflow_requirement="check_valve")])
    r = check_backflow_prevention(m)
    assert r.status == "FAIL"
    assert any("✗" in d for d in r.detail)


def test_water_heater_not_satisfied_by_vacuum_breaker():
    """Water heater needs a check_valve; a vacuum_breaker does not count."""
    elements = [
        el("h1", "water_heater", backflow_requirement="check_valve"),
        el("vb1", "vacuum_breaker"),
    ]
    r = check_backflow_prevention(meta(elements, [pipe("p1", "vb1", "h1")]))
    assert r.status == "FAIL"


def test_water_heater_pass_check_valve_two_hops_away():
    """Check valve is 2 hops away — still satisfies the check (but may add a recommendation)."""
    elements = [
        el("h1", "water_heater", backflow_requirement="check_valve"),
        el("tee1", "tee_junction"),
        el("cv1", "check_valve"),
    ]
    pipes = [pipe("p1", "cv1", "tee1"), pipe("p2", "tee1", "h1")]
    r = check_backflow_prevention(meta(elements, pipes))
    # Status can be PASS or WARN (recommendation to move closer), not FAIL
    assert r.status in ("PASS", "WARN")
    assert not any("✗" in d and "heater" in d.lower() for d in r.detail)


# ---------------------------------------------------------------------------
# §6.4 appliances (check_valve required)
# ---------------------------------------------------------------------------

def test_appliance_pass_with_check_valve():
    elements = [
        el("wm1", "washing_machine", backflow_requirement="check_valve"),
        el("cv1", "check_valve"),
    ]
    r = check_backflow_prevention(meta(elements, [pipe("p1", "cv1", "wm1")]))
    assert r.status == "PASS"


def test_appliance_fail_no_check_valve():
    m = meta([el("dw1", "dishwasher", backflow_requirement="check_valve")])
    r = check_backflow_prevention(m)
    assert r.status == "FAIL"


def test_landscape_tap_fail_no_check_valve():
    m = meta([el("bt1", "bib_tap_cw_cap_and_lock_schematic", backflow_requirement="check_valve")])
    r = check_backflow_prevention(m)
    assert r.status == "FAIL"


# ---------------------------------------------------------------------------
# §6.5 bidet (vacuum_breaker required)
# ---------------------------------------------------------------------------

def test_bidet_spray_pass_with_correct_assembly():
    """Correct order: inlet → check_valve → vacuum_breaker → bidet_spray."""
    elements = [
        el("b1", "bidet_spray", backflow_requirement="vacuum_breaker"),
        el("vb1", "vacuum_breaker"),
        el("cv1", "check_valve"),
    ]
    pipes_ = [pipe("p1", "cv1", "vb1"), pipe("p2", "vb1", "b1")]
    r = check_backflow_prevention(meta(elements, pipes_))
    assert r.status == "PASS"
    assert any("✓" in d for d in r.detail)


def test_bidet_spray_fail_no_vacuum_breaker():
    m = meta([el("b1", "bidet_spray", backflow_requirement="vacuum_breaker")])
    r = check_backflow_prevention(m)
    assert r.status == "FAIL"


def test_bidet_spray_fail_no_check_valve():
    """vacuum_breaker present but no check_valve — §6.5 requires both."""
    elements = [
        el("b1", "bidet_spray", backflow_requirement="vacuum_breaker"),
        el("vb1", "vacuum_breaker"),
    ]
    r = check_backflow_prevention(meta(elements, [pipe("p1", "vb1", "b1")]))
    assert r.status == "FAIL"
    assert any("check valve" in d.lower() for d in r.detail)


def test_bidet_spray_fail_wrong_assembly_order():
    """Wrong order: inlet → vacuum_breaker → check_valve → bidet_spray should FAIL."""
    elements = [
        el("b1", "bidet_spray", backflow_requirement="vacuum_breaker"),
        el("vb1", "vacuum_breaker"),
        el("cv1", "check_valve"),
    ]
    # cv is 1 hop from bidet_spray, vb is 2 hops — wrong order
    pipes_ = [pipe("p1", "vb1", "cv1"), pipe("p2", "cv1", "b1")]
    r = check_backflow_prevention(meta(elements, pipes_))
    assert r.status == "FAIL"
    assert any("order" in d.lower() for d in r.detail)


# ---------------------------------------------------------------------------
# Multiple risk elements
# ---------------------------------------------------------------------------

def test_multiple_elements_all_protected():
    elements = [
        el("h1", "water_heater", backflow_requirement="check_valve"),
        el("wm1", "washing_machine", backflow_requirement="check_valve"),
        el("cv1", "check_valve"),
        el("cv2", "check_valve"),
    ]
    pipes = [pipe("p1", "cv1", "h1"), pipe("p2", "cv2", "wm1")]
    r = check_backflow_prevention(meta(elements, pipes))
    assert r.status == "PASS"


def test_multiple_elements_one_missing_protection():
    """One heater protected, one appliance not — overall FAIL."""
    elements = [
        el("h1", "water_heater", backflow_requirement="check_valve"),
        el("wm1", "washing_machine", backflow_requirement="check_valve"),
        el("cv1", "check_valve"),
    ]
    pipes = [pipe("p1", "cv1", "h1")]  # only heater is protected
    r = check_backflow_prevention(meta(elements, pipes))
    assert r.status == "FAIL"
    assert any("✓" in d for d in r.detail)  # heater passes
    assert any("✗" in d for d in r.detail)  # appliance fails
