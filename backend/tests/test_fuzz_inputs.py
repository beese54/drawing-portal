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

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from hypothesis import HealthCheck, given, settings, strategies as st

from app.main import app
from tests.fuzz_strategies import (
    RAW_PLACEHOLDER,
    attack_strings,
    mutated,
    png,
    raw_json_tokens,
    seed_manifest,
    seed_metadata,
    with_raw_token,
)

client = TestClient(app, raise_server_exceptions=False)

FUZZ = settings(
    max_examples=300,
    derandomize=True,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow],
)


# ── The seeds themselves must be accepted, or the fuzzing proves nothing ─────

def test_seed_metadata_is_accepted():
    r = client.post("/api/evaluate", data={"metadata_json": json.dumps(seed_metadata())})
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
    r = client.post("/api/export/docx", data={"manifest_json": json.dumps(seed_manifest())},
                    files=[("crops", ("c0.png", png(), "image/png"))])
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
#
# The depth at which the decoder gives up depends on the platform: Windows
# CPython 3.12 fails at 3,000, Linux python:3.12-slim (the CI image) still
# parses 8,000 and fails by 20,000. 3,000 passed here and failed in GitLab.
# 100,000 is past every platform's limit.

_HUGE_INT = "1" * 5000
_DEEP = "[" * 100_000 + "]" * 100_000


@pytest.mark.parametrize("value", [_HUGE_INT, _DEEP], ids=["huge_int", "deep_nesting"])
def test_unparseable_metadata_is_rejected(value):
    r = client.post("/api/evaluate",
                    data={"metadata_json": '{"elements": [], "pipes": [], "x": ' + value + "}"})
    assert r.status_code == 422, r.text


@pytest.mark.parametrize("value", [_HUGE_INT, _DEEP], ids=["huge_int", "deep_nesting"])
def test_unparseable_manifest_is_rejected(value):
    r = client.post("/api/export/docx", data={"manifest_json": "[" + value + "]"})
    assert r.status_code == 422, r.text


# ── Regression: a lone surrogate echoed back in the response ─────────────────
# Found 2026-10-12 by the black-box suite (F11). "\ud800" is valid JSON but not
# valid Unicode. It passed validation, came back in a check's detail text, and
# the response could not be encoded as UTF-8: a 500. json.dumps writes it as
# the ASCII escape the attacker would send.

@pytest.mark.parametrize("surrogate", ["\ud800", "\udfff\ud800"], ids=["high", "reversed_pair"])
def test_lone_surrogate_in_echoed_field_is_rejected(surrogate):
    metadata = seed_metadata()
    metadata["elements"][0]["symbol_name"] = surrogate
    r = client.post("/api/evaluate", data={"metadata_json": json.dumps(metadata)})
    assert r.status_code == 422, r.text


@pytest.mark.parametrize("value", ["1e999", "-1e999", "Infinity", "NaN"])
@pytest.mark.parametrize("key", ["width_px", "height_px"])
def test_non_finite_canvas_dimension_does_not_500(key, value):
    """F12, found 2026-10-12 by the black-box suite: 1e999 decodes to inf and
    int(inf) raises OverflowError, which _safe_dimension did not catch. Sent as
    raw text; json.dumps would write inf as Infinity, not 1e999."""
    body = json.dumps(seed_metadata()).replace(
        '"canvas": {"width_px": 1200, "height_px": 800}',
        '"canvas": {"width_px": 1200, "height_px": 800, "%s": %s}' % (key, value))
    assert value in body
    r = client.post("/api/evaluate", data={"metadata_json": body})
    assert r.status_code < 500, r.text


def test_valid_surrogate_pair_is_accepted():
    """The escaped pair \\ud83d\\ude00 is one emoji, not two lone halves."""
    metadata = seed_metadata()
    metadata["elements"][0]["symbol_name"] = "\U0001f600"
    r = client.post("/api/evaluate", data={"metadata_json": json.dumps(metadata)})
    assert r.status_code == 200, r.text


# ── Property: no mutated document produces a server error ────────────────────

@FUZZ
@given(mutated(seed_metadata))
def test_evaluate_never_500s(metadata):
    r = client.post("/api/evaluate", data={"metadata_json": json.dumps(metadata)})
    assert r.status_code < 500, (r.status_code, json.dumps(metadata)[:500])


@FUZZ
@given(mutated(seed_manifest))
def test_export_never_500s(manifest):
    r = client.post("/api/export/docx", data={"manifest_json": json.dumps(manifest)},
                    files=[("crops", ("c0.png", png(), "image/png"))])
    assert r.status_code < 500, (r.status_code, json.dumps(manifest)[:500])


# The black-box suite's hostile-input strategies, as a fixed 300-example sample
# on every push. Breadth, not a guarantee: with the F11/F12 fixes removed, this
# sample did not hit either; both need one value in one of ~100 fields. The
# regression tests above pin what was found; the weekly random 2,000-example
# run of test_blackbox_http.py is what finds new ones.

@FUZZ
@given(mutated(seed_metadata, values=attack_strings, where=lambda v: isinstance(v, str)))
def test_evaluate_attack_strings_never_500(metadata):
    r = client.post("/api/evaluate", data={"metadata_json": json.dumps(metadata)})
    assert r.status_code < 500, (r.status_code, json.dumps(metadata)[:500])


@FUZZ
@given(mutated(seed_metadata, values=st.just(RAW_PLACEHOLDER)), raw_json_tokens)
def test_evaluate_parser_extremes_never_500(metadata, token):
    body = with_raw_token(metadata, token)
    r = client.post("/api/evaluate", data={"metadata_json": body})
    assert r.status_code < 500, (r.status_code, token[:100], body[:300])


@FUZZ
@given(mutated(seed_manifest, values=st.just(RAW_PLACEHOLDER)), raw_json_tokens)
def test_export_parser_extremes_never_500(manifest, token):
    body = with_raw_token(manifest, token)
    r = client.post("/api/export/docx", data={"manifest_json": body},
                    files=[("crops", ("c0.png", png(), "image/png"))])
    assert r.status_code < 500, (r.status_code, token[:100], body[:300])
