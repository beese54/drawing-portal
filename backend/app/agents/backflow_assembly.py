"""
backflow_assembly.py — Shared BFS helpers for backflow-prevention assembly checks.

compliance_checks.py (REG28) and hot_water_contamination_check.py (HOT_WATER) both
evaluate "is this fixture protected by an upstream check_valve/vacuum_breaker assembly,
in the correct order" for the same physical rules (SS636 §6.5 bidet spray, Reg 28(1)
water heater). Both call into this module so they can't independently drift on
tie-break/hop-limit semantics the way they previously did.
"""

from __future__ import annotations
from dataclasses import dataclass

# Standardized search radius for all assembly-order BFS searches. There was no
# documented rationale for giving water-heater searches a shorter radius (4 hops)
# than bidet searches (5 hops), so both now share one value.
DEFAULT_MAX_HOPS = 5


def bfs_find(
    adj: dict[str, set[str]],
    start_id: str,
    target_symbol_ids: set[str],
    elem_by_id: dict[str, dict],
    max_hops: int = DEFAULT_MAX_HOPS,
) -> tuple[str | None, int | None]:
    """BFS from start_id; returns (element_id, hops) of the nearest matching symbol, or (None, None)."""
    visited: set[str] = set()
    queue: list[tuple[str, int]] = [(start_id, 0)]
    while queue:
        node, dist = queue.pop(0)
        if node in visited:
            continue
        visited.add(node)
        if dist > 0:
            el = elem_by_id.get(node)
            if el and el.get("symbol_id") in target_symbol_ids:
                return node, dist
        if dist >= max_hops:
            continue
        for nbr in adj.get(node, ()):
            if nbr not in visited:
                queue.append((nbr, dist + 1))
    return None, None


@dataclass
class AssemblyResult:
    outer_id: str | None       # e.g. check_valve — must sit farther from el_id (more hops)
    outer_hops: int | None
    inner_id: str | None       # e.g. vacuum_breaker — must sit closer to el_id (fewer hops)
    inner_hops: int | None
    ok: bool
    reason: str  # "missing_both" | "missing_outer" | "missing_inner" | "wrong_order" | "ok"


def check_assembly_order(
    el_id: str,
    adj: dict[str, set[str]],
    elem_by_id: dict[str, dict],
    outer_type: str,
    inner_type: str,
    max_hops: int = DEFAULT_MAX_HOPS,
) -> AssemblyResult:
    """
    Verify a two-component protective assembly upstream of el_id is present and
    in the correct order: inlet -> outer_type -> inner_type -> el_id, i.e.
    outer_type must be strictly more hops away from el_id than inner_type.

    A tied hop-count is treated as non-compliant ("wrong_order") — the graph
    can't prove the assembly is in the correct order, so it isn't given the
    benefit of the doubt.
    """
    outer_id, outer_hops = bfs_find(adj, el_id, {outer_type}, elem_by_id, max_hops)
    inner_id, inner_hops = bfs_find(adj, el_id, {inner_type}, elem_by_id, max_hops)

    if outer_id is None and inner_id is None:
        return AssemblyResult(None, None, None, None, False, "missing_both")
    if inner_id is None:
        return AssemblyResult(outer_id, outer_hops, None, None, False, "missing_inner")
    if outer_id is None:
        return AssemblyResult(None, None, inner_id, inner_hops, False, "missing_outer")
    if outer_hops <= inner_hops:
        return AssemblyResult(outer_id, outer_hops, inner_id, inner_hops, False, "wrong_order")
    return AssemblyResult(outer_id, outer_hops, inner_id, inner_hops, True, "ok")
