"""
compliance_checks.py — Deterministic regulatory compliance checks for water schematics.

Four checks:
    REG28      — Regulation 28: backflow prevention (check valve upstream of water heater)
    SEC221     — Handbook 2.2.1: mode of supply based on height of highest fitting above AMSL
    SEC721     — Handbook 7.2.1: Mandatory Water Efficiency Labelling Scheme (MWELS) compliance
    TANK_PUMP  — Tank / pump installation requirements (PUB / SS 245 / SS 636)
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any


# ---------------------------------------------------------------------------
# Result dataclass
# ---------------------------------------------------------------------------

@dataclass
class CheckResult:
    check_id: str                         # "REG28", "SEC221", "SEC721"
    title: str
    status: str                           # "PASS" | "FAIL" | "WARN" | "SKIP"
    summary: str                          # one-sentence verdict
    detail: list[str]                     # bullet-point details
    table: list[dict] | None = None       # WELS rows for check3; None otherwise
    elements_of_interest: list[dict] = field(default_factory=list)
    # Each entry: {element_id, label, color}  — canvas_x/y resolved by caller


# ---------------------------------------------------------------------------
# MWELS lookup table (Handbook 7.2.1, confirmed from PDF)
# ---------------------------------------------------------------------------

MWELS: dict[str, dict] = {
    "shower_tap": {
        "name": "Shower Tap & Mixer",
        "unit": "L/min",
        "2": 7.0,   # max flow at 2-tick
        "3": 5.0,   # max flow at 3-tick
    },
    "basin_tap": {
        "name": "Basin Tap & Mixer",
        "unit": "L/min",
        "2": 4.0,
        "3": 2.0,
    },
    "sink_tap": {
        "name": "Sink/Bib Tap & Mixer",
        "unit": "L/min",
        "2": 6.0,
        "3": 4.0,
    },
    "dual_flushing_cistern": {
        "name": "Dual-Flush Cistern",
        "unit": "L/flush",
        "2": 4.0,
        "3": 3.5,
    },
    "urinal_flush": {
        "name": "Urinal Flush Valve",
        "unit": "L/flush",
        "2": 1.0,
        "3": 0.5,
    },
    "water_closet": {
        "name": "WC Flush Valve",
        "unit": "L/flush",
        "2": 4.0,
        "3": 3.5,
    },
}

# Flow-rate fittings (vs. flush-volume fittings) — used for demand summation
FLOW_RATE_FITTING_IDS = {"shower_tap", "basin_tap", "sink_tap"}

# Fittings that are not subject to MWELS (Section 6 appliances) — skipped in WELS check
NON_MWELS_FITTING_IDS = {"dishwasher", "water_dispenser", "washing_machine", "landscape_tap"}

# Dedicated fixture symbols that carry an MWELS rating.
# Value is the fixed category string, or None when the user must pick basin_tap / sink_tap.
FIXTURE_MWELS_SYMBOLS: dict[str, str | None] = {
    "shower_head":            "shower_tap",
    "multiple_shower_unit":   "shower_tap",
    "shower_bath":            "shower_tap",
    "wash_basin_rectangular": "basin_tap",
    "sink":                   "sink_tap",
    "water_closet":           "dual_flushing_cistern",
    "urinal_wall_hung":       "urinal_flush",
    "single_tap":             None,
    "twin_tap":               None,
    "single_tap_combined":    None,
}

# Design demand (L/s) for network solver — use 2-tick max converted to L/s
MWELS_DEMAND_LPS: dict[str, float] = {
    "shower_tap":            7.0 / 60,
    "basin_tap":             4.0 / 60,
    "sink_tap":              6.0 / 60,
    "dual_flushing_cistern": 4.0 / 60,   # flush volume / assumed 1 min flush cycle
    "urinal_flush":          1.0 / 60,
    "water_closet":          4.0 / 60,
    # Section 6 appliance fittings — design demand estimates
    "dishwasher":            12.0 / 60,
    "water_dispenser":       3.0 / 60,
    "washing_machine":       12.0 / 60,
    "landscape_tap":         9.0 / 60,
}
DEFAULT_DEMAND_LPS = 0.1   # fallback if fitting type unknown


# ---------------------------------------------------------------------------
# Check 1 — Regulation 28: backflow prevention
# ---------------------------------------------------------------------------

def check_backflow_prevention(metadata: dict[str, Any]) -> CheckResult:
    """
    Reg 28(1): A water heater must have a check valve installed on its inlet
    to prevent backflow from the hot water apparatus to the mains supply.

    Uses a topology-based BFS (ignoring flow direction) so that the check
    works correctly regardless of how the water heater or check valve is
    rotated or oriented on the canvas.
    """
    elements: list[dict] = metadata.get("elements", [])
    pipes: list[dict] = metadata.get("pipes", [])

    elem_by_id: dict[str, dict] = {e["id"]: e for e in elements}

    # Build a bidirectional adjacency map from ALL pipe endpoints,
    # regardless of flow direction.  This handles reversed / rotated symbols.
    adjacency: dict[str, set[str]] = {}
    for p in pipes:
        endpoints: list[str | None] = [
            p.get("flow_from_element_id"),
            p.get("flow_to_element_id"),
            p.get("start_connects_to"),
            p.get("end_connects_to"),
        ]
        # Collect the distinct, non-null element IDs this pipe touches
        connected: list[str] = list({e for e in endpoints if e})
        for a in connected:
            for b in connected:
                if a != b:
                    adjacency.setdefault(a, set()).add(b)

    # Also add adjacency from element connected_pipe_ids for robustness
    for el in elements:
        el_id = el["id"]
        for pipe_id in el.get("connected_pipe_ids", []):
            pipe = next((p for p in pipes if p["id"] == pipe_id), None)
            if pipe:
                for other_field in ("flow_from_element_id", "flow_to_element_id",
                                    "start_connects_to", "end_connects_to"):
                    other_id = pipe.get(other_field)
                    if other_id and other_id != el_id:
                        adjacency.setdefault(el_id, set()).add(other_id)
                        adjacency.setdefault(other_id, set()).add(el_id)

    # Add adjacency from port-position proximity — handles symbols placed directly
    # adjacent (touching ports) with no pipe drawn between them.
    # Two elements are considered topologically connected if any port of element A
    # shares the same canvas position (within 5 px) as any port of element B.
    PORT_PROXIMITY_THRESHOLD_SQ = 5 ** 2  # squared px, avoids sqrt
    for i, el_a in enumerate(elements):
        ports_a = el_a.get("ports", [])
        for el_b in elements[i + 1:]:
            ports_b = el_b.get("ports", [])
            linked = False
            for pa in ports_a:
                if linked:
                    break
                pos_a = pa.get("position", {})
                ax, ay = pos_a.get("canvas_x", None), pos_a.get("canvas_y", None)
                if ax is None:
                    continue
                for pb in ports_b:
                    pos_b = pb.get("position", {})
                    bx, by = pos_b.get("canvas_x", None), pos_b.get("canvas_y", None)
                    if bx is None:
                        continue
                    if (ax - bx) ** 2 + (ay - by) ** 2 <= PORT_PROXIMITY_THRESHOLD_SQ:
                        adjacency.setdefault(el_a["id"], set()).add(el_b["id"])
                        adjacency.setdefault(el_b["id"], set()).add(el_a["id"])
                        linked = True
                        break

    heaters = [e for e in elements if e.get("symbol_id") == "water_heater"]

    if not heaters:
        return CheckResult(
            check_id="REG28",
            title="Backflow Prevention (Water Heater)",
            status="SKIP",
            summary="No water heater found in schematic.",
            detail=["Add a water heater symbol to the schematic to enable this check."],
        )

    all_pass = True
    details: list[str] = []
    elements_of_interest: list[dict] = []

    for heater in heaters:
        heater_id = heater["id"]
        heater_name = heater.get("symbol_name", "Water Heater")

        # BFS over topology (direction-agnostic) — up to 8 hops
        visited: set[str] = set()
        queue: list[tuple[str, int]] = [(heater_id, 0)]
        check_valve_found_at: int | None = None
        check_valve_id: str | None = None

        while queue:
            current_id, dist = queue.pop(0)
            if current_id in visited:
                continue
            visited.add(current_id)

            if dist > 0:  # don't count the heater itself
                current_el = elem_by_id.get(current_id)
                if current_el and current_el.get("symbol_id") == "check_valve":
                    check_valve_found_at = dist
                    check_valve_id = current_id
                    break

            if dist >= 8:
                continue

            # Follow all topologically adjacent elements (ignores port orientation)
            for neighbor_id in adjacency.get(current_id, set()):
                if neighbor_id not in visited:
                    queue.append((neighbor_id, dist + 1))

        if check_valve_found_at is not None:
            color = "blue" if check_valve_found_at == 1 else "orange"
            position_label = "immediately upstream" if check_valve_found_at == 1 else f"{check_valve_found_at} hops upstream"
            details.append(
                f"✓ {heater_name}: Check valve found {position_label} (recommended: immediately adjacent)."
            )
            elements_of_interest.append({
                "element_id": heater_id,
                "label": "Water Heater",
                "color": color,
            })
            if check_valve_id:
                elements_of_interest.append({
                    "element_id": check_valve_id,
                    "label": "Check Valve",
                    "color": "green",
                })
            if check_valve_found_at > 1:
                all_pass = False
                details.append(
                    f"  ⚠ Recommend moving check valve to directly before the water heater inlet."
                )
        else:
            all_pass = False
            details.append(
                f"✗ {heater_name}: No check valve found upstream. "
                "Reg 28(1) requires a check valve on the inlet to prevent backflow."
            )
            elements_of_interest.append({
                "element_id": heater_id,
                "label": "Missing check valve!",
                "color": "red",
            })

    if all_pass:
        status = "PASS"
        summary = "All water heaters have a check valve on their inlet — Reg 28(1) satisfied."
    elif any("No check valve" in d for d in details):
        status = "FAIL"
        summary = "One or more water heaters are missing a check valve on the inlet — Reg 28(1) violation."
    else:
        status = "WARN"
        summary = "Check valves present but not immediately adjacent to water heater inlets — review positioning."

    return CheckResult(
        check_id="REG28",
        title="Backflow Prevention (Water Heater)",
        status=status,
        summary=summary,
        detail=details,
        elements_of_interest=elements_of_interest,
    )


# ---------------------------------------------------------------------------
# Check 2 — Handbook 2.2.1: mode of supply
# ---------------------------------------------------------------------------

_SUPPLY_MODE_TABLE = [
    (25.0, "direct",        "Direct supply from PUB mains (≤ 25 m AMSL)."),
    (37.0, "indirect_tank", "Indirect supply via high-level water storage tank (> 25 m, ≤ 37 m AMSL)."),
    (float("inf"), "mode_c", "Indirect supply — Mode C: low-level transfer tank + pump to high-level tank (> 37 m AMSL)."),
]


def check_supply_mode(metadata: dict[str, Any]) -> CheckResult:
    """
    Handbook 2.2.1: Mode of supply based on the absolute AMSL elevation of the
    highest fitting.  Thresholds applied directly to the elevation_m values:
        ≤ 25 m  → direct supply from PUB mains
        > 25 m and ≤ 37 m → indirect via high-level water storage tank
        > 37 m  → Mode C (low-level transfer tank + pump)
    """
    elements: list[dict] = metadata.get("elements", [])

    # Find the highest water_fittings elevation; fall back to all elements
    fitting_elevations = [
        e["elevation_m"] for e in elements
        if e.get("symbol_id") == "water_fittings" and e.get("elevation_m") is not None
    ]
    all_elevations = [
        e["elevation_m"] for e in elements if e.get("elevation_m") is not None
    ]

    if not all_elevations:
        return CheckResult(
            check_id="SEC221",
            title="Mode of Supply",
            status="SKIP",
            summary="No elevation data found in schematic.",
            detail=["Set the MRL bounds on the canvas to enable elevation-based checks."],
        )

    use_fitting = bool(fitting_elevations)
    elevations = fitting_elevations if use_fitting else all_elevations
    highest_m = max(elevations)
    lowest_m = min(elevations)
    elevation_source = "water fittings" if use_fitting else "all elements"

    # Determine required mode from absolute elevation
    required_mode = "mode_c"
    required_description = _SUPPLY_MODE_TABLE[-1][2]
    for threshold, mode_key, description in _SUPPLY_MODE_TABLE:
        if highest_m <= threshold:
            required_mode = mode_key
            required_description = description
            break

    # Check actual schematic configuration
    has_tank   = any(e.get("symbol_id") == "water_tank" for e in elements)
    has_pump   = any(e.get("symbol_id") == "pump" for e in elements)
    has_indirect = any(e.get("supply_mode") == "indirect_supply" for e in elements)

    details: list[str] = [
        f"Highest fitting elevation: {highest_m:.1f} m AMSL (from {elevation_source}).",
        f"Lowest fitting elevation: {lowest_m:.1f} m AMSL.",
        f"Required supply mode: {required_description}",
        "",
        "Schematic configuration:",
        f"  Water tank present: {'Yes' if has_tank else 'No'}",
        f"  Pump present: {'Yes' if has_pump else 'No'}",
        f"  Indirect supply elements found: {'Yes' if has_indirect else 'No'}",
    ]

    if required_mode == "direct":
        if has_indirect:
            status = "WARN"
            summary = f"Direct supply sufficient at {highest_m:.1f} m AMSL, but indirect supply elements detected — verify intent."
            details.append("⚠ Indirect supply elements found, but direct supply is sufficient at this elevation.")
        else:
            status = "PASS"
            summary = f"Direct supply from PUB mains is appropriate for highest fitting at {highest_m:.1f} m AMSL."

    elif required_mode == "indirect_tank":
        if not has_tank:
            status = "FAIL"
            summary = f"Highest fitting at {highest_m:.1f} m AMSL requires indirect supply via water storage tank — no tank found."
            details.append("✗ Water storage tank required but not present in schematic.")
        elif not has_indirect:
            status = "WARN"
            summary = f"Water tank present, but supply mode classification shows no indirect supply path — check connections."
            details.append("⚠ Water tank present, but no elements classified as indirect supply. Verify pipe connections.")
        else:
            status = "PASS"
            summary = f"Indirect supply via water storage tank is correctly configured for {highest_m:.1f} m AMSL."

        # Additional check: tank inlet must be at or below 37 m AMSL (PUB requirement).
        # A waiver is required if the inlet exceeds 37 m — this must be handled administratively.
        tanks = [e for e in elements if e.get("symbol_id") == "water_tank"]
        for tank in tanks:
            tp = tank.get("tank_properties") or {}
            inlet_amsl = tp.get("inlet_pipe_m_amsl")
            tank_name = tank.get("symbol_name", "Water Tank")
            if inlet_amsl is None:
                details.append(
                    f"– [{tank_name}] Tank inlet level not set — cannot verify ≤ 37 m AMSL requirement. "
                    "Enter the inlet pipe level in Advanced Details."
                )
            elif inlet_amsl > 37.0:
                details.append(
                    f"✗ [{tank_name}] Tank inlet at {inlet_amsl:.1f} m AMSL exceeds the 37 m AMSL limit. "
                    "A PUB waiver is required for inlets above 37 m AMSL."
                )
                status = "FAIL"
                summary = (
                    f"[{tank_name}] Tank inlet at {inlet_amsl:.1f} m AMSL exceeds the 37 m AMSL maximum — "
                    "a PUB waiver is required."
                )
            else:
                details.append(
                    f"✓ [{tank_name}] Tank inlet at {inlet_amsl:.1f} m AMSL is at or below 37 m AMSL — compliant."
                )

    else:  # mode_c
        missing = []
        if not has_tank:
            missing.append("water storage tank")
        if not has_pump:
            missing.append("pump")
        if missing:
            status = "FAIL"
            summary = f"Highest fitting at {highest_m:.1f} m AMSL requires Mode C supply — missing: {', '.join(missing)}."
            details.append(f"✗ Mode C requires a low-level transfer tank AND a pump. Missing: {', '.join(missing)}.")
        else:
            status = "PASS"
            summary = f"Mode C supply (tank + pump) is present for {highest_m:.1f} m AMSL."

    return CheckResult(
        check_id="SEC221",
        title="Mode of Supply",
        status=status,
        summary=summary,
        detail=details,
    )


# ---------------------------------------------------------------------------
# Check 3 — Handbook 7.2.1: MWELS water efficiency
# ---------------------------------------------------------------------------

def check_water_efficiency(metadata: dict[str, Any]) -> CheckResult:
    """
    Handbook 7.2.1: All water fittings must be labelled under PUB's
    Mandatory Water Efficiency Labelling Scheme (MWELS).
    Minimum 2-tick rating required (from 1 April 2019).

    Covers both the generic water_fittings symbol and dedicated fixture
    symbols (shower_head, wash_basin_rectangular, water_closet, etc.).
    """
    elements: list[dict] = metadata.get("elements", [])

    mwels_els = [
        e for e in elements
        if e.get("symbol_id") == "water_fittings"
        or e.get("symbol_id") in FIXTURE_MWELS_SYMBOLS
    ]

    if not mwels_els:
        return CheckResult(
            check_id="SEC721",
            title="Water Efficiency (MWELS)",
            status="SKIP",
            summary="No water fittings found in schematic.",
            detail=["Add water fittings (taps, WC, showers, etc.) to the schematic to enable this check."],
        )

    rows: list[dict] = []
    any_fail = False
    any_missing_data = False
    total_flow_lpm = 0.0

    for el in mwels_els:
        el_id   = el["id"]
        sym_id  = el.get("symbol_id", "")
        is_fixture = sym_id in FIXTURE_MWELS_SYMBOLS

        # Resolve fitting_type: fixtures have a fixed category (or user-chosen for ambiguous ones)
        if is_fixture:
            fixed_category = FIXTURE_MWELS_SYMBOLS[sym_id]
            fitting_type = fixed_category or el.get("fitting_type")
        else:
            fitting_type = el.get("fitting_type")

        ticks = el.get("efficiency_rating")

        # Appliance fittings (Section 6) are not MWELS-rated — skip
        if fitting_type in NON_MWELS_FITTING_IDS:
            rows.append({
                "element_id": el_id,
                "name": fitting_type.replace("_", " ").title() if fitting_type else "Appliance",
                "ticks": None,
                "design_flow": None,
                "unit": "—",
                "compliant": None,
                "note": "Not subject to MWELS — appliance fitting (Section 6 check valve required instead).",
            })
            continue

        symbol_name = el.get("symbol_name", sym_id.replace("_", " ").title())

        # Missing fitting type (ambiguous fixture with no user selection yet)
        if fitting_type is None:
            any_missing_data = True
            rows.append({
                "element_id": el_id,
                "name": symbol_name,
                "ticks": None,
                "design_flow": None,
                "unit": "—",
                "compliant": None,
                "note": f"Click [{symbol_name}] on the canvas to select its fitting type, then re-export.",
            })
            continue

        # Missing tick rating
        if ticks is None:
            any_missing_data = True
            rows.append({
                "element_id": el_id,
                "name": symbol_name,
                "ticks": None,
                "design_flow": None,
                "unit": "—",
                "compliant": None,
                "note": f"Click [{symbol_name}] on the canvas to set its MWELS tick rating, then re-export.",
            })
            continue

        mwels_entry = MWELS.get(fitting_type)
        if mwels_entry is None:
            any_missing_data = True
            rows.append({
                "element_id": el_id,
                "name": symbol_name,
                "ticks": ticks,
                "design_flow": None,
                "unit": "—",
                "compliant": None,
                "note": f"Fitting type '{fitting_type}' not in MWELS table.",
            })
            continue

        tick_key = str(ticks) if str(ticks) in mwels_entry else "2"
        design_flow = mwels_entry[tick_key]
        compliant = ticks >= 2

        if not compliant:
            any_fail = True

        if fitting_type in FLOW_RATE_FITTING_IDS:
            total_flow_lpm += design_flow

        rows.append({
            "element_id": el_id,
            "name": mwels_entry["name"],
            "ticks": ticks,
            "design_flow": design_flow,
            "unit": mwels_entry["unit"],
            "compliant": compliant,
            "note": None,
        })

    # Build details list
    compliant_count = sum(1 for r in rows if r.get("compliant") is True)
    non_compliant   = [r for r in rows if r.get("compliant") is False]
    missing_count   = sum(1 for r in rows if r.get("compliant") is None)

    details: list[str] = [
        f"Total MWELS fittings: {len(mwels_els)}",
        f"Compliant (≥ 2 ticks): {compliant_count}",
    ]
    if non_compliant:
        details.append(f"Non-compliant (< 2 ticks): {len(non_compliant)}")
        for r in non_compliant:
            details.append(f"  ✗ {r['name']}: {r['ticks']} tick(s) — minimum 2 required (PUB, from 1 Apr 2019).")
    if missing_count:
        details.append(
            f"Missing data: {missing_count} fitting(s) — click each fixture on the canvas to set its MWELS tick rating."
        )
    if total_flow_lpm > 0:
        details.append(f"Total design flow demand (flow-rate fittings): {total_flow_lpm:.1f} L/min")
    details.append("")
    details.append("Reference: PUB Handbook on Application for Water Supply 2022, Section 7.2.1.")

    if any_fail:
        status = "FAIL"
        summary = "One or more water fittings do not meet the minimum 2-tick MWELS rating."
    elif any_missing_data and compliant_count == 0:
        status = "WARN"
        summary = "Water fittings found but tick ratings not set — click each fixture to configure, then re-export."
    elif any_missing_data:
        status = "WARN"
        summary = "Some fittings compliant, but others are missing tick rating data — check incomplete."
    else:
        status = "PASS"
        summary = f"All {compliant_count} water fitting(s) meet the MWELS 2-tick minimum requirement."

    return CheckResult(
        check_id="SEC721",
        title="Water Efficiency (MWELS)",
        status=status,
        summary=summary,
        detail=details,
        table=rows,
    )
