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
# Pressure vessel — Rule 5 (auto-detected from schematic, no manual field)
# ---------------------------------------------------------------------------

def test_pressure_vessel_detected_passes():
    """A pressure_vessel_schematic symbol reachable from the pump auto-detects as present."""
    elements = [
        tank(),
        pump_("pump1", rated_head=20.0),
        el("na", "tee_junction"),
        el("pv1", "pressure_vessel_schematic"),
    ]
    pipes = [
        pipe("p1", "pump1", "na"),
        pipe("p2", "na", "pv1"),
    ]
    m = meta(elements, pipes, pump_discharge_material_acknowledged=True)
    r = check_tank_pump_installation(m)
    assert any("✓" in d and "pressure" in d.lower() and "vessel" in d.lower() for d in r.detail)


def test_pressure_vessel_far_from_pump_still_detected():
    """Vessel several fittings away through a manifold — no depth cap on the search."""
    elements = [
        tank(),
        pump_("pump1", rated_head=20.0),
        el("n1", "tee_junction"),
        el("n2", "elbow_bend"),
        el("n3", "check_valve"),
        el("n4", "tee_junction"),
        el("n5", "gate_valve"),
        el("pv1", "pressure_vessel_schematic"),
    ]
    pipes = [
        pipe("p1", "pump1", "n1"),
        pipe("p2", "n1", "n2"),
        pipe("p3", "n2", "n3"),
        pipe("p4", "n3", "n4"),
        pipe("p5", "n4", "n5"),
        pipe("p6", "n5", "pv1"),
    ]
    m = meta(elements, pipes, pump_discharge_material_acknowledged=True)
    r = check_tank_pump_installation(m)
    assert any("✓" in d and "pressure" in d.lower() and "vessel" in d.lower() for d in r.detail)


def test_pressure_vessel_absent_warns():
    """No pressure_vessel_schematic anywhere in the schematic — warns, doesn't fail or skip."""
    m = base_meta(extra_elements=[pump_("pump1", rated_head=20.0)])
    r = check_tank_pump_installation(m)
    assert any("⚠" in d and "pressure" in d.lower() and "vessel" in d.lower() for d in r.detail)


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
    """
    Bypass path exists but uses check_valve instead of gate_valve. Whether a
    bypass line is actually required is installation-dependent (LP/PE
    judgment call), so this is a WARN advisory, not a hard FAIL.
    """
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


def test_twin_pump_manifold_without_bypass_does_not_false_positive():
    """
    Twin duty pump manifold, both legs tied together at a shared inlet and
    outlet tee, with NO dedicated bypass line anywhere. Each pump's alternate
    path runs through the other leg (which has its own gate valves) — this
    must NOT be mistaken for a real bypass line around either pump.
    """
    elements = [
        tank(),
        el("tee_left", "tee_junction"),
        el("tee_right", "tee_junction"),
        el("gvA1", "gate_valve"),
        pump_("pumpA", rated_head=20.0),
        el("gvA2", "gate_valve"),
        el("gvB1", "gate_valve"),
        pump_("pumpB", rated_head=20.0),
        el("gvB2", "gate_valve"),
    ]
    pipes = [
        pipe("p1", "tee_left", "gvA1"),
        pipe("p2", "gvA1", "pumpA"),
        pipe("p3", "pumpA", "gvA2"),
        pipe("p4", "gvA2", "tee_right"),
        pipe("p5", "tee_left", "gvB1"),
        pipe("p6", "gvB1", "pumpB"),
        pipe("p7", "pumpB", "gvB2"),
        pipe("p8", "gvB2", "tee_right"),
    ]
    m = meta(elements, pipes, pump_discharge_material_acknowledged=True)
    r = check_tank_pump_installation(m)
    assert not any("✓" in d and "bypass" in d.lower() for d in r.detail)
    assert all("no bypass line detected" in d.lower() for d in r.detail if "bypass" in d.lower())
    assert all("⚠" in d for d in r.detail if "bypass" in d.lower())


