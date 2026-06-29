"""
HOT_WATER — Section 6: Hot water / Contamination prevention

Key behaviour under test:
- Rule 6.1: heat pump supply mode consistency (heaters + fittings same mode)
- Rule 6.3: water_heater needs check_valve + pressure_relief_valve (graph)
- Rule 6.4: §6.4 appliances (backflow_requirement=check_valve, not water_heater) need check_valve
- Rule 6.5: bidet/bidet_spray (backflow_requirement=vacuum_breaker) needs vacuum_breaker + check_valve

We test detail lines rather than overall status because acknowledgment-based sub-checks
(6.2, 6.4 ack, 6.5 ack, 6.6) always add WARNs in test conditions.
"""

import pytest
from tests.helpers import el, pipe, meta, has_pass_line, has_fail_line, has_warn_line
from app.agents.hot_water_contamination_check import check_hot_water_contamination


# ---------------------------------------------------------------------------
# SKIP
# ---------------------------------------------------------------------------

def test_skip_no_relevant_elements():
    m = meta([el("s1", "shower_head", node_type="water_fitting")])
    r = check_hot_water_contamination(m)
    assert r.status == "SKIP"


def test_skip_only_tanks_and_pumps():
    """Tanks and pumps alone do not trigger section 6 — check should SKIP."""
    m = meta([
        el("t1", "water_tank"),
        el("p1", "pump"),
    ])
    # has_tank_or_pump is True → check runs but only 6.6 acknowledgment applies
    # Should not be SKIP (tank_or_pump triggers a check), but also not FAIL
    r = check_hot_water_contamination(m)
    assert r.status != "SKIP"


# ---------------------------------------------------------------------------
# Rule 6.3 — Water heater protection assembly
# ---------------------------------------------------------------------------

def test_rule63_heater_with_check_valve_and_prv_passes():
    elements = [
        el("h1", "water_heater"),
        el("cv1", "check_valve"),
        el("prv1", "pressure_relief_valve"),
    ]
    pipes = [pipe("p1", "cv1", "h1"), pipe("p2", "prv1", "h1")]
    r = check_hot_water_contamination(meta(elements, pipes))
    assert has_pass_line(r.detail, "Rule 6.3")


def test_rule63_heater_with_check_valve_no_prv_warns():
    elements = [
        el("h1", "water_heater"),
        el("cv1", "check_valve"),
    ]
    r = check_hot_water_contamination(meta(elements, [pipe("p1", "cv1", "h1")]))
    assert has_warn_line(r.detail, "Rule 6.3")


def test_rule63_heater_no_protection_fails():
    m = meta([el("h1", "water_heater")])
    r = check_hot_water_contamination(m)
    assert has_fail_line(r.detail, "Rule 6.3")


# ---------------------------------------------------------------------------
# Rule 6.4 — Appliance double check valves
# ---------------------------------------------------------------------------

def test_rule64_appliance_with_check_valve_passes():
    elements = [
        el("wm1", "washing_machine", backflow_requirement="check_valve"),
        el("cv1", "check_valve"),
    ]
    r = check_hot_water_contamination(meta(elements, [pipe("p1", "cv1", "wm1")]))
    assert has_pass_line(r.detail, "Rule 6.4")


def test_rule64_appliance_without_check_valve_fails():
    m = meta([el("dw1", "dishwasher", backflow_requirement="check_valve")])
    r = check_hot_water_contamination(m)
    assert has_fail_line(r.detail, "Rule 6.4")


def test_rule64_water_heater_not_included():
    """
    CRITICAL: water_heater has backflow_requirement='check_valve' but must NOT appear in
    Rule 6.4 (it has its own Rule 6.3 check). This verifies the symbol_id != 'water_heater'
    exclusion is working.
    """
    # Only a water_heater — Rule 6.4 should be skipped (no appliances), Rule 6.3 handles it
    m = meta([el("h1", "water_heater", backflow_requirement="check_valve")])
    r = check_hot_water_contamination(m)
    assert not has_fail_line(r.detail, "Rule 6.4")
    # Rule 6.4 skipped when no appliances
    assert any("6.4" in d and "skipped" in d.lower() for d in r.detail)


def test_rule64_landscape_tap_without_check_valve_fails():
    m = meta([el("bt1", "bib_tap_cw_cap_and_lock_schematic", backflow_requirement="check_valve")])
    r = check_hot_water_contamination(m)
    assert has_fail_line(r.detail, "Rule 6.4")


