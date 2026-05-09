"""
tank_pump_check.py — Tank / pump installation compliance check (PUB / SS 245 / SS 636).
"""

from __future__ import annotations
from typing import Any
from app.agents.compliance_checks import CheckResult

PUB_APPROVED_MATERIALS = {"FRP", "GRP", "SS_316", "RC"}
PLASTIC_MATERIALS = {"pvc", "upvc", "cpvc"}


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
      8. Pump discharge pipe not plastic (PVC / uPVC)
      9. Bypass line — N.A. (no symbol support yet)
     10. 35 m head limit — N.A. (requires pump head data)
    """
    elements: list[dict] = metadata.get("elements", [])
    pipes: list[dict] = metadata.get("pipes", [])

    tanks = [e for e in elements if e.get("symbol_id") == "water_tank"]

    if not tanks:
        return CheckResult(
            check_id="TANK_PUMP",
            title="Tank / Pump Installation",
            status="SKIP",
            summary="No water tank found in schematic — check skipped.",
            detail=["This check applies only when a water tank is present."],
        )

    detail: list[str] = []
    sub_statuses: list[str] = []
    skipped_critical: list[str] = []   # critical fields left blank — triggers WARN
    pipe_by_id = {p["id"]: p for p in pipes}

    for tank in tanks:
        tp: dict = tank.get("tank_properties") or {}
        name = tank.get("symbol_name", "Water Tank")

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

    # Rule 8: pump discharge pipe not plastic
    pumps = [e for e in elements if e.get("symbol_id") == "pump"]
    if not pumps:
        detail.append("– Pump discharge pipe material: No pump in schematic (N.A.).")
    else:
        any_pump_checked = False
        for pump in pumps:
            pump_name = pump.get("symbol_name", "Pump")
            for port in pump.get("ports", []):
                if port.get("role") != "downstream":
                    continue
                pipe_id = port.get("connected_pipe_id")
                if not pipe_id:
                    detail.append(
                        f"– [{pump_name}] Discharge pipe not connected — material cannot be checked."
                    )
                    continue
                pipe = pipe_by_id.get(pipe_id)
                if not pipe:
                    continue
                mat_raw = pipe.get("material") or ""
                mat = mat_raw.lower().replace("-", "").replace(" ", "")
                any_pump_checked = True
                if any(p in mat for p in PLASTIC_MATERIALS):
                    detail.append(
                        f"✗ [{pump_name}] Discharge pipe material is '{mat_raw}' (plastic). "
                        f"uPVC/PVC must not be used as a pump discharge pipe."
                    )
                    sub_statuses.append("FAIL")
                elif mat:
                    detail.append(
                        f"✓ [{pump_name}] Discharge pipe material is '{mat_raw}' (non-plastic — compliant)."
                    )
                    sub_statuses.append("PASS")
                else:
                    detail.append(
                        f"– [{pump_name}] Discharge pipe material not specified — cannot check."
                    )
        if not any_pump_checked:
            detail.append(
                "– Pump discharge pipe: Pump outlet port not connected to a pipe — cannot check material."
            )

    # Rules 9-10: N.A.
    detail.append(
        "– Bypass line with normally closed valve: Not yet verifiable from schematic topology (N.A.)."
    )
    detail.append(
        "– Terminal fittings ≤ 35 m head: Requires pump rated head data (N.A.)."
    )

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
        title="Tank / Pump Installation",
        status=status,
        summary=summary,
        detail=detail,
    )
