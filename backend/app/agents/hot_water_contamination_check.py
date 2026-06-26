"""
hot_water_contamination_check.py — Section 6: Hot water / Contamination prevention.

Rules:
  6.1  Heat pump supply mode consistency — cold and hot supplies to fittings must be
       via the same mode (both direct or both indirect).
  6.2  Direct-supply heaters must be mains-pressure type — LP/PE acknowledgment.
  6.3  Water heater protection assembly — check_valve + pressure_relief_valve adjacent
       to each water_heater (graph check).  If only a check_valve is found (no PRV),
       the evaluation warns and asks LP/PE to confirm adequacy.
  6.4  Double check valves for appliances (dishwasher, water_dispenser, washing_machine,
       landscape_tap) — graph check for adjacent check_valve.
  6.5  Bidet sprays — vacuum_breaker adjacent to each bidet element (graph check).
  6.6  Tanks/pumps not below sanitary pipes — LP/PE acknowledgment.
"""

from __future__ import annotations
from collections import Counter, defaultdict
from typing import Any
from app.agents.compliance_checks import CheckResult
from app.agents.graph_utils import build_adjacency



def _bfs_find(
    adj: dict[str, set[str]],
    start: str,
    target_symbol_ids: set[str],
    elem_by_id: dict[str, dict],
    max_hops: int = 4,
) -> tuple[str | None, int]:
    """BFS from start; returns (element_id, hops) of first matching symbol, or (None, -1)."""
    visited: set[str] = set()
    queue: list[tuple[str, int]] = [(start, 0)]
    while queue:
        node, dist = queue.pop(0)
        if node in visited:
            continue
        visited.add(node)
        if dist > 0:
            el = elem_by_id.get(node, {})
            if el.get("symbol_id") in target_symbol_ids:
                return node, dist
        if dist >= max_hops:
            continue
        for nbr in adj.get(node, []):
            if nbr not in visited:
                queue.append((nbr, dist + 1))
    return None, -1


# ---------------------------------------------------------------------------
# Rule 6.1 — Heat pump supply mode consistency
# ---------------------------------------------------------------------------

def _check_supply_mode_consistency(elements: list[dict]) -> str:
    """
    If a water_heater is present, ensure cold and hot supplies are on the same mode.
    Heuristic: if heaters are on indirect_supply but some fittings are on direct_supply
    (or vice versa), flag a warning — the hot and cold sides would be on different modes.
    """
    heaters = [e for e in elements if e.get("symbol_id") == "water_heater"]
    if not heaters:
        return "– Rule 6.1: No water heater detected — heat pump supply mode check skipped."

    fittings = [e for e in elements if e.get("node_type") == "water_fitting" and e.get("supply_mode")]
    if not fittings:
        return "– Rule 6.1: No water fittings detected — supply mode consistency check skipped."

    heater_modes = {e.get("supply_mode") for e in heaters if e.get("supply_mode")}
    fitting_modes = {e.get("supply_mode") for e in fittings}

    all_modes = heater_modes | fitting_modes
    if not all_modes:
        return "– Rule 6.1: Supply mode not determined — connect a water meter and re-export to enable this check."

    if len(all_modes) > 1:
        return (
            f"⚠ Rule 6.1: Mixed supply modes detected (heater: {heater_modes}, "
            f"fittings: {fitting_modes}). For heat pump installations, cold and hot water "
            f"supplies to fittings must be via the same mode (both direct or both indirect)."
        )
    return (
        f"✓ Rule 6.1: All heaters and fittings are on the same supply mode "
        f"({next(iter(all_modes))}) — supply mode consistency satisfied."
    )


# ---------------------------------------------------------------------------
# Rule 6.3 — Water heater protection assembly (check_valve + PRV)
# ---------------------------------------------------------------------------

def _check_heater_protection(
    elements: list[dict],
    pipes: list[dict],
    elem_by_id: dict[str, dict],
    adj: dict[str, set[str]],
) -> list[str]:
    heaters = [e for e in elements if e.get("symbol_id") == "water_heater"]
    if not heaters:
        return ["– Rule 6.3: No water heater detected — heater protection assembly check skipped."]

    lines: list[str] = []
    for heater in heaters:
        name = heater.get("symbol_name", "Water Heater")
        hid = heater["id"]

        cv_id, cv_hops = _bfs_find(adj, hid, {"check_valve"}, elem_by_id, max_hops=4)
        prv_id, _ = _bfs_find(adj, hid, {"pressure_relief_valve"}, elem_by_id, max_hops=4)

        if cv_id and prv_id:
            lines.append(
                f"✓ Rule 6.3: [{name}] Check valve and pressure relief valve assembly detected "
                f"(preferred configuration) — backflow protection confirmed."
            )
        elif cv_id:
            pos = "immediately adjacent" if cv_hops == 1 else f"{cv_hops} hops away"
            lines.append(
                f"⚠ Rule 6.3: [{name}] Check valve found ({pos}) but no pressure relief valve detected. "
                f"A check valve + PRV assembly is preferred. If a double check valve assembly is used "
                f"instead, LP/PE must confirm it provides adequate backflow prevention (see acknowledgment)."
            )
        else:
            lines.append(
                f"✗ Rule 6.3: [{name}] No check valve found within 4 hops of the water heater. "
                f"A check valve (with PRV or as double check valve assembly) is required on the heater inlet "
                f"to prevent backflow — Reg 28(1)."
            )
    return lines


