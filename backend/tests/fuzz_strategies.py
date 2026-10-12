"""
fuzz_strategies.py — Seed documents and the mutation strategy shared by the
in-process fuzz tests (test_fuzz_inputs.py) and the black-box ones that run
over HTTP against the built image (test_blackbox_http.py).

One copy, so the two suites always fuzz from the same realistic documents.
The attack strings and raw JSON tokens at the bottom are used only by the
black-box suite.
"""

from __future__ import annotations

import io
import json

from hypothesis import strategies as st
from PIL import Image

from tests.helpers import el, meta, pipe


# ── Seed documents: valid inputs that exercise every compliance check ────────

def port(x: float, y: float, connects_to: str | None = None) -> dict:
    return {"index": 0, "role": "upstream", "position": {"canvas_x": x, "canvas_y": y},
            "connects_to_element_id": connects_to}


def seed_metadata() -> dict:
    tank = el("t1", "water_tank", node_type="source", elevation_m=30.0,
              ports=[port(10, 10, "pump1")], connected_pipe_ids=["p1"],
              position={"canvas_x": 10, "canvas_y": 10},
              tank_properties={
                  "material": "FRP", "overflow_pipe_diameter_m": 0.1,
                  "inlet_pipe_diameter_m": 0.08, "overflow_pipe_m_amsl": 30.0,
                  "warning_pipe_m_amsl": 29.9, "inlet_pipe_m_amsl": 29.5,
                  "outlet_pipe_diameter_m": 0.08, "distance_outlet_to_base_m": 0.08,
                  "is_sunken_tank": False, "occupants": 4,
                  "effective_capacity_l": 1000, "daily_demand_m3": 0.564,
              })
    elements = [
        tank,
        el("pump1", "pump", node_type="pressure_booster", pump_rated_head_m=20.0,
           ports=[port(12, 10), port(40, 10)], connected_pipe_ids=["p1", "p2"]),
        el("cv1", "check_valve", node_type="check_valve", ports=[port(41, 10)]),
        el("h1", "water_heater", node_type="heat_exchanger", supply_mode="direct_supply",
           backflow_requirement="check_valve", connected_pipe_ids=["p2"]),
        el("b1", "bidet", node_type="water_fitting", backflow_requirement="vacuum_breaker"),
        el("s1", "shower_head", node_type="water_fitting", supply_mode="indirect_supply",
           fitting_type="shower", efficiency_rating=2, elevation_m=12.5),
        el("lb1", "long_bath", node_type="water_fitting", long_bath_capacity_l=250),
        el("hf1", "highest_direct_supply_fitting", highest_fitting_elevation_m=15.0),
    ]
    pipes = [pipe("p1", "t1", "pump1"), pipe("p2", "pump1", "h1")]
    pipes[0].update({"material": "copper", "supply_mode": "indirect_supply",
                     "start": {"canvas_x": 10, "canvas_y": 10, "mrl": 30.0}})
    return meta(
        elements, pipes,
        canvas={"width_px": 1200, "height_px": 800},
        materials_acknowledged=True,
        pump_discharge_material_acknowledged=True,
        tank_position_acknowledged=True,
        appliance_check_valve_acknowledged=True,
        bidet_vacuum_breaker_acknowledged=True,
    )


def seed_manifest() -> list:
    return [
        {"check_id": "REG28", "check_title": "Backflow", "status": "FAIL",
         "text": "Missing check valve", "crop_index": 0},
        {"check_id": "SEC221", "check_title": "Supply", "status": "PASS",
         "text": "ok", "crop_index": None},
    ]


# ── Mutation strategy ────────────────────────────────────────────────────────

def _paths(node, prefix=()):
    """Every location in a JSON document, as a tuple of keys/indexes."""
    yield prefix
    if isinstance(node, dict):
        for k, v in node.items():
            yield from _paths(v, prefix + (k,))
    elif isinstance(node, list):
        for i, v in enumerate(node):
            yield from _paths(v, prefix + (i,))


def _replace(doc, path, value):
    if not path:
        return value
    target = doc
    for step in path[:-1]:
        target = target[step]
    target[path[-1]] = value
    return doc


json_values = st.recursive(
    st.none() | st.booleans() | st.integers() | st.floats(allow_nan=False, allow_infinity=False)
    | st.text(max_size=20),
    lambda inner: st.lists(inner, max_size=4) | st.dictionaries(st.text(max_size=10), inner, max_size=4),
    max_leaves=8,
)


