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
    # **_kw absorbs formats=["JPEG","PNG"], which annotate_schematic now passes
    # to bound which Pillow plugins may attempt the decode.
    annotator.Image.open = lambda _buf, **_kw: _FakeImage()
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
    """Each crop is individually unremarkable; the total is what bites.

    Padded onto a real PNG header so the signature check passes and the
    CUMULATIVE cap is what rejects this — otherwise the test would pass for the
    wrong reason (422 on format) and stop covering R-03.
    """
    chunk = _png(4, 4) + b"\x00" * (4 * 1024 * 1024)
    count = (settings.max_total_crop_bytes // len(chunk)) + 2
    files = [("crops", (f"c{i}.png", chunk, "image/png")) for i in range(count)]
    r = client.post("/api/export/docx", data={"manifest_json": _rows(1)}, files=files)
    assert r.status_code == 413
    assert "combined" in r.json()["detail"]


def test_single_oversized_crop_is_rejected():
    """The cumulative cap alone would let one crop claim the whole budget."""
    blob = _png(4, 4) + b"\x00" * (settings.max_crop_bytes + 1024)
    files = [("crops", ("c.png", blob, "image/png"))]
    r = client.post("/api/export/docx", data={"manifest_json": _rows(1)}, files=files)
    assert r.status_code == 413
    assert "per-file" in r.json()["detail"]


# ── Declared type vs. actual content ────────────────────────────────────────

def test_image_labelled_png_but_carrying_other_bytes_is_rejected():
    """content_type is caller-supplied. Without a signature check the allowlist
    constrains the label while Pillow's ~50 decoders stay reachable."""
    r = client.post(
        "/api/evaluate",
        data={"metadata_json": _metadata(2)},
        files={"schematic_image": ("s.png", b"GIF89a" + b"\x00" * 64, "image/png")},
    )
    assert r.status_code == 422


def test_crop_labelled_png_but_carrying_other_bytes_is_rejected():
    """This endpoint previously performed no type checking on crops at all."""
    files = [("crops", ("c.png", b"%PDF-1.4\n" + b"\x00" * 64, "image/png"))]
    r = client.post("/api/export/docx", data={"manifest_json": _rows(1)}, files=files)
    assert r.status_code == 422


def test_corrupt_but_png_signed_crop_does_not_500():
    """A signature proves a crop STARTS like an image, not that it parses.
    python-docx raises on the rest; that must not take the report down."""
    rows = json.dumps([
        {"check_id": "C1", "check_title": "t", "status": "FAIL", "text": "x", "crop_index": 0}
    ])
    truncated = _png(8, 8)[:20]  # valid signature, body cut off
    files = [("crops", ("c.png", truncated, "image/png"))]
    r = client.post("/api/export/docx", data={"manifest_json": rows}, files=files)
    assert r.status_code == 200


# ── Form-field size caps (the fields that carry the images) ─────────────────

def test_oversized_metadata_json_is_rejected_before_parsing():
    """Every other cap bounds a COUNT on the already-parsed object, so none of
    them bounds json.loads. metadata_json is also the field the frontend uses
    to carry base64 title-block stamps."""
    payload = '{"elements": [], "pipes": [], "pad": "' + "A" * (settings.max_metadata_chars + 16) + '"}'
    r = client.post("/api/evaluate", data={"metadata_json": payload})
    assert r.status_code == 413


def test_oversized_manifest_json_is_rejected_before_parsing():
    payload = '[{"text": "' + "A" * (settings.max_manifest_chars + 16) + '"}]'
    r = client.post("/api/export/docx", data={"manifest_json": payload})
    assert r.status_code == 413


# ── Response security headers ───────────────────────────────────────────────

def test_security_headers_are_set():
    """nosniff matters here specifically: /api/symbols/{id}/image serves
    image/svg+xml, and the CSP is img-src only, so it does not cover an SVG
    fetched as a document."""
    r = client.get("/api/health")
    assert r.headers["X-Content-Type-Options"] == "nosniff"
    assert r.headers["X-Frame-Options"] == "DENY"
    assert r.headers["Referrer-Policy"] == "no-referrer"
    assert r.headers["Content-Security-Policy"] == "img-src 'self' data:"


def test_cors_fallback_still_fills_the_gap_when_middleware_is_silent():
    """The split-deployment fix this fallback exists for: CORSMiddleware emits
    nothing on a request with no Origin header, and symbol images were observed
    failing for exactly that reason. Making the fallback conditional must not
    have removed the behaviour it was added for.

    Note what this canNOT assert while allow_origins is ["*"]: that the fallback
    DEFERS to CORSMiddleware. Starlette answers "*" rather than echoing the
    origin under a wildcard allowlist, so both paths produce the same header and
    the override case is indistinguishable here. It becomes assertable the
    moment allow_origins is narrowed to settings.origins_list at go-live —
    at which point this test should be extended to send a disallowed Origin and
    assert the header is ABSENT. That is the regression the conditional exists
    to prevent.
    """
    r = client.get("/api/health")
    assert r.headers["access-control-allow-origin"] == "*"
