"""
section3_pipe_check.py — WSI Section 7: Pipes / Fittings / Appliances.

Rule:
  7.1  Pipes and fittings are PUB-approved — LP/PE acknowledgment (SS 636 Table 1).
"""

from __future__ import annotations
from typing import Any
from app.agents.compliance_checks import CheckResult


def check_section3_pipes(metadata: dict[str, Any]) -> CheckResult:
    """
    WSI Section 7 — Pipes / Fittings (materials acknowledgment only).

    The LP/PE must confirm that all pipes, fittings, and jointing materials
    used in the installation comply with PUB-approved standards (SS 636 Table 1).
    """
    detail: list[str] = []

    if metadata.get("materials_acknowledged", False):
        status = "PASS"
        summary = "LP/PE confirmed all pipes and fittings are PUB-approved per SS 636."
        detail.append(
            "✓ LP/PE confirmed that all pipes, fittings, and jointing materials used comply "
            "with PUB-approved standards and nominal sizes (SS 636 Table 1 and PUB Technical Requirements)."
        )
    else:
        status = "WARN"
        summary = "Pipes and fittings compliance not confirmed — LP/PE acknowledgment required."
        detail.append(
            "⚠ Pipes and fittings not confirmed. The LP/PE must confirm that all pipes, fittings, "
            "and jointing materials comply with PUB-approved standards (SS 636 Table 1). "
            "Tick the acknowledgment in the pre-evaluation checklist and re-evaluate."
        )

    detail.append("")
    detail.append("Reference: PUB WSI Checklist Section 7; SS 636:2018 Table 1.")

    return CheckResult(
        check_id="SEC7_MATERIALS",
        title="Pipes & Fittings — PUB-Approved Materials",
        status=status,
        summary=summary,
        detail=detail,
    )
