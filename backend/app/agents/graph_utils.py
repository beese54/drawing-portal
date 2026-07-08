"""
graph_utils.py — Shared topology helpers used by compliance checks.
"""

from __future__ import annotations
from collections import defaultdict

_PORT_PROX_SQ = 25  # 5² px² — two ports within 5 canvas pixels are treated as connected


def build_adjacency(elements: list[dict], pipes: list[dict]) -> dict[str, set[str]]:
    """Build an undirected adjacency map using four complementary methods.

    1. Pipe endpoint fields (flow_from/to and start/end_connects_to)
    2. Port-level connects_to_element_id (explicit port wiring from the frontend)
    3. Element-side connected_pipe_ids fallback (belt-and-suspenders)
    4. Port-position proximity (5 px) — catches touching ports with no pipe drawn
    """
    adj: dict[str, set[str]] = defaultdict(set)

    # Method 1: pipe endpoints
    for pipe in pipes:
        endpoints = {
            pipe.get("flow_from_element_id"),
            pipe.get("flow_to_element_id"),
            pipe.get("start_connects_to"),
            pipe.get("end_connects_to"),
        }
        endpoints.discard(None)
        for a in endpoints:
            for b in endpoints:
                if a != b:
                    adj[a].add(b)

    # Method 2: port connects_to_element_id
    for el in elements:
        el_id = el["id"]
        for port in el.get("ports", []):
            conn = port.get("connects_to_element_id")
            if conn and conn != el_id:
                adj[el_id].add(conn)
                adj[conn].add(el_id)

    # Method 3: element-side connected_pipe_ids fallback
    pipe_by_id = {p["id"]: p for p in pipes}
    for el in elements:
        el_id = el["id"]
        for pipe_id in el.get("connected_pipe_ids", []):
            pipe = pipe_by_id.get(pipe_id)
            if not pipe:
                continue
            for field in ("flow_from_element_id", "flow_to_element_id",
                          "start_connects_to", "end_connects_to"):
                other_id = pipe.get(field)
                if other_id and other_id != el_id:
                    adj[el_id].add(other_id)
                    adj[other_id].add(el_id)

    # Method 4: port-position proximity (5 px threshold)
    # Only fires for pairs not already connected via Methods 1-3, and only
    # between ports that are themselves still unconnected (no connects_to_element_id).
    # Without that per-port guard, two elements that are each separately wired to
    # a shared third component (e.g. a pair of flexible connections flanking a
    # small pump symbol) can end up spuriously linked directly to each other
    # purely because their free-standing ports happen to sit close together in a
    # tightly-packed manifold — silently skipping the real component between them.
    for i, el_a in enumerate(elements):
        for el_b in elements[i + 1:]:
            if el_b["id"] in adj.get(el_a["id"], set()):
                continue  # already connected — don't add a duplicate proximity edge
            linked = False
            for pa in el_a.get("ports", []):
                if linked:
                    break
                if pa.get("connects_to_element_id"):
                    continue  # port already explicitly wired elsewhere
                pos_a = pa.get("position", {})
                ax, ay = pos_a.get("canvas_x"), pos_a.get("canvas_y")
                if ax is None or ay is None:
                    continue
                for pb in el_b.get("ports", []):
                    if pb.get("connects_to_element_id"):
                        continue  # port already explicitly wired elsewhere
                    pos_b = pb.get("position", {})
                    bx, by = pos_b.get("canvas_x"), pos_b.get("canvas_y")
                    if bx is None or by is None:
                        continue
                    if (ax - bx) ** 2 + (ay - by) ** 2 <= _PORT_PROX_SQ:
                        adj[el_a["id"]].add(el_b["id"])
                        adj[el_b["id"]].add(el_a["id"])
                        linked = True
                        break

    return adj
