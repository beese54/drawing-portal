"""
test_request_limits.py — Caps on the two unauthenticated public POST endpoints.

Covers the security risk assessment (held outside this repo): R-01 (unbounded
arrays), R-02 (unbounded image
decode) and R-03 (unbounded crops). Each test asserts both directions: that a
legitimate payload still passes, and that the abusive one is rejected — a cap
that rejects everything would "pass" a one-sided test.
"""

from __future__ import annotations

import io
import json

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.config import settings
from app.main import app

client = TestClient(app)


# ── helpers ─────────────────────────────────────────────────────────────────

def _metadata(n_elements: int = 1, n_pipes: int = 0, ports_each: int = 0) -> str:
    elements = [
        {
            "id": f"e{i}",
            "type": "tap",
            "position": {"canvas_x": i, "canvas_y": 0},
            "ports": [{"position": {"canvas_x": i, "canvas_y": j}} for j in range(ports_each)],
        }
        for i in range(n_elements)
    ]
    pipes = [{"id": f"p{i}"} for i in range(n_pipes)]
    return json.dumps({
        "elements": elements,
        "pipes": pipes,
        "canvas": {"width_px": 1200, "height_px": 800},
    })


def _png(width: int, height: int) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (width, height), "white").save(buf, format="PNG")
    return buf.getvalue()


# ── R-01: element / pipe / port caps ────────────────────────────────────────

def test_normal_payload_is_accepted():
    r = client.post("/api/evaluate", data={"metadata_json": _metadata(5, 2, ports_each=2)})
    assert r.status_code == 200


def test_elements_at_the_cap_are_accepted():
    r = client.post("/api/evaluate", data={"metadata_json": _metadata(settings.max_elements)})
    assert r.status_code == 200


def test_too_many_elements_is_rejected():
    r = client.post("/api/evaluate", data={"metadata_json": _metadata(settings.max_elements + 1)})
    assert r.status_code == 413
    assert "over the" in r.json()["detail"]


def test_too_many_pipes_is_rejected():
    r = client.post("/api/evaluate", data={"metadata_json": _metadata(1, settings.max_pipes + 1)})
    assert r.status_code == 413


def test_too_many_ports_is_rejected_even_when_element_count_is_tiny():
    """The case capping elements alone would miss: few elements, huge port
    counts. build_adjacency is quadratic in TOTAL ports, not in elements."""
    ports_each = settings.max_total_ports  # 10 elements x this = 10x over
    r = client.post("/api/evaluate", data={"metadata_json": _metadata(10, 0, ports_each)})
    assert r.status_code == 413
    assert "ports" in r.json()["detail"]


def test_malformed_element_still_returns_422_not_413():
    """Shape errors must stay 422 — the new size checks must not swallow them."""
    bad = json.dumps({"elements": [{"no_id": True}], "pipes": []})
    r = client.post("/api/evaluate", data={"metadata_json": bad})
    assert r.status_code == 422


# ── SI-09: attacker-controlled canvas dimensions ────────────────────────────

@pytest.mark.parametrize("canvas", ['{"width_px": "abc"}', '{"width_px": null}', '"not-a-dict"', "[]"])
def test_bad_canvas_does_not_500(canvas):
    payload = '{"elements": [], "pipes": [], "canvas": %s}' % canvas
    r = client.post("/api/evaluate", data={"metadata_json": payload})
    assert r.status_code == 200


# ── R-02: image upload caps ─────────────────────────────────────────────────

def test_reasonable_image_is_accepted():
    r = client.post(
        "/api/evaluate",
        data={"metadata_json": _metadata(2)},
        files={"schematic_image": ("s.png", _png(80, 60), "image/png")},
    )
    assert r.status_code == 200


def test_oversized_image_is_rejected():
    blob = b"\xff" * (settings.max_image_bytes + 1024)
    r = client.post(
        "/api/evaluate",
        data={"metadata_json": _metadata(2)},
        files={"schematic_image": ("s.png", blob, "image/png")},
    )
    assert r.status_code == 413


def test_non_image_content_type_is_rejected():
    r = client.post(
        "/api/evaluate",
        data={"metadata_json": _metadata(2)},
        files={"schematic_image": ("s.txt", b"hello", "text/plain")},
    )
    assert r.status_code == 422


def test_pillow_bomb_guard_is_below_the_container_ceiling():
    """Pillow's default (~89.5M px) is ~268MB after .convert('RGB') — above the
    pod's memory limit. Regression guard: the configured value must stay low
    enough that a decoded image cannot exceed the container."""
    assert Image.MAX_IMAGE_PIXELS == settings.max_image_pixels
    assert settings.max_image_pixels * 3 < 128 * 1024 * 1024


def test_pixel_dense_image_is_rejected_before_decode():
    """A small file that decodes huge — the decompression-bomb shape. Asserted
    directly against the annotator, since building a real bomb through the
    endpoint would need the very allocation this prevents."""
    from app.services.image_annotator import annotate_schematic

    over = settings.max_image_pixels + 1
    side = int(over ** 0.5) + 1

    class _FakeImage:
        size = (side, side)

        def convert(self, _mode):  # pragma: no cover - must never be reached
            raise AssertionError("convert() ran — the pixel check did not stop the decode")

    import app.services.image_annotator as annotator

    original = annotator.Image.open
    annotator.Image.open = lambda _buf: _FakeImage()
    try:
        with pytest.raises(ValueError, match="over the"):
            annotate_schematic(b"stub", [{"canvas_x": 0, "canvas_y": 0, "label": "x", "color": "red"}], 100, 100)
    finally:
        annotator.Image.open = original


# ── R-03: DOCX export crop caps ─────────────────────────────────────────────

def _rows(n: int) -> str:
    return json.dumps([
        {"check_id": "C1", "check_title": "t", "status": "FAIL", "text": "x", "crop_index": None}
        for _ in range(n)
    ])


def test_normal_export_is_accepted():
    r = client.post("/api/export/docx", data={"manifest_json": _rows(3)})
    assert r.status_code == 200


def test_too_many_rows_is_rejected():
    r = client.post("/api/export/docx", data={"manifest_json": _rows(settings.max_report_rows + 1)})
    assert r.status_code == 413


def test_too_many_crops_is_rejected():
    files = [("crops", (f"c{i}.png", _png(4, 4), "image/png")) for i in range(settings.max_crops + 1)]
    r = client.post("/api/export/docx", data={"manifest_json": _rows(1)}, files=files)
    assert r.status_code == 413


def test_crops_over_the_combined_size_limit_are_rejected():
    """Each crop is individually unremarkable; the total is what bites."""
    chunk = b"\x00" * (4 * 1024 * 1024)
    count = (settings.max_total_crop_bytes // len(chunk)) + 2
    files = [("crops", (f"c{i}.png", chunk, "image/png")) for i in range(count)]
    r = client.post("/api/export/docx", data={"manifest_json": _rows(1)}, files=files)
    assert r.status_code == 413
