"""
long_bath_check.py — Long bath installation compliance check (PUB / SS 636).

Rules:
  - Baths with capacity > 250 L require additional provisions per PUB regulations.
  - If capacity is not entered, issue a WARN prompting the user to enter it.
  - If capacity <= 250 L: PASS.
  - If capacity > 250 L: WARN with three advisory items.
"""

from __future__ import annotations
from typing import Any
from app.agents.compliance_checks import CheckResult

CAPACITY_LIMIT_L = 250


def check_long_bath_installation(metadata: dict[str, Any]) -> CheckResult:
    elements: list[dict] = metadata.get("elements", [])
    long_baths = [e for e in elements if e.get("symbol_id") == "long_bath"]

    if not long_baths:
        return CheckResult(
            check_id="LONG_BATH",
            title="Long Bath Installation",
            status="SKIP",
            summary="No long bath found in schematic — check skipped.",
            detail=["This check applies only when a long bath is present."],
        )

    detail: list[str] = []
    sub_statuses: list[str] = []
    issues: list[dict] = []

    for i, bath in enumerate(long_baths, start=1):
        label = f"Long Bath {i}" if len(long_baths) > 1 else "Long Bath"
        capacity = bath.get("long_bath_capacity_l")

        if capacity is None:
            text = (
                f"{label}: Capacity not entered — please input the bath capacity in litres "
                "to determine if additional provisions are required."
            )
            detail.append(text)
            sub_statuses.append("WARN")
            issues.append({"status": "WARN", "text": text, "element_ids": [bath["id"]]})
        elif capacity <= CAPACITY_LIMIT_L:
            detail.append(f"{label}: {capacity} L — within the {CAPACITY_LIMIT_L} L limit. No additional provisions required.")
            sub_statuses.append("PASS")
        else:
            detail.append(f"{label}: {capacity} L — exceeds {CAPACITY_LIMIT_L} L. The following additional provisions are required per SS 636:")
            detail.append(
                "  1. No direct drain plug — the bath must not be fitted with a direct drain plug "
                "that would allow the full volume to be retained."
            )
            detail.append(
                "  2. Full recirculation facilities must be provided (recirculation pump and pipework "
                "to filter and recirculate the bath water)."
            )
            detail.append(
                "  3. Backwash from the recirculation filter must be discharged to the sewer via a "
                "floor trap — not directly to the drain."
            )
            sub_statuses.append("WARN")
            issues.append({
                "status": "WARN",
                "text": (
                    f"{label}: {capacity} L exceeds {CAPACITY_LIMIT_L} L — requires no direct drain plug, "
                    "full recirculation facilities, and backwash via floor trap per SS 636."
                ),
                "element_ids": [bath["id"]],
            })

    if all(s == "PASS" for s in sub_statuses):
        status = "PASS"
        summary = f"All long bath(s) are within the {CAPACITY_LIMIT_L} L capacity limit — no additional provisions required."
    elif all(s == "SKIP" for s in sub_statuses):
        status = "SKIP"
        summary = "Check skipped."
    elif "WARN" in sub_statuses and all(s in ("PASS", "WARN") for s in sub_statuses):
        status = "WARN"
        missing = sum(1 for s in sub_statuses if s == "WARN")
        summary = (
            f"{missing} long bath(s) require attention — capacity not entered or exceeds {CAPACITY_LIMIT_L} L."
        )
    else:
        status = "WARN"
        summary = "Long bath installation requires review."

    return CheckResult(
        check_id="LONG_BATH",
        title="Long Bath Installation",
        status=status,
        summary=summary,
        detail=detail,
        issues=issues,
    )
