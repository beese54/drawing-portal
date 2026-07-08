"""
tank_pump_check.py — Tank / pump installation compliance check (PUB / SS 245 / SS 636).
"""

from __future__ import annotations
from typing import Any
from app.agents.compliance_checks import CheckResult
from app.agents.graph_utils import build_adjacency

PUB_APPROVED_MATERIALS = {"FRP", "GRP", "SS_316", "RC"}


# ---------------------------------------------------------------------------
# Bypass-line topology checker
# ---------------------------------------------------------------------------


def _find_path_excluding(
    adj: dict[str, set[str]],
    start: str,
    end: str,
    exclude: set[str],
) -> list[str] | None:
    """DFS: find any simple path from start → end that avoids nodes in exclude."""
    stack: list[tuple[str, list[str]]] = [(start, [start])]
    visited: set[str] = set()
    while stack:
        node, path = stack.pop()
        if node == end:
            return path
        if node in visited or node in exclude:
            continue
        visited.add(node)
        for nbr in adj.get(node, []):
            if nbr not in visited:
                stack.append((nbr, path + [nbr]))
    return None


def _check_bypass_line(elements: list[dict], pipes: list[dict]) -> list[str]:
    """
    Detect whether a bypass line with a gate valve exists around each pump.

    Returns one result line per pump (starting with ✓, ⚠, or –).
    """
    pumps = [e for e in elements if e.get("symbol_id") == "pump"]
    if not pumps:
        return [
            "⚠ Bypass line: No pump detected — if a booster pump is part of this installation, "
            "a bypass line with a normally-closed gate valve is required. Add the pump to the schematic."
        ]

    elem_by_id = {e["id"]: e for e in elements}
    adj = build_adjacency(elements, pipes)
    results: list[str] = []

    # A legitimate bypass line routes around a pump without needing another pump to
    # get from one side to the other — so every pump is excluded from every search,
    # not just the one currently being tested. Otherwise, in a twin/multi-pump
    # manifold, the parallel duty leg (with its own gate valves) looks like a valid
    # "bypass" for its neighbor, which is a false positive.
    all_pump_ids = {p["id"] for p in pumps}

    for pump in pumps:
        pump_id = pump["id"]
        pump_name = pump.get("symbol_name", "Pump")
        neighbors = list(adj.get(pump_id, []))

        if len(neighbors) < 2:
            results.append(
                f"– [{pump_name}] Pump has fewer than 2 pipe connections — "
                f"bypass topology cannot be verified. Ensure the pump inlet and outlet are both piped."
            )
            continue

        found_bypass = False
        has_gate_valve = False
        for i in range(len(neighbors)):
            for j in range(i + 1, len(neighbors)):
                src, dst = neighbors[i], neighbors[j]
                bypass_path = _find_path_excluding(adj, src, dst, all_pump_ids)
                if bypass_path is None:
                    continue
                found_bypass = True
                for node_id in bypass_path:
                    el = elem_by_id.get(node_id, {})
                    if el.get("symbol_id") == "gate_valve":
                        has_gate_valve = True
                        break
                if has_gate_valve:
                    break
            if has_gate_valve:
                break

        if found_bypass and has_gate_valve:
            results.append(
                f"✓ [{pump_name}] Bypass line with gate valve detected — "
                f"ensure the bypass valve is in the normally-closed position during normal operation."
            )
        elif found_bypass:
            results.append(
                f"⚠ [{pump_name}] Bypass path detected but no gate valve found on the bypass line — "
                f"a normally-closed gate valve must be installed on all pump bypass lines."
            )
        else:
            results.append(
                f"⚠ [{pump_name}] No bypass line detected — "
                f"a bypass line with a normally-closed gate valve is required around the pump."
            )

    return results


# ---------------------------------------------------------------------------
# Main check
# ---------------------------------------------------------------------------

