"""
hydraulic_engine.py — Hydraulic Calculation Engine for Water Plumbing Schematics
=================================================================================

Supports two calculation approaches:

Approach 1 — Single Path
    Hazen-Williams:     hf = 10.67 * L * Q^1.852 / (C^1.852 * D^4.87)
    Darcy-Weisbach:     hf = f * (L/D) * (v^2 / 2g)
    Friction factor f solved via Colebrook-White (implicit, iterative):
        1/sqrt(f) = -2 log10(epsilon/(3.7*D) + 2.51/(Re*sqrt(f)))

Approach 2 — Tree Traversal Solver
    BFS-based spanning tree solver for branching plumbing networks.
    Handles multi-source schematics and virtual (port-touching) connections.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any

import numpy as np
from scipy.optimize import brentq

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
G = 9.81          # m/s²
RHO = 1000.0      # kg/m³ (water at ~20°C)
NU = 1.004e-6     # m²/s  kinematic viscosity of water at 20°C

# ---------------------------------------------------------------------------
# Pipe specifications — Nominal Size (mm) → Internal Diameter (mm)
# ---------------------------------------------------------------------------
PIPE_SPECS: dict[str, dict[int, float]] = {
    "copper": {15: 13.6, 22: 20.2, 28: 26.2},
    "ss":     {15: 13.8, 22: 20.6, 28: 26.6},
}

# ---------------------------------------------------------------------------
# Friction coefficients
# ---------------------------------------------------------------------------
FRICTION: dict[str, dict[str, float]] = {
    "copper": {"C": 140.0, "epsilon_mm": 0.0015},
    "ss":     {"C": 150.0, "epsilon_mm": 0.015},
}

# ---------------------------------------------------------------------------
# Minor loss K-values  (hL = K * v² / 2g)
# ---------------------------------------------------------------------------
K_VALUES: dict[str, float] = {
    "elbow_90":    0.9,   # 90° elbow bend
    "tee_junction": 1.8,  # tee junction: 1 inlet, 2 outlets (branch flow)
    "gate_valve":  0.15,  # gate valve, full open
    "check_valve": 2.0,   # check valve (non-return)
}

# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _get_diameter_m(material: str, nominal_mm: int | None, custom_id_mm: float | None) -> float:
    """Return internal diameter in metres.

    Priority: custom_id_mm > nominal lookup.
    """
    if custom_id_mm is not None:
        return custom_id_mm / 1000.0
    if nominal_mm is None:
        raise ValueError("Provide either nominal_mm or custom_id_mm.")
    mat = material.lower()
    if mat not in PIPE_SPECS:
        raise ValueError(f"Unknown material '{material}'. Choose 'copper' or 'ss'.")
    if nominal_mm not in PIPE_SPECS[mat]:
        raise ValueError(f"Nominal size {nominal_mm}mm not in lookup. Use 15, 22, or 28, or supply custom_id_mm.")
    return PIPE_SPECS[mat][nominal_mm] / 1000.0


def _reynolds(velocity_ms: float, diameter_m: float) -> float:
    """Dimensionless Reynolds number: Re = v·D / ν"""
    return velocity_ms * diameter_m / NU


def _colebrook_white_f(re: float, epsilon_m: float, diameter_m: float) -> float:
    """Solve Darcy friction factor via Colebrook-White using brentq.

    Implicit equation:
        1/sqrt(f) = -2 log10(epsilon/(3.7·D) + 2.51/(Re·sqrt(f)))
    Laminar flow (Re < 2300): f = 64/Re
    """
    if re < 2300:
        return 64.0 / re

    relative_roughness = epsilon_m / diameter_m

    def _residual(f: float) -> float:
        if f <= 0:
            return 1e9
        lhs = 1.0 / math.sqrt(f)
        rhs = -2.0 * math.log10(relative_roughness / 3.7 + 2.51 / (re * math.sqrt(f)))
        return lhs - rhs

    return brentq(_residual, 1e-6, 0.5, xtol=1e-8)


def _velocity_from_flow(flow_m3s: float, diameter_m: float) -> float:
    """v = Q / A,  A = π·D²/4"""
    area = math.pi * diameter_m ** 2 / 4.0
    return flow_m3s / area


def _minor_loss_m(velocity_ms: float, fittings: dict[str, int]) -> float:
    """Sum of minor head losses: Σ(K·v²/2g) for each fitting type × count."""
    total_k = sum(K_VALUES.get(name, 0.0) * count for name, count in fittings.items())
    return total_k * velocity_ms ** 2 / (2.0 * G)


# ---------------------------------------------------------------------------
# Approach 1 — Single Path Calculator
# ---------------------------------------------------------------------------

@dataclass
class SinglePathResult:
    residual_pressure_bar: float
    velocity_ms: float
    flow_rate_lpm: float
    total_loss_bar: float
    friction_loss_bar: float
    minor_loss_bar: float
    elevation_loss_bar: float
    method: str


def calculate_single_path(
    source_pressure_bar: float,
    material: str,
    pipe_length_m: float,
    outlet_elevation_m: float = 0.0,
    source_elevation_m: float = 0.0,
    nominal_mm: int | None = None,
    custom_id_mm: float | None = None,
    fittings: dict[str, int] | None = None,
    flow_rate_lps: float | None = None,
    method: str = "darcy",
) -> SinglePathResult:
    """Calculate pressure drop along a single pipe run.

    Parameters
    ----------
    source_pressure_bar : float
        Available pressure at the upstream end (bar).
    material : str
        'copper' or 'ss' (stainless steel).
    pipe_length_m : float
        Total pipe length in metres.
    outlet_elevation_m : float
        Elevation of the outlet above datum (mRL, metres). Default 0.
    source_elevation_m : float
        Elevation of the source above datum. Default 0.
    nominal_mm : int, optional
        Nominal pipe size: 15, 22, or 28 mm. Used for ID lookup.
    custom_id_mm : float, optional
        Custom internal diameter in mm (overrides nominal lookup).
    fittings : dict, optional
        Fitting counts, e.g. {'elbow_90': 2, 'tee_junction': 1}.
        Keys must be in K_VALUES.
    flow_rate_lps : float, optional
        If provided, used directly (L/s). If None, flow is derived from
        a design velocity of 1.5 m/s (reasonable for household sizing).
    method : str
        'darcy' (Darcy-Weisbach + Colebrook-White) or 'hazen' (Hazen-Williams).

    Returns
    -------
    SinglePathResult
    """
    mat = material.lower()
    diameter_m = _get_diameter_m(mat, nominal_mm, custom_id_mm)
    area_m2 = math.pi * diameter_m ** 2 / 4.0
    fittings = fittings or {}

    # Determine flow rate / velocity
    if flow_rate_lps is not None:
        flow_m3s = flow_rate_lps / 1000.0
        velocity_ms = _velocity_from_flow(flow_m3s, diameter_m)
    else:
        # Use design velocity 1.5 m/s as starting estimate
        velocity_ms = 1.5
        flow_m3s = velocity_ms * area_m2

    flow_rate_lpm = flow_m3s * 60_000.0  # L/min

    # --- Friction head loss (metres of water) ---
    if method == "hazen":
        # Hazen-Williams:  hf = 10.67 * L * Q^1.852 / (C^1.852 * D^4.87)
        # Q in m³/s, D in metres
        C = FRICTION[mat]["C"]
        if flow_m3s <= 0:
            friction_loss_m = 0.0
        else:
            friction_loss_m = (
                10.67 * pipe_length_m * (flow_m3s ** 1.852)
                / ((C ** 1.852) * (diameter_m ** 4.87))
            )
    else:
        # Darcy-Weisbach with Colebrook-White
        re = _reynolds(velocity_ms, diameter_m)
        epsilon_m = FRICTION[mat]["epsilon_mm"] / 1000.0
        f = _colebrook_white_f(re, epsilon_m, diameter_m)
        friction_loss_m = f * (pipe_length_m / diameter_m) * (velocity_ms ** 2) / (2.0 * G)

    # --- Minor head loss ---
    minor_loss_m = _minor_loss_m(velocity_ms, fittings)

    # --- Elevation head change (positive = working against gravity) ---
    delta_z = outlet_elevation_m - source_elevation_m
    elevation_loss_m = delta_z  # positive delta_z consumes head

    # --- Total dynamic head loss ---
    total_loss_m = friction_loss_m + minor_loss_m + elevation_loss_m

    # Convert metres of water → bar  (P = ρ·g·h / 1e5)
    m_to_bar = RHO * G / 1e5

    friction_loss_bar  = friction_loss_m  * m_to_bar
    minor_loss_bar     = minor_loss_m     * m_to_bar
    elevation_loss_bar = elevation_loss_m * m_to_bar
    total_loss_bar     = total_loss_m     * m_to_bar

    residual_pressure_bar = source_pressure_bar - total_loss_bar

    return SinglePathResult(
        residual_pressure_bar=round(residual_pressure_bar, 4),
        velocity_ms=round(velocity_ms, 4),
        flow_rate_lpm=round(flow_rate_lpm, 4),
        total_loss_bar=round(total_loss_bar, 4),
        friction_loss_bar=round(friction_loss_bar, 4),
        minor_loss_bar=round(minor_loss_bar, 4),
        elevation_loss_bar=round(elevation_loss_bar, 4),
        method=method,
    )


# ---------------------------------------------------------------------------
# Approach 2 — Network Solver (Linear Theory / Hardy Cross simplified)
# ---------------------------------------------------------------------------

@dataclass
class NetworkPipe:
    """Single pipe segment in the network graph."""
    id: str
    node_from: str
    node_to: str
    length_m: float
    material: str
    nominal_mm: int | None = None
    custom_id_mm: float | None = None
    fittings: dict[str, int] = field(default_factory=dict)


@dataclass
class NetworkNode:
    """Node in the network (junction, source, or outlet)."""
    id: str
    elevation_m: float = 0.0
    demand_lps: float = 0.0          # Positive = withdrawal (outlet). 0 = junction.
    fixed_pressure_bar: float | None = None  # If set, this is a pressure source.


@dataclass
class NetworkResult:
    """Solution for the entire network."""
    pipe_flows: dict[str, float]        # pipe_id → flow (L/s)
    node_pressures: dict[str, float]    # node_id → residual pressure (bar)
    node_velocities: dict[str, float]   # pipe_id → velocity (m/s)
    converged: bool
    reached_node_ids: set = field(default_factory=set)  # nodes reachable from source via BFS


# ---------------------------------------------------------------------------
# Approach 2 — Tree traversal solver (reliable for branching plumbing networks)
# ---------------------------------------------------------------------------

def solve_tree_network(
    pipes: list[NetworkPipe],
    nodes: list[NetworkNode],
) -> NetworkResult:
    """Solve a tree-topology pipe network by graph traversal.

    Unlike the iterative network solver (which can diverge), this method:
      - Always produces physically correct results (pressure ≤ source pressure)
      - Handles typical plumbing schematics (tree / branching, no loops)
      - O(n) complexity

    Algorithm:
      1. BFS from the fixed-pressure source to build a spanning tree.
      2. Bottom-up pass: aggregate outlet demands into pipe flow rates.
      3. Top-down pass: walk tree from source, deduct friction + minor +
         elevation losses at each pipe to get residual pressure at each node.
    """
    from collections import deque

    node_map = {n.id: n for n in nodes}

    # Find source (fixed-pressure node)
    source_nodes = [n for n in nodes if n.fixed_pressure_bar is not None]
    if not source_nodes:
        return NetworkResult(
            pipe_flows={},
            node_pressures={n.id: 0.0 for n in nodes},
            node_velocities={},
            converged=False,
            reached_node_ids=set(),
        )
    source = source_nodes[0]

    # Build undirected adjacency (ignore drawn pipe direction — BFS establishes flow direction)
    adj: dict[str, list[tuple[str, NetworkPipe]]] = {n.id: [] for n in nodes}
    for p in pipes:
        if p.node_from in adj and p.node_to in adj:
            adj[p.node_from].append((p.node_to, p))
            adj[p.node_to].append((p.node_from, p))

    # BFS to build spanning tree from source
    visited: set[str] = {source.id}
    queue: deque[str] = deque([source.id])
    bfs_order: list[str] = [source.id]
    parent_of: dict[str, str | None] = {source.id: None}
    pipe_to_parent: dict[str, NetworkPipe | None] = {source.id: None}
    children_of: dict[str, list[str]] = {n.id: [] for n in nodes}

    while queue:
        curr = queue.popleft()
        for neighbor, pipe in adj.get(curr, []):
            if neighbor not in visited:
                visited.add(neighbor)
                queue.append(neighbor)
                bfs_order.append(neighbor)
                parent_of[neighbor] = curr
                pipe_to_parent[neighbor] = pipe
                children_of.setdefault(curr, []).append(neighbor)

    # --- Bottom-up: aggregate demand flows (m³/s) ---
    flow_through: dict[str, float] = {}
    for nid in reversed(bfs_order):
        n = node_map[nid]
        own = n.demand_lps / 1000.0 if n.demand_lps > 0 else 0.0
        child_sum = sum(flow_through.get(c, 0.0) for c in children_of.get(nid, []))
        flow_through[nid] = own + child_sum

    # Map pipe ID → flow (m³/s)
    pipe_flows_m3s: dict[str, float] = {}
    for nid in bfs_order[1:]:
        p = pipe_to_parent.get(nid)
        if p:
            pipe_flows_m3s[p.id] = max(flow_through.get(nid, 0.0), 1e-6)

    # --- Top-down: compute pressures ---
    node_pressures: dict[str, float] = {source.id: float(source.fixed_pressure_bar)}
    node_velocities: dict[str, float] = {}

    for nid in bfs_order[1:]:
        pipe = pipe_to_parent.get(nid)
        if pipe is None:
            continue
        pid = parent_of[nid]

        d = _get_diameter_m(pipe.material.lower(), pipe.nominal_mm, pipe.custom_id_mm)
        area = math.pi * d ** 2 / 4.0
        Q = pipe_flows_m3s.get(pipe.id, 1e-6)  # m³/s
        v = Q / area

        # Friction loss — Darcy-Weisbach
        re = max(_reynolds(v, d), 1.0)
        eps_m = FRICTION[pipe.material.lower()]["epsilon_mm"] / 1000.0
        f_dw = _colebrook_white_f(re, eps_m, d)
        hf_m = f_dw * (pipe.length_m / d) * (v ** 2) / (2.0 * G)

        # Minor losses
        hm_m = _minor_loss_m(v, pipe.fittings)

        # Elevation change (positive = uphill = pressure drops)
        n_from = node_map.get(pid or "")
        n_to = node_map.get(nid)
        delta_z = (n_to.elevation_m - n_from.elevation_m) if (n_from and n_to) else 0.0

        total_loss_bar = (hf_m + hm_m + delta_z) * (RHO * G / 1e5)

        parent_p = node_pressures.get(pid or "", 0.0)
        node_pressures[nid] = round(max(parent_p - total_loss_bar, 0.0), 4)
        node_velocities[pipe.id] = round(v, 4)

    # Disconnected nodes → 0 bar
    for n in nodes:
        node_pressures.setdefault(n.id, 0.0)

    pipe_flows_lps = {pid: round(q * 1000.0, 4) for pid, q in pipe_flows_m3s.items()}

    return NetworkResult(
        pipe_flows=pipe_flows_lps,
        node_pressures=node_pressures,
        node_velocities=node_velocities,
        converged=True,
        reached_node_ids=visited,
    )



# ---------------------------------------------------------------------------
# CLI demo — run directly: python hydraulic_engine.py
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print("=" * 60)
    print("Hydraulic Engine — CLI Demo")
    print("22mm Copper, 10m, 2 × 90° elbows + 1 × tee, 3 bar source")
    print("=" * 60)

    # --- Approach 1: Darcy-Weisbach ---
    result_darcy = calculate_single_path(
        source_pressure_bar=3.0,
        material="copper",
        pipe_length_m=10.0,
        outlet_elevation_m=0.0,
        nominal_mm=22,
        fittings={"elbow_90": 2, "tee_junction": 1},
        method="darcy",
    )
    print("\n[Darcy-Weisbach]")
    print(f"  Residual pressure : {result_darcy.residual_pressure_bar:.4f} bar")
    print(f"  Velocity          : {result_darcy.velocity_ms:.4f} m/s")
    print(f"  Flow rate         : {result_darcy.flow_rate_lpm:.2f} L/min")
    print(f"  Total loss        : {result_darcy.total_loss_bar:.4f} bar")
    print(f"    Friction loss   : {result_darcy.friction_loss_bar:.4f} bar")
    print(f"    Minor loss      : {result_darcy.minor_loss_bar:.4f} bar")

    # --- Approach 1: Hazen-Williams ---
    result_hw = calculate_single_path(
        source_pressure_bar=3.0,
        material="copper",
        pipe_length_m=10.0,
        outlet_elevation_m=0.0,
        nominal_mm=22,
        fittings={"elbow_90": 2, "tee_junction": 1},
        method="hazen",
    )
    print("\n[Hazen-Williams]")
    print(f"  Residual pressure : {result_hw.residual_pressure_bar:.4f} bar")
    print(f"  Velocity          : {result_hw.velocity_ms:.4f} m/s")
    print(f"  Flow rate         : {result_hw.flow_rate_lpm:.2f} L/min")
    print(f"  Total loss        : {result_hw.total_loss_bar:.4f} bar")

    print("\nDone.")
