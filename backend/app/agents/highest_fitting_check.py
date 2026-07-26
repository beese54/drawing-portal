"""
highest_fitting_check.py — "Highest Direct Supply Fitting" marker check (PUB / SS 636 handbook 2.2.1).

Rule: a schematic with any fitting on direct supply must carry exactly one
"Highest Direct Supply Fitting" marker (symbol_id="highest_direct_supply_fitting"),
so the plan checker can read off the elevation used to verify the 25 m AMSL
direct-supply cutoff directly from the drawing. compliance_checks.py's
check_supply_mode (SEC221) already computes the highest fitting's elevation
internally for its own pass/fail logic, but that number never appears on the
drawing itself — this check is a separate, purely presence/count requirement
(exactly one marker) and does not itself validate the marker's declared
elevation against the SEC221 threshold.
"""

from __future__ import annotations
from typing import Any
from app.agents.compliance_checks import CheckResult, is_possibly_direct_supply

MARKER_SYMBOL_ID = "highest_direct_supply_fitting"


def check_highest_direct_supply_fitting(metadata: dict[str, Any]) -> CheckResult:
    elements: list[dict] = metadata.get("elements", [])

    has_direct_supply_fitting = any(
        e.get("node_type") == "water_fitting" and is_possibly_direct_supply(e)
        for e in elements
    )
    markers = [e for e in elements if e.get("symbol_id") == MARKER_SYMBOL_ID]

    if not has_direct_supply_fitting:
        return CheckResult(
            check_id="HIGHEST_FITTING",
            title="Highest Direct Supply Fitting Marker",
            status="SKIP",
            summary="No fittings on direct supply — check not applicable.",
            detail=["This check only applies when at least one fitting is on direct (mains) supply."],
        )

    if len(markers) == 1:
        elevation = markers[0].get("highest_fitting_elevation_m")
        elevation_text = f"{elevation:.1f} m AMSL" if elevation is not None else "elevation not set"
        return CheckResult(
            check_id="HIGHEST_FITTING",
            title="Highest Direct Supply Fitting Marker",
            status="PASS",
            summary=f"Highest Direct Supply Fitting marker present ({elevation_text}).",
            detail=[f"Marker found at {elevation_text}."],
            elements_of_interest=[
                {"element_id": markers[0]["id"], "label": "Highest Direct Supply Fitting", "color": "#0066cc"}
            ],
        )

    if len(markers) == 0:
        return CheckResult(
            check_id="HIGHEST_FITTING",
            title="Highest Direct Supply Fitting Marker",
            status="FAIL",
            summary="No Highest Direct Supply Fitting marker found — required when direct supply is present.",
            detail=[
                "The drawing has fittings on direct supply but no 'Highest Direct Supply Fitting' "
                "marker. Place exactly one marker on the highest fitting on direct supply and enter "
                "its elevation.",
            ],
        )

    # len(markers) > 1
    return CheckResult(
        check_id="HIGHEST_FITTING",
        title="Highest Direct Supply Fitting Marker",
        status="FAIL",
        summary=f"{len(markers)} Highest Direct Supply Fitting markers found — exactly one is required.",
        detail=[
            "Multiple 'Highest Direct Supply Fitting' markers were found. Remove all but the one "
            "that actually marks the highest fitting on direct supply.",
        ],
        elements_of_interest=[
            {"element_id": m["id"], "label": "Highest Direct Supply Fitting (duplicate)", "color": "#e63329"}
            for m in markers
        ],
        issues=[{
            "status": "FAIL",
            "text": f"{len(markers)} Highest Direct Supply Fitting markers found — exactly one is required.",
            "element_ids": [m["id"] for m in markers],
        }],
    )