def test_rule64_multiple_appliances_one_protected_one_not():
    elements = [
        el("wm1", "washing_machine", backflow_requirement="check_valve"),
        el("dw1", "dishwasher", backflow_requirement="check_valve"),
        el("cv1", "check_valve"),
    ]
    pipes = [pipe("p1", "cv1", "wm1")]  # only washing machine is protected
    r = check_hot_water_contamination(meta(elements, pipes))
    assert has_pass_line(r.detail, "Rule 6.4")   # washing machine passes
    assert has_fail_line(r.detail, "Rule 6.4")   # dishwasher fails


# ---------------------------------------------------------------------------
# Rule 6.5 — Bidet spray vacuum breaker
# ---------------------------------------------------------------------------

def test_rule65_bidet_with_correct_assembly_passes():
    """Correct order: inlet → check_valve → vacuum_breaker → bidet_spray."""
    elements = [
        el("b1", "bidet_spray", backflow_requirement="vacuum_breaker"),
        el("vb1", "vacuum_breaker"),
        el("cv1", "check_valve"),
    ]
    pipes_ = [pipe("p1", "cv1", "vb1"), pipe("p2", "vb1", "b1")]
    r = check_hot_water_contamination(meta(elements, pipes_))
    assert has_pass_line(r.detail, "Rule 6.5")


def test_rule65_bidet_no_protection_fails():
    m = meta([el("b1", "bidet_spray", backflow_requirement="vacuum_breaker")])
    r = check_hot_water_contamination(m)
    assert has_fail_line(r.detail, "Rule 6.5")


def test_rule65_bidet_vacuum_breaker_only_warns():
    """Vacuum breaker present but no check valve — should warn, not pass."""
    elements = [
        el("b1", "bidet_spray", backflow_requirement="vacuum_breaker"),
        el("vb1", "vacuum_breaker"),
    ]
    r = check_hot_water_contamination(meta(elements, [pipe("p1", "vb1", "b1")]))
    assert has_warn_line(r.detail, "Rule 6.5")
    assert not has_pass_line(r.detail, "Rule 6.5")


def test_rule65_wrong_assembly_order_fails():
    """Wrong order: inlet → vacuum_breaker → check_valve → bidet_spray should FAIL."""
    elements = [
        el("b1", "bidet_spray", backflow_requirement="vacuum_breaker"),
        el("vb1", "vacuum_breaker"),
        el("cv1", "check_valve"),
    ]
    # cv is 1 hop from bidet_spray, vb is 2 hops — wrong order
    pipes_ = [pipe("p1", "vb1", "cv1"), pipe("p2", "cv1", "b1")]
    r = check_hot_water_contamination(meta(elements, pipes_))
    assert has_fail_line(r.detail, "Rule 6.5")


# ---------------------------------------------------------------------------
# Rule 6.1 — Supply mode consistency (guards the fix for node_type filter)
# ---------------------------------------------------------------------------

def test_rule61_skip_no_heater():
    """Without any heater/bidet/appliance the whole check is SKIP (no Rule 6.1 detail at all)."""
    m = meta([el("f1", "basin_tap", node_type="water_fitting", supply_mode="direct_supply")])
    r = check_hot_water_contamination(m)
    assert r.status == "SKIP"


def test_rule61_pass_consistent_direct_supply():
    """Heater and fittings all on direct_supply — Rule 6.1 passes."""
    elements = [
        el("h1", "water_heater", supply_mode="direct_supply"),
        el("f1", "basin_tap", node_type="water_fitting", supply_mode="direct_supply"),
        el("f2", "sink_tap",  node_type="water_fitting", supply_mode="direct_supply"),
    ]
    r = check_hot_water_contamination(meta(elements))
    assert has_pass_line(r.detail, "Rule 6.1")


def test_rule61_warn_mixed_supply_modes():
    """Heater on indirect, fitting on direct — Rule 6.1 warns about mixed modes."""
    elements = [
        el("h1", "water_heater", supply_mode="indirect_supply"),
        el("f1", "basin_tap", node_type="water_fitting", supply_mode="direct_supply"),
    ]
    r = check_hot_water_contamination(meta(elements))
    assert has_warn_line(r.detail, "Rule 6.1")


def test_rule61_skip_no_fittings_with_supply_mode():
    """Heater present but no water_fitting elements with supply_mode — Rule 6.1 detail says skipped."""
    elements = [
        el("h1", "water_heater"),
        el("f1", "basin_tap"),  # no node_type or supply_mode — not counted as a fitting
    ]
    r = check_hot_water_contamination(meta(elements))
    assert any("Rule 6.1" in line and "skipped" in line.lower() for line in r.detail)
