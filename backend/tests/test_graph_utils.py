"""
graph_utils.build_adjacency — proximity-fallback (Method 4) guard.

Regression coverage for a real bug found in the "2x Pump Manifold — With
Bypass" template: a pump's two flanking components (each explicitly wired to
the pump via connects_to_element_id) sat close enough together, across the
pump's small footprint, to trip the 5px port-proximity fallback and get
linked *directly to each other* — silently routing around the pump in any
topology search, even though neither port was actually unconnected.
"""

from app.agents.graph_utils import build_adjacency


def el_with_ports(id_, ports):
    return {"id": id_, "symbol_id": "component", "ports": ports, "connected_pipe_ids": []}


def port(index, x, y, connects_to=None):
    return {
        "index": index,
        "position": {"canvas_x": x, "canvas_y": y},
        "connects_to_element_id": connects_to,
    }


def test_proximity_fallback_skips_ports_already_explicitly_wired():
    """
    Two flanking elements (A, B) are each explicitly wired to a pump (P) in
    between them. Their outward-facing ports (the ones NOT connected to P)
    happen to sit within the 5px proximity threshold of each other purely
    because P's footprint is small — this must NOT create a direct A-B edge.
    """
    pump = el_with_ports("pump", [
        port(0, 51.5, 0, connects_to="a"),
        port(1, 46.9, 0, connects_to="b"),
    ])
    a = el_with_ports("a", [
        port(0, 57.4, 0, connects_to=None),   # outward port, unconnected
        port(1, 51.4, 0, connects_to="pump"),  # inward port, wired to pump
    ])
    b = el_with_ports("b", [
        port(0, 47.4, 0, connects_to="pump"),  # inward port, wired to pump
        port(1, 41.4, 0, connects_to=None),    # outward port, unconnected
    ])
    elements = [pump, a, b]

    adj = build_adjacency(elements, pipes=[])

    assert adj["a"] == {"pump"}
    assert adj["b"] == {"pump"}
    assert "b" not in adj.get("a", set())
    assert "a" not in adj.get("b", set())


def test_proximity_fallback_still_links_genuinely_unconnected_touching_ports():
    """Two elements with no explicit wiring at all, but touching ports, should
    still be linked — this is Method 4's actual intended use case."""
    a = el_with_ports("a", [port(0, 10, 10, connects_to=None)])
    b = el_with_ports("b", [port(0, 11, 10, connects_to=None)])
    adj = build_adjacency([a, b], pipes=[])
    assert adj["a"] == {"b"}
    assert adj["b"] == {"a"}
