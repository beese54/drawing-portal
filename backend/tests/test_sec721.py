"""
SEC721 — Water Efficiency (MWELS, Handbook 7.2.1)

Key behaviour under test:
- Backend now finds MWELS elements by checking "fitting_type" in element dict
  (exported by frontend for all symbols in FIXTURE_MWELS_CATEGORY).
- Elements without the fitting_type key are NOT included — even if they are water fittings.
- Appliances (fitting_type in NON_MWELS_FITTING_IDS) appear as "not subject to MWELS" rows.
- fitting_type: None means ambiguous fixture needing user selection → WARN.
"""

import pytest
from tests.helpers import el, meta
from app.agents.compliance_checks import check_water_efficiency


def mwels_el(id_, sym, fitting_type, ticks=None, **kw):
    """Element with fitting_type key present (as the frontend exports for MWELS fixtures)."""
    return el(id_, sym, fitting_type=fitting_type, efficiency_rating=ticks, **kw)


# ---------------------------------------------------------------------------
# SKIP
# ---------------------------------------------------------------------------

def test_skip_no_mwels_elements():
    """Elements without a fitting_type key are not MWELS fixtures."""
    m = meta([el("p1", "pump")])
    r = check_water_efficiency(m)
    assert r.status == "SKIP"


def test_skip_tap_point_not_in_mwels():
    """tap_point_schematic is a water_fitting but not MWELS — frontend doesn't export fitting_type for it."""
    m = meta([el("t1", "tap_point_schematic", node_type="water_fitting")])
    r = check_water_efficiency(m)
    assert r.status == "SKIP"


# ---------------------------------------------------------------------------
# PASS
# ---------------------------------------------------------------------------

def test_pass_shower_head_2_ticks():
    m = meta([mwels_el("s1", "shower_head", "shower_tap", ticks=2)])
    r = check_water_efficiency(m)
    assert r.status == "PASS"
    assert r.table is not None
    assert r.table[0]["compliant"] is True


def test_pass_shower_head_3_ticks():
    m = meta([mwels_el("s1", "shower_head", "shower_tap", ticks=3)])
    r = check_water_efficiency(m)
    assert r.status == "PASS"


def test_pass_multiple_fixtures_all_compliant():
    elements = [
        mwels_el("s1", "shower_head", "shower_tap", ticks=2),
        mwels_el("b1", "wash_basin_rectangular", "basin_tap", ticks=3),
        mwels_el("wc1", "water_closet", "dual_flushing_cistern", ticks=2),
    ]
    r = check_water_efficiency(meta(elements))
    assert r.status == "PASS"
    assert all(row["compliant"] is True for row in r.table if row["compliant"] is not None)


# ---------------------------------------------------------------------------
# FAIL
# ---------------------------------------------------------------------------

def test_fail_1_tick_below_minimum():
    m = meta([mwels_el("s1", "shower_head", "shower_tap", ticks=1)])
    r = check_water_efficiency(m)
    assert r.status == "FAIL"
    assert r.table[0]["compliant"] is False


# ---------------------------------------------------------------------------
# WARN — missing data
# ---------------------------------------------------------------------------

def test_warn_no_tick_rating_set():
    m = meta([mwels_el("s1", "shower_head", "shower_tap", ticks=None)])
    r = check_water_efficiency(m)
    assert r.status == "WARN"
    assert r.table[0]["compliant"] is None


def test_warn_ambiguous_fitting_type_none():
    """Frontend exports fitting_type=None for ambiguous fixtures (e.g. wash basin before user picks)."""
    m = meta([mwels_el("b1", "wash_basin_rectangular", fitting_type=None, ticks=None)])
    r = check_water_efficiency(m)
    assert r.status == "WARN"
    assert r.table[0]["compliant"] is None


# ---------------------------------------------------------------------------
# Appliance fittings — not subject to MWELS (Section 6 instead)
# ---------------------------------------------------------------------------

def test_appliance_dishwasher_skipped_in_mwels():
    """dishwasher has fitting_type='dishwasher' → appears as 'not subject to MWELS' row, not a fail."""
    m = meta([mwels_el("d1", "dishwasher", "dishwasher", ticks=None)])
    r = check_water_efficiency(m)
    # Not FAIL — appliance row is informational only
    assert r.status in ("PASS", "WARN", "SKIP")
    assert r.table is not None
    appliance_row = next((row for row in r.table if row.get("note") and "not subject to mwels" in row["note"].lower()), None)
    assert appliance_row is not None, "Expected 'not subject to MWELS' note for dishwasher"


def test_appliance_washing_machine_skipped_in_mwels():
    m = meta([mwels_el("wm1", "washing_machine", "washing_machine", ticks=None)])
    r = check_water_efficiency(m)
    assert r.table is not None
    appliance_row = next((row for row in r.table if row.get("note") and "not subject to mwels" in row["note"].lower()), None)
    assert appliance_row is not None


# ---------------------------------------------------------------------------
# Mixed: one compliant, one non-compliant
# ---------------------------------------------------------------------------

def test_fail_mixed_compliant_and_non_compliant():
    elements = [
        mwels_el("s1", "shower_head", "shower_tap", ticks=2),   # PASS
        mwels_el("b1", "wash_basin_rectangular", "basin_tap", ticks=1),  # FAIL
    ]
    r = check_water_efficiency(meta(elements))
    assert r.status == "FAIL"
    assert any(row["compliant"] is True for row in r.table)
    assert any(row["compliant"] is False for row in r.table)