# ---------------------------------------------------------------------------
# Rule 6.4 — Double check valves for appliance fittings
# ---------------------------------------------------------------------------

_APPLIANCE_DISPLAY_NAMES = {
    "washing_machine": "Washing Machine",
    "dishwasher": "Dishwasher",
    "water_dispenser": "Water Dispenser",
    "bib_tap_cw_cap_and_lock_schematic": "Bib Tap (Landscape)",
}


def _appliance_display_name(el: dict) -> str:
    sid = el.get("symbol_id", "")
    if sid in _APPLIANCE_DISPLAY_NAMES:
        return _APPLIANCE_DISPLAY_NAMES[sid]
    return el.get("fitting_type", "Appliance").replace("_", " ").title()


def _check_appliance_check_valves(
    elements: list[dict],
    elem_by_id: dict[str, dict],
    adj: dict[str, set[str]],
) -> list[str]:
    # backflow_requirement == "check_valve" is exported by the frontend for all §6.4 appliances
    # and for water_heater (Reg 28). Exclude water_heater — it has its own Rule 6.3 check.
    appliances = [
        e for e in elements
        if e.get("backflow_requirement") == "check_valve"
        and e.get("symbol_id") != "water_heater"
    ]
    if not appliances:
        return ["– Rule 6.4: No appliance fittings (dishwasher / water dispenser / washing machine / landscape tap / ice maker / coffee maker / refrigerator / balancing tank) detected — check skipped."]

    lines: list[str] = []
    for el in appliances:
        name = _appliance_display_name(el)
        cv_id, _ = _bfs_find(adj, el["id"], {"check_valve"}, elem_by_id, max_hops=3)
        if cv_id:
            lines.append(f"✓ Rule 6.4: [{name}] Check valve detected upstream — backflow prevention present.")
        else:
            lines.append(
                f"✗ Rule 6.4: [{name}] No check valve found within 3 hops. "
                f"A double check valve must be installed before {name} fittings to prevent contamination."
            )
    return lines


# ---------------------------------------------------------------------------
# Rule 6.5 — Bidet spray vacuum breaker
# ---------------------------------------------------------------------------

def _check_bidet_vacuum_breaker(
    elements: list[dict],
    elem_by_id: dict[str, dict],
    adj: dict[str, set[str]],
) -> list[str]:
    bidets = [e for e in elements if e.get("symbol_id") == "bidet_spray"]
    if not bidets:
        return ["– Rule 6.5: No bidet spray detected — vacuum breaker check skipped."]

    lines: list[str] = []
    for el in bidets:
        name = el.get("symbol_name", "Bidet Spray")
        el_id = el["id"]
        vb_id, vb_hops = _bfs_find(adj, el_id, {"vacuum_breaker"}, elem_by_id, max_hops=5)
        cv_id, cv_hops = _bfs_find(adj, el_id, {"check_valve"},    elem_by_id, max_hops=5)

        if not vb_id and not cv_id:
            lines.append(
                f"✗ Rule 6.5: [{name}] No vacuum breaker or check valve detected. "
                f"A vacuum breaker and check valve assembly must be installed on all bidet spray connections."
            )
        elif not vb_id:
            lines.append(
                f"✗ Rule 6.5: [{name}] No vacuum breaker found. "
                f"Both a vacuum breaker AND check valve are required for bidet spray installations."
            )
        elif not cv_id:
            lines.append(
                f"⚠ Rule 6.5: [{name}] Vacuum breaker detected but no check valve found. "
                f"Both a vacuum breaker AND check valve are required for bidet spray installations."
            )
        elif cv_hops <= vb_hops:
            # check_valve is closer to (or same distance as) bidet_spray than vacuum_breaker —
            # assembly order is wrong: correct order is inlet → check_valve → vacuum_breaker → bidet_spray.
            lines.append(
                f"✗ Rule 6.5: [{name}] Assembly order incorrect — check valve must be upstream of "
                f"vacuum breaker (inlet → check valve → vacuum breaker → bidet spray). "
                f"Currently check valve is {cv_hops} hop(s) away and vacuum breaker is {vb_hops} hop(s) away."
            )
        else:
            lines.append(
                f"✓ Rule 6.5: [{name}] Vacuum breaker and check valve assembly detected in correct order "
                f"(vacuum breaker {vb_hops} hop(s), check valve {cv_hops} hop(s) from bidet spray) — "
                f"contamination prevention requirements satisfied."
            )
    return lines


