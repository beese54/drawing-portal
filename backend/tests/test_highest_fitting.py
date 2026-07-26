"""
HIGHEST_FITTING — "Highest Direct Supply Fitting" marker check.

Key behaviour under test:
- SKIP when no fitting is on direct supply (marker not required)
- FAIL when a direct-supply fitting exists but no marker is present
- PASS when exactly one marker is present
- FAIL when more than one marker is present
- This check does not itself validate the marker's declared elevation
"""

from tests.helpers import el, meta
from app.agents.highest_fitting_check import check_highest_direct_supply_fitting


def direct_fitting(id_="f1"):
    return el(id_, "basin_tap", node_type="water_fitting", supply_mode="direct_supply")


def indirect_fitting(id_="f1"):
    return el(id_, "basin_tap", node_type="water_fitting", supply_mode="indirect_supply")


def ambiguous_fitting(id_="f1"):
    """A water_fitting metadataBuilder.ts left with supply_mode=None — e.g. a dual-supply
    fitting whose ports disagree, or one unreached by the tank-BFS. Not confirmed indirect,
    so it must be treated the same as a direct-supply fitting by this check."""
    return el(id_, "basin_tap", node_type="water_fitting", supply_mode=None)


def marker(id_="hf1", elevation_m=22.5):
    return el(id_, "highest_direct_supply_fitting", highest_fitting_elevation_m=elevation_m)


# ---------------------------------------------------------------------------
# SKIP — no direct-supply fitting
# ---------------------------------------------------------------------------

def test_skip_no_direct_supply_fitting():
    r = check_highest_direct_supply_fitting(meta([indirect_fitting()]))
    assert r.status == "SKIP"


def test_skip_no_fittings_at_all():
    r = check_highest_direct_supply_fitting(meta([]))
    assert r.status == "SKIP"


# ---------------------------------------------------------------------------
# FAIL — direct supply present, no marker
# ---------------------------------------------------------------------------

def test_fail_direct_supply_no_marker():
    r = check_highest_direct_supply_fitting(meta([direct_fitting()]))
    assert r.status == "FAIL"
    assert "no" in r.summary.lower() or "0" in r.summary


def test_fail_ambiguous_supply_no_marker():
    """A mixed/unreached fitting (supply_mode=None) is not confirmed indirect, so it
    must still require the marker — regression test for the strict `== "direct_supply"`
    check that used to let this slip through as a SKIP."""
    r = check_highest_direct_supply_fitting(meta([ambiguous_fitting()]))
    assert r.status == "FAIL"


# ---------------------------------------------------------------------------
# PASS — exactly one marker
# ---------------------------------------------------------------------------

def test_pass_exactly_one_marker():
    r = check_highest_direct_supply_fitting(meta([direct_fitting(), marker()]))
    assert r.status == "PASS"
    assert "22.5" in r.summary


def test_pass_marker_elevation_not_set_yet():
    r = check_highest_direct_supply_fitting(meta([direct_fitting(), marker(elevation_m=None)]))
    assert r.status == "PASS"
    assert "not set" in r.summary.lower()


# ---------------------------------------------------------------------------
# FAIL — multiple markers
# ---------------------------------------------------------------------------

def test_fail_multiple_markers():
    r = check_highest_direct_supply_fitting(
        meta([direct_fitting(), marker("hf1", 22.5), marker("hf2", 24.0)])
    )
    assert r.status == "FAIL"
    assert "2" in r.summary
    assert len(r.issues) == 1
    assert set(r.issues[0]["element_ids"]) == {"hf1", "hf2"}