def check_tank_pump_installation(metadata: dict[str, Any]) -> CheckResult:
    """
    Tank / Pump Installation checks derived from PUB requirements and SS 245/636.

    Per-tank sub-checks:
      1. Overflow pipe diameter > inlet pipe diameter (one size larger)
      2. Warning pipe/alarm >= 50 mm below overflow level
      3. Normal water level >= 25 mm below warning level
      4. Outlet-to-base distance between 75 mm and 100 mm
      5. Pressure vessel present (advisory)
      6. Tank material is PUB-approved (SS 636)
      7. Sunken/detention tank noted if flagged

    System sub-checks:
      8. Pump discharge pipes must not be plastic (PVC/uPVC) — advisory reminder
      9. Bypass line with normally-closed gate valve — topology check
     10. Terminal fittings ≤ 35 m pump head — LP/PE acknowledgment
    """
    elements: list[dict] = metadata.get("elements", [])
    pipes: list[dict] = metadata.get("pipes", [])

    tanks = [e for e in elements if e.get("symbol_id") == "water_tank"]

    if not tanks:
        return CheckResult(
            check_id="TANK_PUMP",
            title="Adequacy of Supply & Tank / Pump Installation",
            status="SKIP",
            summary="No water tank found in schematic — check skipped.",
            detail=["This check applies only when a water tank is present."],
        )

    detail: list[str] = []
    sub_statuses: list[str] = []
    skipped_critical: list[str] = []
    pipe_by_id = {p["id"]: p for p in pipes}

    for idx, tank in enumerate(tanks, start=1):
        tp: dict = tank.get("tank_properties") or {}
        name = tank.get("symbol_name", "Water Tank")
        label = name if len(tanks) == 1 else f"{name} {idx}"
        detail.append(f"## {label}")

        overflow_d      = tp.get("overflow_pipe_diameter_m")
        inlet_d         = tp.get("inlet_pipe_diameter_m")
        overflow_amsl   = tp.get("overflow_pipe_m_amsl")
        warning_amsl    = tp.get("warning_pipe_m_amsl")
        inlet_amsl      = tp.get("inlet_pipe_m_amsl")
        outlet_to_base  = tp.get("distance_outlet_to_base_m")
        material        = tp.get("material")
        pressure_vessel = tp.get("pressure_vessel_present")
        is_sunken       = tp.get("is_sunken_tank")

        # Rule 1: overflow diameter > inlet diameter
        if overflow_d is not None and inlet_d is not None:
            if overflow_d > inlet_d:
                detail.append(
                    f"✓ [{name}] Overflow pipe ({overflow_d*1000:.0f} mm) is larger than "
                    f"inlet pipe ({inlet_d*1000:.0f} mm)."
                )
                sub_statuses.append("PASS")
            else:
                detail.append(
                    f"✗ [{name}] Overflow pipe ({overflow_d*1000:.0f} mm) must be at least "
                    f"one size larger than inlet pipe ({inlet_d*1000:.0f} mm)."
                )
                sub_statuses.append("FAIL")
        else:
            detail.append(f"– [{name}] Overflow/inlet pipe diameters not set — overflow size check skipped.")

        # Rule 2: warning pipe >= 50 mm below overflow level
        if overflow_amsl is not None and warning_amsl is not None:
            gap_mm = (overflow_amsl - warning_amsl) * 1000
            if gap_mm >= 50:
                detail.append(
                    f"✓ [{name}] Warning pipe is {gap_mm:.0f} mm below overflow level (≥ 50 mm required)."
                )
                sub_statuses.append("PASS")
            else:
                detail.append(
                    f"✗ [{name}] Warning pipe is only {gap_mm:.0f} mm below overflow level "
                    f"(minimum 50 mm required)."
                )
                sub_statuses.append("FAIL")
        else:
            detail.append(
                f"– [{name}] Warning pipe / overflow pipe levels not set — 50 mm gap check skipped."
                f" Please enter Warning Pipe Level and Overflow Pipe Level in Advanced Details."
            )
            skipped_critical.append(f"[{name}] Warning pipe / overflow pipe levels")

        # Rule 3: water level >= 25 mm below warning level
        if inlet_amsl is not None and overflow_d is not None and warning_amsl is not None:
            water_level = inlet_amsl - overflow_d - 0.075
            gap_mm = (warning_amsl - water_level) * 1000
            if gap_mm >= 25:
                detail.append(
                    f"✓ [{name}] Normal water level is {gap_mm:.0f} mm below warning level "
                    f"(≥ 25 mm required)."
                )
                sub_statuses.append("PASS")
            else:
                detail.append(
                    f"✗ [{name}] Normal water level is only {gap_mm:.0f} mm below warning level "
                    f"(minimum 25 mm required)."
                )
                sub_statuses.append("FAIL")
        else:
            detail.append(
                f"– [{name}] Inlet AMSL, overflow diameter, or warning level not set — 25 mm gap check skipped."
                f" Please enter Inlet Pipe Level, Overflow Pipe Diameter, and Warning Pipe Level."
            )
            skipped_critical.append(f"[{name}] Inlet AMSL / warning level for water level check")

        # Rule 4: outlet-to-base between 75 mm and 100 mm
        if outlet_to_base is not None:
            otb_mm = outlet_to_base * 1000
            if 75 <= otb_mm <= 100:
                detail.append(
                    f"✓ [{name}] Outlet-to-base distance ({otb_mm:.0f} mm) is within 75–100 mm."
                )
                sub_statuses.append("PASS")
            else:
                detail.append(
                    f"✗ [{name}] Outlet-to-base distance ({otb_mm:.0f} mm) must be between 75 mm and 100 mm."
                )
                sub_statuses.append("FAIL")
        else:
            detail.append(
                f"– [{name}] Outlet-to-base distance not set — check skipped."
                f" Please enter Outlet → Base in the Outlet section of Advanced Details."
            )
            skipped_critical.append(f"[{name}] Outlet-to-base distance")

        # Rule 4b: capacity adequacy check (Section 4)
        effective_capacity_l = tp.get("effective_capacity_l")
        occupants = tp.get("occupants")
        required_m3 = tp.get("daily_demand_m3") or (occupants * 0.141 if occupants else None)
        if required_m3 is not None and required_m3 > 0:
            if effective_capacity_l is None:
                detail.append(
                    f"– [{name}] Effective capacity could not be calculated (missing dimensions or pipe levels) — "
                    f"capacity adequacy check against required {required_m3} m³/day skipped."
                )
                skipped_critical.append(f"[{name}] Effective capacity (incomplete Advanced Details)")
            else:
                effective_m3 = effective_capacity_l / 1000
                if effective_m3 > required_m3 * 1.2:
                    detail.append(
                        f"⚠ [{name}] Effective capacity ({effective_m3:.2f} m³) exceeds 120% of "
                        f"required 1-day storage ({required_m3} m³, 120% = {required_m3 * 1.2:.2f} m³) — "
                        f"tank may be oversized. Review with LP/PE."
                    )
                    sub_statuses.append("WARN")
                elif effective_m3 >= required_m3:
                    detail.append(
                        f"✓ [{name}] Effective capacity ({effective_m3:.2f} m³) meets required "
                        f"1-day storage ({required_m3} m³)."
                    )
                    sub_statuses.append("PASS")
                else:
                    shortfall = required_m3 - effective_m3
                    detail.append(
                        f"✗ [{name}] Effective capacity ({effective_m3:.2f} m³) is less than required "
                        f"1-day storage ({required_m3} m³) — shortfall of {shortfall:.2f} m³. "
                        f"Increase tank dimensions or adjust pipe levels."
                    )
                    sub_statuses.append("FAIL")
        else:
            detail.append(
                f"– [{name}] Required 1-day storage not entered — capacity adequacy check skipped. "
                f"Enter the required daily storage (m³) in Advanced Details to enable this check."
            )
            skipped_critical.append(f"[{name}] Required 1-day storage (m³)")

        # Rule 5: pressure vessel (advisory)
        if pressure_vessel is None:
            detail.append(f"– [{name}] Pressure vessel presence not specified.")
        elif pressure_vessel:
            detail.append(f"✓ [{name}] Pressure/hydro-pneumatic vessel is present.")
            sub_statuses.append("PASS")
        else:
            detail.append(
                f"⚠ [{name}] No pressure vessel installed. Review if a hydro-pneumatic vessel "
                f"is required with the pump manifold to prevent excessive cycling."
            )
            sub_statuses.append("WARN")

        # Rule 6: PUB-approved material (SS 636)
        if material is None:
            detail.append(f"– [{name}] Tank material not specified — SS 636 compliance cannot be verified.")
        elif material in PUB_APPROVED_MATERIALS:
            detail.append(f"✓ [{name}] Tank material ({material}) is PUB-approved per SS 636.")
            sub_statuses.append("PASS")
        elif material == "Other":
            detail.append(
                f"⚠ [{name}] Tank material is 'Other' — ensure it complies with SS 636 requirements."
            )
            sub_statuses.append("WARN")
        else:
            detail.append(
                f"✗ [{name}] Tank material '{material}' may not be PUB-approved. Refer to SS 636."
            )
            sub_statuses.append("FAIL")

        # Rule 7: sunken tank note
        if is_sunken:
            detail.append(
                f"ℹ [{name}] Tank is marked as a sunken/detention tank. "
                f"Ensure relevant underground installation requirements are met."
            )

    # System-level checks (pump, bypass, head) — apply across all tanks
    detail.append("## System Checks")
    pumps = [e for e in elements if e.get("symbol_id") == "pump"]
    if not pumps:
        detail.append(
            "⚠ No pump detected in schematic — if a booster pump is part of this installation, "
            "add it to the schematic and re-evaluate. "
            "Pump discharge pipes must NOT use plastic materials (PVC/uPVC)."
        )
        sub_statuses.append("WARN")
    else:
        discharge_ack = metadata.get("pump_discharge_material_acknowledged", False)
        if discharge_ack:
            detail.append(
                "✓ Rule 8: LP/PE confirmed pump discharge pipes are made of PUB-approved "
                "non-plastic materials (copper, stainless steel, etc.) as required."
            )
            sub_statuses.append("PASS")
        else:
            detail.append(
                "⚠ Rule 8: Pump discharge pipe material not confirmed. "
                "Pump discharge pipes must NOT use plastic materials (PVC/uPVC) — "
                "please acknowledge in the pre-evaluation checklist."
            )
            sub_statuses.append("WARN")

    # Rule 9: bypass line with normally-closed gate valve — topology check (one result per pump)
    bypass_lines = _check_bypass_line(elements, pipes)
    detail.extend(bypass_lines)
    for line in bypass_lines:
        if line.startswith("✓"):
            sub_statuses.append("PASS")
        elif line.startswith(("⚠", "✗", "–")):
            sub_statuses.append("WARN")

    # Rule 10: pump rated head ≤ 35 m — read declared head from each pump element
    if not pumps:
        detail.append(
            "⚠ No pump detected in schematic — if a booster pump is part of this installation, "
            "add it to the schematic and declare the rated head."
        )
        sub_statuses.append("WARN")
    else:
        for pump in pumps:
            rated_head = pump.get("pump_rated_head_m")
            pump_label = pump.get("symbol_name", "Pump")
            if rated_head is None or rated_head <= 0:
                detail.append(
                    f"⚠ {pump_label}: Pump rated head not declared — click the pump symbol and enter "
                    "the rated head (m) from the pump schedule."
                )
                sub_statuses.append("WARN")
            elif rated_head <= 35:
                detail.append(
                    f"✓ {pump_label}: Declared rated head {rated_head} m ≤ 35 m (PUB requirement met)."
                )
                sub_statuses.append("PASS")
            else:
                detail.append(
                    f"✗ {pump_label}: Declared rated head {rated_head} m exceeds the 35 m PUB limit — "
                    "select a pump with a lower rated head or install a PRV on the discharge line."
                )
                sub_statuses.append("FAIL")

    # Overall status
    if "FAIL" in sub_statuses:
        status = "FAIL"
        summary = "One or more tank/pump installation requirements are not met."
        if skipped_critical:
            summary += " Additionally, some checks were skipped due to missing fields — fill in Advanced Details for a complete assessment."
    elif skipped_critical:
        status = "WARN"
        missing = "; ".join(skipped_critical)
        summary = (
            f"Check incomplete — the following required fields are missing: {missing}. "
            f"Open Advanced Details and fill in all fields to complete the assessment."
        )
    elif "WARN" in sub_statuses:
        status = "WARN"
        summary = "Tank/pump installation checks passed with warnings — review advisory items."
    elif sub_statuses:
        status = "PASS"
        summary = "All verifiable tank/pump installation requirements are met."
    else:
        status = "SKIP"
        summary = "Tank properties not filled in — open Advanced Details and complete the fields to enable checks."

    return CheckResult(
        check_id="TANK_PUMP",
        title="Adequacy of Supply & Tank / Pump Installation",
        status=status,
        summary=summary,
        detail=detail,
    )
