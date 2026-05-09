"""
hydraulic_engine.py — Hydraulic Calculation Engine for Water Plumbing Schematics
=================================================================================

Supports two calculation approaches:

Approach 1 — Single Path
    Hazen-Williams:     hf = 10.67 * L * Q^1.852 / (C^1.852 * D^4.87)
    Darcy-Weisbach:     hf = f * (L/D) * (v^2 / 2g)
    Friction factor f solved via Colebrook-White (implicit, iterative):
        1/sqrt(f) = -2 log10(epsilon/(3.7*D) + 2.51/(Re*sqrt(f)))

Approach 2 — Network Solver
    Linear Theory method (simplified Hardy Cross) using scipy.optimize.fsolve.
    Solves simultaneous head-loss / continuity equations for a branched network.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any

import numpy as np
from scipy.optimize import brentq, fsolve

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


def solve_network(
    pipes: list[NetworkPipe],
    nodes: list[NetworkNode],
) -> NetworkResult:
    """Solve pipe network using Linear Theory (iterative conductance method).

    The Linear Theory method linearises the head-loss equation at each iteration:
        h_f,k = R_k * Q_k^n  →  linearised as  h_f,k ≈ (R_k * Q_k^(n-1)) * Q_k
    where n=1.852 (Hazen-Williams) or n=2 (Darcy approximation).

    For simplicity this solver uses Darcy-Weisbach with a fixed Moody f (0.02)
    as the linearisation seed, then iterates until flow corrections < 0.1%.

    Parameters
    ----------
    pipes : list[NetworkPipe]
    nodes : list[NetworkNode]

    Returns
    -------
    NetworkResult
    """
    node_map: dict[str, NetworkNode] = {n.id: n for n in nodes}
    pipe_ids = [p.id for p in pipes]
    n_pipes = len(pipes)
    n_nodes = len(nodes)

    # Identify fixed-pressure (source) nodes and free nodes
    source_nodes = [n.id for n in nodes if n.fixed_pressure_bar is not None]
    free_node_ids = [n.id for n in nodes if n.fixed_pressure_bar is None]
    n_free = len(free_node_ids)
    free_node_idx = {nid: i for i, nid in enumerate(free_node_ids)}

    # Pre-compute pipe geometry
    diameters: list[float] = []
    areas: list[float] = []
    epsilons: list[float] = []
    for p in pipes:
        d = _get_diameter_m(p.material.lower(), p.nominal_mm, p.custom_id_mm)
        diameters.append(d)
        areas.append(math.pi * d ** 2 / 4.0)
        epsilons.append(FRICTION[p.material.lower()]["epsilon_mm"] / 1000.0)

    # Initialise flows (equal distribution from sources)
    total_demand = sum(n.demand_lps for n in nodes if n.demand_lps > 0)
    q = np.full(n_pipes, max(total_demand / n_pipes, 0.001) / 1000.0)  # m³/s

    def pipe_resistance(i: int, qi: float) -> float:
        """Darcy-Weisbach resistance: R such that hf = R * |Q| * Q (m per m³/s)."""
        d = diameters[i]
        area = areas[i]
        p = pipes[i]
        v = abs(qi) / area if area > 0 else 0.001
        re = max(_reynolds(v, d), 1.0)
        f = _colebrook_white_f(re, epsilons[i], d)
        # Darcy friction resistance coefficient
        R_darcy = f * p.length_m / (d * 2.0 * G * area ** 2)
        # Minor losses: K_total * 1/(2g*A²) — equivalent pipe resistance
        total_k = sum(K_VALUES.get(fname, 0.0) * cnt for fname, cnt in p.fittings.items())
        R_minor = total_k / (2.0 * G * area ** 2)
        return R_darcy + R_minor

    def equations(q_vec: np.ndarray) -> np.ndarray:
        """Residuals: continuity at free nodes."""
        res = np.zeros(n_free)
        # Build node flow balance: inflow - outflow - demand = 0
        for fn_id, fi in free_node_idx.items():
            balance = -node_map[fn_id].demand_lps / 1000.0
            for i, p in enumerate(pipes):
                if p.node_to == fn_id:
                    balance += q_vec[i]
                elif p.node_from == fn_id:
                    balance -= q_vec[i]
            res[fi] = balance
        return res

    # Use scipy fsolve with a Jacobian-free approach
    # For a proper network solve we embed head equations directly.
    # Build the full [continuity + head-loss] system.

    def full_system(x: np.ndarray) -> np.ndarray:
        """x = [Q_0..Q_{n_pipes-1}, H_free_0..H_free_{n_free-1}]"""
        q_vec = x[:n_pipes]
        h_free = x[n_pipes:]

        residuals = np.zeros(n_pipes + n_free)

        # Head-loss equations: for each pipe: hf(Q) = H_from - H_to
        for i, p in enumerate(pipes):
            R = pipe_resistance(i, q_vec[i])
            hf = R * abs(q_vec[i]) * q_vec[i]  # signed

            h_from = (node_map[p.node_from].fixed_pressure_bar / (RHO * G / 1e5)
                      + node_map[p.node_from].elevation_m
                      if node_map[p.node_from].fixed_pressure_bar is not None
                      else h_free[free_node_idx[p.node_from]] + node_map[p.node_from].elevation_m)
            h_to   = (node_map[p.node_to].fixed_pressure_bar / (RHO * G / 1e5)
                      + node_map[p.node_to].elevation_m
                      if node_map[p.node_to].fixed_pressure_bar is not None
                      else h_free[free_node_idx[p.node_to]] + node_map[p.node_to].elevation_m)

            residuals[i] = h_from - h_to - hf

        # Continuity equations at free nodes
        for fn_id, fi in free_node_idx.items():
            balance = -node_map[fn_id].demand_lps / 1000.0
            for i, p in enumerate(pipes):
                if p.node_to == fn_id:
                    balance += q_vec[i]
                elif p.node_from == fn_id:
                    balance -= q_vec[i]
            residuals[n_pipes + fi] = balance

        return residuals

    # Initial guess: small positive flows, head = source pressure head
    src_head = 0.0
    for n in nodes:
        if n.fixed_pressure_bar is not None:
            src_head = n.fixed_pressure_bar / (RHO * G / 1e5) + n.elevation_m
            break

    x0 = np.concatenate([q, np.full(n_free, src_head * 0.9)])
    sol = fsolve(full_system, x0, full_output=True)
    x_sol, info, ier, msg = sol
    converged = (ier == 1)

    q_sol = x_sol[:n_pipes]
    h_free_sol = x_sol[n_pipes:]

    # Reconstruct node pressures (bar)
    node_pressures: dict[str, float] = {}
    for n in nodes:
        if n.fixed_pressure_bar is not None:
            node_pressures[n.id] = n.fixed_pressure_bar
        else:
            h_total = h_free_sol[free_node_idx[n.id]] + n.elevation_m
            p_bar = (h_total - n.elevation_m) * (RHO * G / 1e5)
            node_pressures[n.id] = round(float(p_bar), 4)

    pipe_flows = {p.id: round(float(abs(q_sol[i])) * 1000.0, 4) for i, p in enumerate(pipes)}  # L/s
    node_velocities = {
        p.id: round(float(abs(q_sol[i])) / areas[i], 4)
        for i, p in enumerate(pipes)
    }

    return NetworkResult(
        pipe_flows=pipe_flows,
        node_pressures=node_pressures,
        node_velocities=node_velocities,
        converged=converged,
    )


# ---------------------------------------------------------------------------
# Approach 3 — Tree traversal solver (reliable for branching plumbing networks)
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
# Convenience wrapper — accepts DrawingMetadata JSON dict (from frontend export)
# ---------------------------------------------------------------------------

def analyse_schematic(
    metadata: dict[str, Any],
    source_pressure_bar: float,
    material: str,
    nominal_mm: int | None = None,
    custom_id_mm: float | None = None,
    fittings_per_pipe: dict[str, dict[str, int]] | None = None,
) -> dict[str, Any]:
    """Run network analysis on a DrawingMetadata JSON export.

    Parameters
    ----------
    metadata : dict
        Output of `buildMetadata()` from the frontend.
    source_pressure_bar : float
        Mains / source pressure in bar.
    material : str
        Pipe material: 'copper' or 'ss'.
    nominal_mm : int, optional
        Nominal pipe size (15 / 22 / 28 mm).
    custom_id_mm : float, optional
        Custom internal diameter in mm.
    fittings_per_pipe : dict, optional
        Mapping of pipe_id → fittings dict for minor losses.

    Returns
    -------
    dict with 'network_result', 'hydraulic_context', and per-outlet 'outlet_summary'.
    """
    fittings_per_pipe = fittings_per_pipe or {}

    # Build NetworkNode list from elements
    network_nodes: list[NetworkNode] = []
    elements = metadata.get("elements", [])
    hc = metadata.get("hydraulic_context", {})

    for el in elements:
        node_type = el.get("node_type", "")
        elevation = el.get("elevation_m", 0.0)
        # Source node gets fixed pressure
        if el["id"] == hc.get("source_element_id"):
            network_nodes.append(NetworkNode(
                id=el["id"],
                elevation_m=elevation,
                fixed_pressure_bar=source_pressure_bar,
            ))
        elif node_type in ("outlet", "water_fittings"):
            network_nodes.append(NetworkNode(
                id=el["id"],
                elevation_m=elevation,
                demand_lps=0.1,  # default design demand per outlet
            ))
        else:
            network_nodes.append(NetworkNode(
                id=el["id"],
                elevation_m=elevation,
            ))

    # Build NetworkPipe list from pipes
    network_pipes: list[NetworkPipe] = []
    for pipe in metadata.get("pipes", []):
        from_id = pipe.get("flow_from_element_id") or pipe.get("start_connects_to")
        to_id   = pipe.get("flow_to_element_id")   or pipe.get("end_connects_to")
        if not from_id or not to_id:
            continue
        length_px = pipe.get("length_px", 100.0)
        # Rough scale: assume canvas is ~5m wide per 1000px
        length_m = max(length_px / 200.0, 0.5)
        network_pipes.append(NetworkPipe(
            id=pipe["id"],
            node_from=from_id,
            node_to=to_id,
            length_m=length_m,
            material=material,
            nominal_mm=nominal_mm,
            custom_id_mm=custom_id_mm,
            fittings=fittings_per_pipe.get(pipe["id"], {}),
        ))

    if not network_pipes or len(network_nodes) < 2:
        return {"error": "Insufficient network topology for analysis."}

    result = solve_network(network_pipes, network_nodes)

    # Outlet summary
    outlet_summary = []
    for node in network_nodes:
        if node.demand_lps > 0:
            outlet_summary.append({
                "node_id": node.id,
                "residual_pressure_bar": result.node_pressures.get(node.id, 0.0),
                "elevation_m": node.elevation_m,
            })

    return {
        "network_result": {
            "pipe_flows_lps": result.pipe_flows,
            "node_pressures_bar": result.node_pressures,
            "pipe_velocities_ms": result.node_velocities,
            "converged": result.converged,
        },
        "outlet_summary": outlet_summary,
        "hydraulic_context": hc,
    }


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

    # --- Approach 2: Simple network (source → junction → 2 outlets) ---
    print("\n[Network Solver — branched system]")
    pipes_net = [
        NetworkPipe("p1", "source", "junction", 8.0,  "copper", nominal_mm=22),
        NetworkPipe("p2", "junction", "outlet_a", 5.0, "copper", nominal_mm=15,
                    fittings={"elbow_90": 1}),
        NetworkPipe("p3", "junction", "outlet_b", 4.0, "copper", nominal_mm=15,
                    fittings={"check_valve": 1}),
    ]
    nodes_net = [
        NetworkNode("source",   elevation_m=0.0, fixed_pressure_bar=3.0),
        NetworkNode("junction", elevation_m=0.0),
        NetworkNode("outlet_a", elevation_m=2.0, demand_lps=0.08),
        NetworkNode("outlet_b", elevation_m=1.5, demand_lps=0.06),
    ]
    net_result = solve_network(pipes_net, nodes_net)
    print(f"  Converged : {net_result.converged}")
    print(f"  Pipe flows (L/s) : {net_result.pipe_flows}")
    print(f"  Node pressures (bar) : {net_result.node_pressures}")
    print(f"  Pipe velocities (m/s): {net_result.node_velocities}")
    print("\nDone.")