# ---------------------------------------------------------------------------
# Detail deduplication
# ---------------------------------------------------------------------------

def _deduplicate_rule_lines(lines: list[str]) -> list[str]:
    """
    Collapse repeated rule bullets that differ only by the bracketed element name.

    Handles lines of the form:  "... Rule N.N: [Name] body text..."
    E.g. 4× "⚠ Rule 6.3: [Storage Water Heater] CV found but no PRV..."
    collapses to "⚠ Rule 6.3: [Storage Water Heater ×4] CV found but no PRV..."

    Lines with different bodies or without a bracketed name pass through unchanged.
    """
    def _parse(line: str):
        # Find first '[...]' pair that has 'Rule' somewhere before it
        try:
            br_open = line.index('[')
            br_close = line.index(']', br_open)
        except ValueError:
            return None
        prefix = line[:br_open]
        if 'Rule' not in prefix:
            return None
        name = line[br_open + 1:br_close]
        body = line[br_close + 1:].lstrip(' ')
        return (prefix, name, body)

    parsed = []
    for line in lines:
        p = _parse(line)
        if p:
            prefix, name, body = p
            parsed.append(((prefix, body), name, line))
        else:
            parsed.append((None, None, line))

    key_counts: Counter = Counter(p[0] for p in parsed if p[0] is not None)
    key_names: dict = defaultdict(list)
    for key, name, _ in parsed:
        if key is not None:
            key_names[key].append(name)

    seen: set = set()
    result: list[str] = []
    for key, _name, line in parsed:
        if key is None:
            result.append(line)
            continue
        if key in seen:
            continue
        seen.add(key)
        count = key_counts[key]
        if count > 1:
            prefix, body = key
            unique_names = list(dict.fromkeys(key_names[key]))
            label = unique_names[0] if len(unique_names) == 1 else ", ".join(unique_names)
            result.append(f"{prefix}[{label} ×{count}] {body}")
        else:
            result.append(line)
    return result


# ---------------------------------------------------------------------------
# Main check
# ---------------------------------------------------------------------------

