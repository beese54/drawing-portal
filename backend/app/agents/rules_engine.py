"""
rules_engine.py — Deterministic hydraulic compliance checks.

Runs against the schematic metadata JSON and hydraulic calculation results
without any LLM inference. Results feed into the consolidated RAG prompt.

Rules are grouped by severity:
    FAIL  — clear non-compliance (must fix)
    WARN  — potential issue (should review)
    PASS  — compliant
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal


@dataclass
class RuleResult:
    rule_id: str
    description: str
    status: Literal["PASS", "FAIL", "WARN", "SKIP"]
    detail: str


@dataclass
class RulesReport:
    results: list[RuleResult]
    fail_count: int
    warn_count: int
    pass_count: int

    def as_text(self) -> str:
        """Compact string representation for inclusion in LLM prompt."""
        lines = ["=== Compliance Check Results ==="]
        for r in self.results:
            icon = {"PASS": "✓", "FAIL": "✗", "WARN": "⚠", "SKIP": "—"}[r.status]
            lines.append(f"{icon} [{r.rule_id}] {r.description}: {r.detail}")
        lines.append(
            f"\nSummary: {self.fail_count} FAIL, {self.warn_count} WARN, "
            f"{self.pass_count} PASS"
        )
        return "\n".join(lines)

    def as_list(self) -> list[dict]:
        return [
            {
                "rule_id":    r.rule_id,
                "description": r.description,
                "status":     r.status,
                "detail":     r.detail,
            }
            for r in self.results
        ]


# ---------------------------------------------------------------------------
# Individual rule checkers
# ---------------------------------------------------------------------------

def _check_velocity(
    velocities: dict[str, float],   # pipe_id → m/s
    pipe_types: dict[str, str],      # pipe_id → "cold" | "hot" | "generic"
) -> list[RuleResult]:
    results: list[RuleResult] = []
    MIN_V = 0.3   # m/s — below this, stagnation / Legionella risk
    MAX_V_COPPER = 3.0   # m/s — erosion / noise limit for copper
    MAX_V_HOT    = 2.5   # m/s — reduced limit for hot water

    if not velocities:
        return [RuleResult("VEL-01", "Minimum flow velocity", "SKIP",
                           "No velocity data available.")]

    any_low = any(v < MIN_V and v > 0 for v in velocities.values())
    any_high_copper = any(v > MAX_V_COPPER for v in velocities.values())
    any_high_hot    = any(
        v > MAX_V_HOT for pid, v in velocities.items()
        if pipe_types.get(pid) == "hot"
    )

    results.append(RuleResult(
        "VEL-01", "Minimum flow velocity ≥ 0.3 m/s",
        "FAIL" if any_low else "PASS",
        f"{'One or more pipes below 0.3 m/s — stagnation / Legionella risk.' if any_low else 'All pipes meet minimum velocity.'}",
    ))
    results.append(RuleResult(
        "VEL-02", "Maximum flow velocity ≤ 3.0 m/s (copper)",
        "FAIL" if any_high_copper else "PASS",
        "Velocity exceeds 3.0 m/s — pipe erosion / noise risk." if any_high_copper else "OK",
    ))
    results.append(RuleResult(
        "VEL-03", "Hot water velocity ≤ 2.5 m/s",
        "FAIL" if any_high_hot else "PASS",
        "Hot water pipe velocity exceeds 2.5 m/s." if any_high_hot else "OK",
    ))
    return results


def _check_residual_pressure(node_pressures: dict[str, float]) -> RuleResult:
    MIN_RESIDUAL = 1.0  # bar at outlet
    outlets_below = {nid: p for nid, p in node_pressures.items() if 0 < p < MIN_RESIDUAL}
    if not node_pressures:
        return RuleResult("PRES-01", "Minimum residual pressure ≥ 1.0 bar at outlets",
                          "SKIP", "No pressure data available.")
    if outlets_below:
        detail = ", ".join(f"{nid}={p:.2f} bar" for nid, p in outlets_below.items())
        return RuleResult("PRES-01", "Minimum residual pressure ≥ 1.0 bar at outlets",
                          "FAIL", f"Low pressure at: {detail}")
    return RuleResult("PRES-01", "Minimum residual pressure ≥ 1.0 bar at outlets",
                      "PASS", "All outlets ≥ 1.0 bar")


def _check_check_valve_on_pump(elements: list[dict]) -> RuleResult:
    """Warn if a pump is present but no check_valve is in the schematic."""
    pump_ids = [e["id"] for e in elements if e.get("node_type") == "pressure_booster"]
    check_valves = [e["id"] for e in elements if "check_valve" in e.get("symbol_id", "")]

    if not pump_ids:
        return RuleResult("BFP-01", "Check valve on pump outlet",
                          "SKIP", "No pump detected in schematic.")
    if not check_valves:
        return RuleResult("BFP-01", "Check valve on pump outlet",
                          "WARN", "Pump present but no check valve found — backflow prevention required.")
    return RuleResult("BFP-01", "Check valve on pump outlet",
                      "PASS", f"Check valve present ({len(check_valves)} found).")


def _check_dead_legs(pipes: list[dict], elements: list[dict]) -> RuleResult:
    """Detect pipes with only one connected endpoint (dead legs)."""
    connected_element_ids: set[str] = set()
    for pipe in pipes:
        if pipe.get("flow_from_element_id"):
            connected_element_ids.add(pipe["flow_from_element_id"])
        if pipe.get("flow_to_element_id"):
            connected_element_ids.add(pipe["flow_to_element_id"])

    all_element_ids = {e["id"] for e in elements}
    isolated = all_element_ids - connected_element_ids

    # Exclude source / standalone nodes that are legitimately unconnected
    dead_legs = [
        eid for eid in isolated
        if any(e["id"] == eid and e.get("node_type") not in ("source", "meter")
               for e in elements)
    ]

    if dead_legs:
        return RuleResult("DL-01", "No dead legs (unconnected pipe endpoints)",
                          "WARN", f"Potentially unconnected elements: {', '.join(dead_legs[:5])}")
    return RuleResult("DL-01", "No dead legs (unconnected pipe endpoints)",
                      "PASS", "All elements appear connected.")


def _check_supply_mode(elements: list[dict]) -> RuleResult:
    """Check that a water meter is present (metered supply)."""
    meters = [e for e in elements if "water_meter" in e.get("symbol_id", "")]
    if not meters:
        return RuleResult("SUP-01", "Water meter present in schematic",
                          "WARN", "No water meter detected — supply boundary not defined.")
    return RuleResult("SUP-01", "Water meter present in schematic",
                      "PASS", "Water meter present.")


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def run_checks(
    metadata: dict[str, Any],
    velocities: dict[str, float] | None = None,
    node_pressures: dict[str, float] | None = None,
) -> RulesReport:
    """Run all compliance checks against schematic metadata + optional hydraulic results.

    Parameters
    ----------
    metadata : dict
        DrawingMetadata JSON from the frontend.
    Returns
    -------
    RulesReport
    """
    elements: list[dict] = metadata.get("elements", [])
    pipes: list[dict]    = metadata.get("pipes", [])

    # Build pipe type map for velocity checks
    pipe_type_map = {p["id"]: p.get("pipe_type", "generic") for p in pipes}

    results: list[RuleResult] = []

    # --- Velocity checks ---
    results.extend(_check_velocity(velocities or {}, pipe_type_map))

    # --- Residual pressure ---
    results.append(_check_residual_pressure(node_pressures or {}))

    # --- Backflow prevention ---
    results.append(_check_check_valve_on_pump(elements))

    # --- Dead legs ---
    results.append(_check_dead_legs(pipes, elements))

    # --- Supply metering ---
    results.append(_check_supply_mode(elements))

    fail_count = sum(1 for r in results if r.status == "FAIL")
    warn_count = sum(1 for r in results if r.status == "WARN")
    pass_count = sum(1 for r in results if r.status == "PASS")

    return RulesReport(
        results=results,
        fail_count=fail_count,
        warn_count=warn_count,
        pass_count=pass_count,
    )
