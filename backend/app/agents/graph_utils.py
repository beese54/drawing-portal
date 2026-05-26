"""
graph_utils.py — Shared topology helpers used by compliance checks.
"""

from __future__ import annotations
from collections import defaultdict


def build_adjacency(elements: list[dict], pipes: list[dict]) -> dict[str, set[str]]:
    """Build an undirected adjacency map from pipes + port-to-port connections.

    Handles all four pipe endpoint field variants (flow_from/to and start/end_connects_to)
    so results are correct regardless of how the frontend serialises each pipe.
    """
    adj: dict[str, set[str]] = defaultdict(set)

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

    for el in elements:
        el_id = el["id"]
        for port in el.get("ports", []):
            conn = port.get("connects_to_element_id")
            if conn and conn != el_id:
                adj[el_id].add(conn)
                adj[conn].add(el_id)

    return adj