def check_hot_water_contamination(metadata: dict[str, Any]) -> CheckResult:
    """
    Section 6 — Hot water / Contamination prevention checks.

    Automated checks (graph topology):
      6.1  Heat pump supply mode consistency
      6.3  Water heater protection assembly (check_valve + pressure_relief_valve)
      6.4  Appliance double check valves
      6.5  Bidet spray vacuum breaker + check valve assembly

    Acknowledgment-based checks:
      6.2  Direct-supply heaters are mains-pressure type (LP/PE confirmation)
      6.6  Tanks/pumps not below sanitary pipes (LP/PE confirmation)
    """
    elements: list[dict] = metadata.get("elements", [])
    pipes: list[dict] = metadata.get("pipes", [])
    elem_by_id = {e["id"]: e for e in elements}
    adj = build_adjacency(elements, pipes)

    heaters = [e for e in elements if e.get("symbol_id") == "water_heater"]
    bidets   = [e for e in elements if e.get("symbol_id") == "bidet_spray"]
    appliances = [
        e for e in elements
        if e.get("backflow_requirement") == "check_valve"
        and e.get("symbol_id") != "water_heater"
    ]
    has_tank_or_pump = any(
        e.get("symbol_id") in ("water_tank", "pump") for e in elements
    )

    if not heaters and not bidets and not appliances and not has_tank_or_pump:
        return CheckResult(
            check_id="HOT_WATER",
            title="Hot Water / Contamination Prevention",
            status="SKIP",
            summary="No water heaters, bidet sprays, or applicable appliances detected — check skipped.",
            detail=["Add water heater, bidet spray, or appliance fittings to enable Section 6 checks."],
        )

    detail: list[str] = []
    sub_statuses: list[str] = []

    # ── Rule 6.1 ──────────────────────────────────────────────────────────────
    r61 = _check_supply_mode_consistency(elements)
    detail.append(r61)
    if r61.startswith("✓"):
        sub_statuses.append("PASS")
    elif r61.startswith("⚠"):
        sub_statuses.append("WARN")

    # ── Rule 6.2 (acknowledgment) ─────────────────────────────────────────────
    if heaters:
        heater_type_ack = metadata.get("heater_type_acknowledged", False)
        if heater_type_ack:
            detail.append(
                "✓ Rule 6.2: LP/PE confirmed all direct-supply heaters are mains-pressure type "
                "(storage or instantaneous water heaters) as required."
            )
            sub_statuses.append("PASS")
        else:
            detail.append(
                "⚠ Rule 6.2: Heater type not confirmed — please acknowledge that all heaters on direct "
                "supply are mains-pressure type (storage or instantaneous) in the pre-evaluation checklist."
            )
            sub_statuses.append("WARN")

    # ── Rule 6.3 ──────────────────────────────────────────────────────────────
    r63_lines = _check_heater_protection(elements, pipes, elem_by_id, adj)
    detail.extend(r63_lines)
    for line in r63_lines:
        if line.startswith("✓"):
            sub_statuses.append("PASS")
        elif line.startswith("⚠"):
            sub_statuses.append("WARN")
        elif line.startswith("✗"):
            sub_statuses.append("FAIL")

    # ── Rule 6.4 ──────────────────────────────────────────────────────────────
    r64_lines = _check_appliance_check_valves(elements, elem_by_id, adj)
    detail.extend(r64_lines)
    for line in r64_lines:
        if line.startswith("✓"):
            sub_statuses.append("PASS")
        elif line.startswith("⚠"):
            sub_statuses.append("WARN")
        elif line.startswith("✗"):
            sub_statuses.append("FAIL")

    if appliances:
        appl_ack = metadata.get("appliance_check_valve_acknowledged", False)
        if appl_ack:
            detail.append(
                "✓ Rule 6.4: LP/PE confirmed double check valves are installed for all applicable appliances."
            )
            sub_statuses.append("PASS")
        else:
            detail.append(
                "⚠ Rule 6.4: LP/PE acknowledgment for appliance check valves not provided — "
                "please confirm in the pre-evaluation checklist."
            )
            sub_statuses.append("WARN")

    # ── Rule 6.5 ──────────────────────────────────────────────────────────────
    r65_lines = _check_bidet_vacuum_breaker(elements, elem_by_id, adj)
    detail.extend(r65_lines)
    for line in r65_lines:
        if line.startswith("✓"):
            sub_statuses.append("PASS")
        elif line.startswith("⚠"):
            sub_statuses.append("WARN")
        elif line.startswith("✗"):
            sub_statuses.append("FAIL")

    if bidets:
        bidet_ack = metadata.get("bidet_vacuum_breaker_acknowledged", False)
        if bidet_ack:
            detail.append(
                "✓ Rule 6.5: LP/PE confirmed vacuum breaker and check valve assembly is installed "
                "for all bidet spray connections."
            )
            sub_statuses.append("PASS")
        else:
            detail.append(
                "⚠ Rule 6.5: LP/PE acknowledgment for bidet vacuum breaker assembly not provided — "
                "please confirm in the pre-evaluation checklist."
            )
            sub_statuses.append("WARN")

    # ── Rule 6.6 (acknowledgment) ─────────────────────────────────────────────
    if has_tank_or_pump:
        pos_ack = metadata.get("tank_position_acknowledged", False)
        if pos_ack:
            detail.append(
                "✓ Rule 6.6: LP/PE confirmed tanks and pumps are NOT installed below any sanitary "
                "or non-potable water pipes."
            )
            sub_statuses.append("PASS")
        else:
            detail.append(
                "⚠ Rule 6.6: Tank/pump position not confirmed — please acknowledge in the "
                "pre-evaluation checklist that tanks and pumps are not installed below sanitary pipes."
            )
            sub_statuses.append("WARN")

    # ── Overall status ────────────────────────────────────────────────────────
    if "FAIL" in sub_statuses:
        status = "FAIL"
        summary = "One or more hot water / contamination prevention requirements are not met."
    elif "WARN" in sub_statuses:
        status = "WARN"
        summary = "Hot water / contamination checks passed with warnings — review advisory items and complete acknowledgments."
    elif sub_statuses:
        status = "PASS"
        summary = "All Section 6 hot water and contamination prevention requirements are satisfied."
    else:
        status = "SKIP"
        summary = "No applicable elements for Section 6 checks."

    return CheckResult(
        check_id="HOT_WATER",
        title="Hot Water / Contamination Prevention",
        status=status,
        summary=summary,
        detail=_deduplicate_rule_lines(detail),
    )
