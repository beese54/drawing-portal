"""
SEC221 — Mode of Supply (Handbook 2.2.1)

Key behaviour under test:
- Highest fitting elevation uses only elements with node_type == "water_fitting"
- Falls back to all elements if no fittings are present
- Supply mode thresholds: ≤25m direct, 25-37m indirect tank, >37m Mode C
"""

import pytest
from tests.helpers import el, meta
from app.agents.compliance_checks import check_supply_mode


def fitting(id_, elevation_m, supply_mode="direct_supply"):
    return el(id_, "shower_head", node_type="water_fitting", elevation_m=elevation_m, supply_mode=supply_mode)


def tank(id_, elevation_m=10.0):
    return el(id_, "water_tank", node_type="source", elevation_m=elevation_m, supply_mode=None)


def pump_(id_, elevation_m=5.0):
    return el(id_, "pump", node_type="pressure_booster", elevation_m=elevation_m, supply_mode=None)


# ---------------------------------------------------------------------------
# SKIP
# ---------------------------------------------------------------------------

def test_skip_empty_schematic():
    r = check_supply_mode(meta([]))
    assert r.status == "SKIP"


# ---------------------------------------------------------------------------
# Direct supply (≤ 25 m)
# ---------------------------------------------------------------------------

def test_pass_direct_supply_at_20m():
    r = check_supply_mode(meta([fitting("f1", 20.0)]))
    assert r.status == "PASS"
    assert "direct" in r.summary.lower()


def test_pass_direct_supply_exactly_25m():
    r = check_supply_mode(meta([fitting("f1", 25.0)]))
    assert r.status == "PASS"


def test_warn_direct_supply_with_indirect_elements_present():
    """Direct supply is sufficient but indirect elements are on the canvas."""
    elements = [
        fitting("f1", 20.0, supply_mode="indirect_supply"),
        tank("t1"),
    ]
    r = check_supply_mode(meta(elements))
    assert r.status == "WARN"


# ---------------------------------------------------------------------------
# Indirect via tank (> 25 m, ≤ 37 m)
# ---------------------------------------------------------------------------

def test_pass_indirect_tank_at_30m():
    elements = [
        fitting("f1", 30.0, supply_mode="indirect_supply"),
        tank("t1"),
    ]
    r = check_supply_mode(meta(elements))
    assert r.status == "PASS"


def test_fail_indirect_range_no_tank():
    r = check_supply_mode(meta([fitting("f1", 30.0)]))
    assert r.status == "FAIL"
    assert "tank" in r.summary.lower()


# ---------------------------------------------------------------------------
# Mode C (> 37 m)
# ---------------------------------------------------------------------------

def test_mode_c_above_37m_with_tank_and_pump():
    elements = [
        fitting("f1", 40.0, supply_mode="indirect_supply"),
        tank("t1"),
        pump_("p1"),
    ]
    r = check_supply_mode(meta(elements))
    # Mode C — check detail mentions the elevation
    assert any("40.0" in d for d in r.detail)


# ---------------------------------------------------------------------------
# node_type filtering — critical correctness test
# ---------------------------------------------------------------------------

def test_only_water_fitting_elements_count_for_elevation():
    """
    A gate valve at 50 m AMSL must NOT inflate the highest fitting elevation.
    The check should see the fitting at 20 m and return direct-supply PASS.
    """
    elements = [
        fitting("f1", 20.0),
        el("v1", "gate_valve", node_type="isolation_valve", elevation_m=50.0, supply_mode="direct_supply"),
    ]
    r = check_supply_mode(meta(elements))
    assert r.status == "PASS"                           # 20 m → direct
    assert "20.0" in r.detail[0]                        # highest fitting shown in first detail line


def test_fallback_to_all_elements_when_no_fittings():
    """If nothing has node_type=water_fitting, falls back to all elements."""
    # Only a valve at 30 m — no fittings
    elements = [
        el("v1", "gate_valve", node_type="isolation_valve", elevation_m=30.0, supply_mode="direct_supply"),
    ]
    r = check_supply_mode(meta(elements))
    # 30 m fallback → indirect_tank range, no tank → FAIL
    assert r.status == "FAIL"


# ---------------------------------------------------------------------------
# Per-fitting tank bypass — a tank exists and *some* fitting is correctly on
# indirect supply, but another high fitting is wired straight to the mains.
# ---------------------------------------------------------------------------

def test_fail_when_one_fitting_bypasses_tank_on_direct_supply():
    """
    f1 (30 m, indirect_supply) is correctly fed from the tank, which used to
    be enough to make `has_indirect` true and PASS the whole check. f2 (28 m)
    is also above the 25 m limit but is wired directly to the mains — that's
    a violation the old aggregate-only check missed entirely.
    """
    elements = [
        fitting("f1", 30.0, supply_mode="indirect_supply"),
        fitting("f2", 28.0, supply_mode="direct_supply"),
        tank("t1"),
    ]
    r = check_supply_mode(meta(elements))
    assert r.status == "FAIL"
    assert any("f2" in eoi["element_id"] for eoi in r.elements_of_interest)


def test_fail_when_high_fitting_has_no_supply_mode_despite_tank():
    """An unconnected/untraceable high fitting (supply_mode=None) must not slip through as compliant."""
    elements = [
        fitting("f1", 30.0, supply_mode=None),
        tank("t1"),
    ]
    r = check_supply_mode(meta(elements))
    assert r.status == "FAIL"