def test_twin_pump_manifold_with_dedicated_bypass_passes():
    """
    Same twin-leg manifold, but with a real dedicated bypass line (check valve +
    normally-closed gate valve) connecting the inlet main directly to the outlet
    main, bypassing both pumps. Both pumps should report the bypass as detected.
    """
    elements = [
        tank(),
        el("tee_left", "tee_junction"),
        el("tee_right", "tee_junction"),
        el("gvA1", "gate_valve"),
        pump_("pumpA", rated_head=20.0),
        el("gvA2", "gate_valve"),
        el("gvB1", "gate_valve"),
        pump_("pumpB", rated_head=20.0),
        el("gvB2", "gate_valve"),
        el("bypass_cv", "check_valve"),
        el("bypass_gv", "gate_valve"),
    ]
    pipes = [
        pipe("p1", "tee_left", "gvA1"),
        pipe("p2", "gvA1", "pumpA"),
        pipe("p3", "pumpA", "gvA2"),
        pipe("p4", "gvA2", "tee_right"),
        pipe("p5", "tee_left", "gvB1"),
        pipe("p6", "gvB1", "pumpB"),
        pipe("p7", "pumpB", "gvB2"),
        pipe("p8", "gvB2", "tee_right"),
        pipe("p9", "tee_left", "bypass_cv"),
        pipe("p10", "bypass_cv", "bypass_gv"),
        pipe("p11", "bypass_gv", "tee_right"),
    ]
    m = meta(elements, pipes, pump_discharge_material_acknowledged=True)
    r = check_tank_pump_installation(m)
    bypass_lines = [d for d in r.detail if "[pump]" in d.lower() and "bypass" in d.lower()]
    assert len(bypass_lines) == 2
    assert all(d.startswith("✓") for d in bypass_lines)


def _port(index, x, y, connects_to=None):
    return {"index": index, "position": {"canvas_x": x, "canvas_y": y}, "connects_to_element_id": connects_to}


def test_bypass_detection_not_fooled_by_pump_footprint_proximity():
    """
    Real-world regression: a pump's two flanking flexible-connection elements
    sit close enough together (across the pump's small footprint) to trip
    graph_utils' port-proximity fallback and appear directly linked to each
    other — even though both are explicitly wired to the pump, not each other.
    That phantom link used to look like a valve-less "bypass" around every
    pump regardless of whether a real bypass line existed. Uses ports (not
    the pipe() helper) to reproduce the exact adjacency path that broke.
    """
    elements = [
        tank(),
        {**el("na", "tee_junction"), "ports": [
            _port(0, 0, 0, connects_to="flexA"),
        ]},
        {**pump_("pump1", rated_head=20.0), "ports": [
            _port(0, 51.5, 0, connects_to="flexA"),
            _port(1, 46.9, 0, connects_to="flexB"),
        ]},
        {**el("nb", "tee_junction"), "ports": [
            _port(0, 0, 0, connects_to="flexB"),
        ]},
        {**el("flexA", "flexible_connection"), "ports": [
            _port(0, 57.4, 0, connects_to=None),   # outward, wired via pipe to na
            _port(1, 51.4, 0, connects_to="pump1"),
        ]},
        {**el("flexB", "flexible_connection"), "ports": [
            _port(0, 47.4, 0, connects_to="pump1"),
            _port(1, 41.4, 0, connects_to=None),   # outward, wired via pipe to nb
        ]},
        el("gv1", "gate_valve"),
    ]
    pipes = [
        pipe("p1", "na", "flexA"),
        pipe("p2", "flexB", "nb"),
        pipe("p3", "na", "gv1"),
        pipe("p4", "gv1", "nb"),
    ]
    m = meta(elements, pipes, pump_discharge_material_acknowledged=True)
    r = check_tank_pump_installation(m)
    assert any("✓" in d and "bypass" in d.lower() for d in r.detail)


# ---------------------------------------------------------------------------
# Tank capacity adequacy — Rule 4b
# ---------------------------------------------------------------------------

def test_capacity_pass_meets_demand():
    """Effective capacity >= required 1-day demand — should produce a PASS detail line."""
    # 4 persons × 141 L = 564 L required; 600 L ≥ 564 L → PASS
    t = tank(occupants=4, effective_capacity_l=600, daily_demand_m3=0.564)
    r = check_tank_pump_installation(meta([t], pump_discharge_material_acknowledged=True))
    assert any("✓" in d and "effective capacity" in d.lower() for d in r.detail)


def test_capacity_fail_below_demand():
    """Effective capacity < required demand — should produce a FAIL detail line."""
    # 10 persons × 141 L = 1410 L required; 500 L < 1410 L → FAIL
    t = tank(occupants=10, effective_capacity_l=500, daily_demand_m3=1.41)
    r = check_tank_pump_installation(meta([t], pump_discharge_material_acknowledged=True))
    assert r.status == "FAIL"
    assert any("✗" in d and "effective capacity" in d.lower() for d in r.detail)


def test_capacity_warn_oversized():
    """Effective capacity > 120% of required demand — warns about oversizing."""
    # 4 persons × 141 L = 564 L required; 120% = 677 L; 900 L > 677 L → WARN
    t = tank(occupants=4, effective_capacity_l=900, daily_demand_m3=0.564)
    r = check_tank_pump_installation(meta([t], pump_discharge_material_acknowledged=True))
    assert any("⚠" in d and "120%" in d for d in r.detail)
