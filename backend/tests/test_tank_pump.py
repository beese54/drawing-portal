"""
TANK_PUMP — Tank / Pump Installation (PUB / SS 245 / SS 636)

Key behaviour under test:
- Pump rated head declaration (Rule 10): WARN if missing, PASS ≤35m, FAIL >35m
- Tank sub-checks: overflow diameter, outlet-to-base, material approval
- Bypass line topology check
"""

import pytest
from tests.helpers import el, pipe, meta
from app.agents.tank_pump_check import check_tank_pump_installation


def tank(id_="t1", **tp_overrides):
    """Water tank element with minimal tank_properties."""
    tp = {
        "material": "FRP",
        "overflow_pipe_diameter_m": 0.1,
        "inlet_pipe_diameter_m": 0.08,
        "overflow_pipe_m_amsl": 30.0,
        "warning_pipe_m_amsl": 29.9,
        "inlet_pipe_m_amsl": 29.5,
        "outlet_pipe_diameter_m": 0.08,
        "distance_outlet_to_base_m": 0.08,  # 80 mm — within 75–100 mm
        "pressure_vessel_present": True,
        "is_sunken_tank": False,
        "occupants": None,
        "effective_capacity_l": None,
        "daily_demand_m3": None,
    }
    tp.update(tp_overrides)
    return el(id_, "water_tank", tank_properties=tp)


def pump_(id_="pump1", rated_head=None, **kw):
    return el(id_, "pump", pump_rated_head_m=rated_head, **kw)


def base_meta(extra_elements=None, extra_pipes=None, **kw):
    """Metadata with a fully-specified tank so tank sub-checks all PASS, focus on pump/bypass."""
    elements = [tank()] + (extra_elements or [])
    pipes = extra_pipes or []
    return meta(elements, pipes, pump_discharge_material_acknowledged=True, **kw)


# ---------------------------------------------------------------------------
# SKIP
# ---------------------------------------------------------------------------

def test_skip_no_tank():
    r = check_tank_pump_installation(meta([pump_()]))
    assert r.status == "SKIP"


# ---------------------------------------------------------------------------
# Pump rated head — Rule 10
# ---------------------------------------------------------------------------

def test_pump_rated_head_pass_under_35m():
    m = base_meta([pump_(rated_head=20.0)])
    r = check_tank_pump_installation(m)
    assert any("✓" in d and "20" in d for d in r.detail)


def test_pump_rated_head_pass_exactly_35m():
    m = base_meta([pump_(rated_head=35.0)])
    r = check_tank_pump_installation(m)
    assert any("✓" in d and "35" in d for d in r.detail)


def test_pump_rated_head_fail_over_35m():
    m = base_meta([pump_(rated_head=40.0)])
    r = check_tank_pump_installation(m)
    assert r.status == "FAIL"
    assert any("✗" in d and "40" in d for d in r.detail)


def test_pump_rated_head_warn_not_declared():
    m = base_meta([pump_(rated_head=None)])
    r = check_tank_pump_installation(m)
    assert any("⚠" in d and "not declared" in d.lower() for d in r.detail)


# ---------------------------------------------------------------------------
# Tank sub-checks
# ---------------------------------------------------------------------------

def test_tank_overflow_larger_than_inlet_passes():
    m = meta([tank(overflow_pipe_diameter_m=0.1, inlet_pipe_diameter_m=0.08)])
    r = check_tank_pump_installation(m)
    assert any("✓" in d and "overflow" in d.lower() for d in r.detail)


def test_tank_overflow_not_larger_than_inlet_fails():
    m = meta([tank(overflow_pipe_diameter_m=0.08, inlet_pipe_diameter_m=0.08)])
    r = check_tank_pump_installation(m)
    assert r.status == "FAIL"
    assert any("✗" in d and "overflow" in d.lower() for d in r.detail)


def test_tank_material_frp_passes():
    m = meta([tank(material="FRP")])
    r = check_tank_pump_installation(m)
    assert any("✓" in d and "FRP" in d for d in r.detail)


def test_tank_material_other_warns():
    m = meta([tank(material="Other")])
    r = check_tank_pump_installation(m)
    assert any("⚠" in d and "Other" in d for d in r.detail)


def test_tank_material_unapproved_fails():
    m = meta([tank(material="plastic")])
    r = check_tank_pump_installation(m)
    assert any("✗" in d and "plastic" in d for d in r.detail)


def test_outlet_to_base_in_range_passes():
    m = meta([tank(distance_outlet_to_base_m=0.085)])  # 85 mm — within 75–100 mm
    r = check_tank_pump_installation(m)
    assert any("✓" in d and "outlet" in d.lower() for d in r.detail)


def test_outlet_to_base_out_of_range_fails():
    m = meta([tank(distance_outlet_to_base_m=0.05)])  # 50 mm — below 75 mm minimum
    r = check_tank_pump_installation(m)
    assert any("✗" in d and "outlet" in d.lower() for d in r.detail)


# ---------------------------------------------------------------------------
# Bypass line — Rule 9
# ---------------------------------------------------------------------------

def test_bypass_line_with_gate_valve_passes():
    """
    Topology: [node_a] ↔ [pump] ↔ [node_b]
              [node_a] ↔ [gate_valve] ↔ [node_b]
    """
    elements = [
        tank(),
        pump_("pump1", rated_head=20.0),
        el("na", "tee_junction"),
        el("nb", "tee_junction"),
        el("gv1", "gate_valve"),
    ]
    pipes = [
        pipe("p1", "na", "pump1"),
        pipe("p2", "pump1", "nb"),
        pipe("p3", "na", "gv1"),
        pipe("p4", "gv1", "nb"),
    ]
    m = meta(elements, pipes, pump_discharge_material_acknowledged=True)
    r = check_tank_pump_installation(m)
    assert any("✓" in d and "bypass" in d.lower() for d in r.detail)


def test_bypass_without_gate_valve_warns():
    """Bypass path exists but uses check_valve instead of gate_valve."""
    elements = [
        tank(),
        pump_("pump1", rated_head=20.0),
        el("na", "tee_junction"),
        el("nb", "tee_junction"),
        el("cv1", "check_valve"),
    ]
    pipes = [
        pipe("p1", "na", "pump1"),
        pipe("p2", "pump1", "nb"),
        pipe("p3", "na", "cv1"),
        pipe("p4", "cv1", "nb"),
    ]
    m = meta(elements, pipes, pump_discharge_material_acknowledged=True)
    r = check_tank_pump_installation(m)
    assert any("⚠" in d and "bypass" in d.lower() for d in r.detail)
