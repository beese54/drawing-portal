"""
test_fuzz_inputs.py — Malformed-but-valid-JSON input must never crash the two
public POST endpoints.

Why this exists: GitLab API Security Testing (2026-10-09) fuzzed /api/evaluate
and saw only 422s, but that was because its payloads broke the JSON inside the
metadata_json form field and were rejected at json.loads. Nothing reached the
logic behind it. A hand probe with valid JSON and wrong nested types found five
inputs that returned 500 (the regression cases below), and running this file's
mutation strategy 5,000 times per endpoint then found 31 distinct crash sites
across the compliance checks and the DOCX export. Fixed by
app/services/metadata_schema.py and export.py's _xml_safe.

These tests do what the scanner could not: start from realistic, valid
documents and swap a few nested values for arbitrary JSON (wrong types, nulls,
huge numbers, nested lists). Whatever the input, the endpoint must answer
below 500: a 200 if it copes, a 4xx if it refuses. derandomize keeps CI
deterministic; raise max_examples locally to explore further.
"""

from __future__ import annotations

import io
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from hypothesis import HealthCheck, given, settings, strategies as st
from PIL import Image

from app.main import app
from tests.helpers import el, meta, pipe

client = TestClient(app, raise_server_exceptions=False)

FUZZ = settings(
    max_examples=300,
    derandomize=True,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow],
)


# ── Seed documents: valid inputs that exercise every compliance check ────────

def _port(x: float, y: float, connects_to: str | None = None) -> dict:
    return {"index": 0, "role": "upstream", "position": {"canvas_x": x, "canvas_y": y},
            "connects_to_element_id": connects_to}


def _seed_metadata() -> dict:
    tank = el("t1", "water_tank", node_type="source", elevation_m=30.0,
              ports=[_port(10, 10, "pump1")], connected_pipe_ids=["p1"],
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
           ports=[_port(12, 10), _port(40, 10)], connected_pipe_ids=["p1", "p2"]),
        el("cv1", "check_valve", node_type="check_valve", ports=[_port(41, 10)]),
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


def _seed_manifest() -> list:
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


def _mutated(seed_fn):
    """A seed document with 1-3 locations replaced by arbitrary JSON values."""
    paths = list(_paths(seed_fn()))

    @st.composite
    def build(draw):
        doc = seed_fn()
        for _ in range(draw(st.integers(1, 3))):
            # Re-list paths each time: an earlier replacement may have removed some.
            live = [p for p in paths if _exists(doc, p)]
            doc = _replace(doc, draw(st.sampled_from(live)), draw(json_values))
        return doc

    return build()


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


def _png() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (8, 8), "white").save(buf, format="PNG")
    return buf.getvalue()


# ── The seeds themselves must be accepted, or the fuzzing proves nothing ─────

def test_seed_metadata_is_accepted():
    r = client.post("/api/evaluate", data={"metadata_json": json.dumps(_seed_metadata())})
    assert r.status_code == 200, r.text


def test_real_frontend_payload_is_accepted():
    """Built by the frontend's own metadataBuilder.ts: every symbol in the library,
    connected, every optional property filled (tasks/repro/frontend_metadata_fixture.mjs).
    Guards the other direction: a schema strict enough to stop crashes must not
    also refuse real drawings."""
    payload = (Path(__file__).parent / "fixtures" / "frontend_metadata_all_symbols.json").read_text(encoding="utf-8")
    r = client.post("/api/evaluate", data={"metadata_json": payload})
    assert r.status_code == 200, r.text


def test_seed_manifest_is_accepted():
    r = client.post("/api/export/docx", data={"manifest_json": json.dumps(_seed_manifest())},
                    files=[("crops", ("c0.png", _png(), "image/png"))])
    assert r.status_code == 200, r.text


# ── Regression: the five inputs that returned 500 on 2026-10-09 ──────────────

@pytest.mark.parametrize("metadata", [
    {"elements": [{"id": "a", "ports": "xy"}], "pipes": []},
    {"elements": [{"id": "a", "ports": [1]}], "pipes": []},
    {"elements": [{"id": ["a"]}], "pipes": []},
    {"elements": [{"id": "a"}], "pipes": [{"id": "p", "flow_from_element_id": ["x"]}]},
    {"elements": [{"id": "a", "connected_pipe_ids": 5}], "pipes": []},
], ids=["ports_is_string", "port_is_int", "id_is_list", "pipe_endpoint_list",
        "connected_pipe_ids_int"])
def test_known_crash_inputs_are_rejected(metadata):
    r = client.post("/api/evaluate", data={"metadata_json": json.dumps(metadata)})
    assert r.status_code == 422, r.text


# ── Regression: JSON the parser itself refuses without a JSONDecodeError ─────
# Found 2026-10-12 (F10). Python >= 3.11 raises a plain ValueError for an
# integer over 4,300 digits, and the decoder raises RecursionError on deep
# nesting. Both escaped the routers' `except json.JSONDecodeError` as a 500.
# Sent as raw text: json.dumps could not produce either for us.

_HUGE_INT = "1" * 5000
_DEEP = "[" * 3000 + "]" * 3000


@pytest.mark.parametrize("value", [_HUGE_INT, _DEEP], ids=["huge_int", "deep_nesting"])
def test_unparseable_metadata_is_rejected(value):
    r = client.post("/api/evaluate",
                    data={"metadata_json": '{"elements": [], "pipes": [], "x": ' + value + "}"})
    assert r.status_code == 422, r.text


@pytest.mark.parametrize("value", [_HUGE_INT, _DEEP], ids=["huge_int", "deep_nesting"])
def test_unparseable_manifest_is_rejected(value):
    r = client.post("/api/export/docx", data={"manifest_json": "[" + value + "]"})
    assert r.status_code == 422, r.text


# ── Property: no mutated document produces a server error ────────────────────

@FUZZ
@given(_mutated(_seed_metadata))
def test_evaluate_never_500s(metadata):
    r = client.post("/api/evaluate", data={"metadata_json": json.dumps(metadata)})
    assert r.status_code < 500, (r.status_code, json.dumps(metadata)[:500])


@FUZZ
@given(_mutated(_seed_manifest))
def test_export_never_500s(manifest):
    r = client.post("/api/export/docx", data={"manifest_json": json.dumps(manifest)},
                    files=[("crops", ("c0.png", _png(), "image/png"))])
    assert r.status_code < 500, (r.status_code, json.dumps(manifest)[:500])