def mutated(seed_fn, values=json_values, where=lambda node: True):
    """A seed document with 1-3 locations replaced by values drawn from `values`.

    `where` picks which locations qualify, judged on the seed's original value
    there; e.g. `lambda v: isinstance(v, str)` to replace only strings."""
    seed = seed_fn()
    paths = [p for p in _paths(seed) if where(_get(seed, p))]

    @st.composite
    def build(draw):
        doc = seed_fn()
        for _ in range(draw(st.integers(1, 3))):
            # Re-list paths each time: an earlier replacement may have removed some.
            live = [p for p in paths if _exists(doc, p)]
            doc = _replace(doc, draw(st.sampled_from(live)), draw(values))
        return doc

    return build()


def _get(doc, path):
    for step in path:
        doc = doc[step]
    return doc


def _exists(doc, path):
    node = doc
    for step in path:
        if isinstance(node, dict) and step in node:
            node = node[step]
        elif isinstance(node, list) and isinstance(step, int) and step < len(node):
            node = node[step]
        else:
            return False
    return True


def png() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (8, 8), "white").save(buf, format="PNG")
    return buf.getvalue()


# ── Attack strings: hostile text for string fields ───────────────────────────
# Chosen for what the endpoints do with text: evaluate echoes element ids and
# names back in JSON, export writes row text into Office XML. Injection classes
# with no sink here (SQL: there is no database) are kept because they are cheap,
# and a VAPT tester will try them anyway.

ATTACK_STRINGS = [
    # HTML/JS: harmless only while every response is JSON + nosniff
    "<script>alert(1)</script>", '"><img src=x onerror=alert(1)>', "javascript:alert(1)",
    # Office XML: must be escaped by python-docx, or stripped by _xml_safe
    "</w:t></w:r><w:r><w:t>injected", "<![CDATA[x]]>", "]]>", "&amp;&lt;&#0;", "&xxe;",
    "a\x00b", "\x0b\x0c\x1f", "\ufffe\uffff", "\ud800", "\udfff\ud800",
    # Unicode that confuses renderers and length checks: bidi override,
    # zero-width space, astral emoji, combining accent, dotted capital I
    "\u202eevil", "\u200b" * 50, "\U0001f4a9" * 50, "e\u0301" * 50, "\u0130" * 50,
    # Format strings and template injection
    "%s%s%s%n", "{0}{1}", "{__class__.__mro__}", "{{7*7}}", "${7*7}", "#{7*7}",
    # Paths and URLs
    "../../../../etc/passwd", "..\\..\\windows\\win.ini", "file:///etc/passwd",
    "http://169.254.169.254/latest/meta-data/",
    # Spreadsheet formulas, SQL, shell: no sink, cheap to include
    "=cmd|'/c calc'!A1", "' OR '1'='1' --", "; ls -la", "$(id)", "`id`",
    # Empty and whitespace
    "", " ", "\t\n\r",
]

attack_strings = (
    st.sampled_from(ATTACK_STRINGS)
    # Repeated, to cross any length threshold a single copy would not.
    | st.builds(lambda s, n: s * n, st.sampled_from(ATTACK_STRINGS), st.integers(2, 2000))
    # Arbitrary text including control characters and surrogates.
    | st.text(st.characters(codec=None, categories=None), max_size=200)
    # Long: one character repeated, so generating it costs nothing.
    | st.builds(lambda c, n: c * n, st.characters(), st.integers(50_000, 100_000))
)


# ── Parser extremes: JSON text json.dumps can never produce ──────────────────
# Inserted as raw text in place of a placeholder string, after serialising.

RAW_PLACEHOLDER = "__RAW_JSON_TOKEN__"

raw_json_tokens = st.one_of(
    st.integers(4_301, 20_000).map(lambda n: "9" * n),       # over the int-str limit
    st.integers(4_301, 20_000).map(lambda n: "-" + "1" * n),
    st.integers(500, 5_000).map(lambda n: "[" * n + "]" * n),  # past the recursion limit
    st.integers(500, 5_000).map(lambda n: '{"a":' * n + "1" + "}" * n),
    st.sampled_from([
        "1e999", "-1e999", "1e-999", "-0", "0.0000000000000000000000001",
        "NaN", "Infinity", "-Infinity",                        # json.loads accepts these
        '{"id": "a", "id": ["b"]}',                            # duplicate keys, last wins
        r'"\ud800"', r'"\u0000"',                              # JSON escapes, raw text
    ]),
)


def with_raw_token(doc, token: str) -> str:
    """Serialise `doc`, then swap the placeholder string for raw JSON text."""
    return json.dumps(doc).replace(f'"{RAW_PLACEHOLDER}"', token, 1)
