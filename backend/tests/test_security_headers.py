"""
test_security_headers.py — The browser-enforced policy on every response (H2).

Content-Security-Policy is the browser's own check on what a page may load
and run. Until 1.1.5 it set only img-src and object-src. Now it covers
everything: script and style only from this origin, no inline code, no
plugins, no framing, no <base> rewriting, no form posts. The frontend was
audited for this (tasks/todo.md, H2): its only inline styles moved to
src/index.css, and React's style={{}} props go through the CSSOM, which CSP
does not restrict.

The exact string is pinned on purpose. Widening it ('unsafe-inline', a CDN)
should be a deliberate change to this file, not a side effect.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

CSP = (
    "default-src 'self'; script-src 'self'; style-src 'self'; "
    "img-src 'self' data:; font-src 'self'; connect-src 'self'; "
    "object-src 'none'; base-uri 'none'; form-action 'none'; "
    "frame-ancestors 'none'"
)
PERMISSIONS = "camera=(), microphone=(), geolocation=(), payment=(), usb=()"


@pytest.mark.parametrize("path", ["/api/health", "/api/symbols", "/api/no-such-route"])
def test_every_response_carries_the_full_policy(path):
    r = client.get(path)
    assert r.headers["Content-Security-Policy"] == CSP
    assert r.headers["Permissions-Policy"] == PERMISSIONS


def test_policy_never_allows_inline_or_eval_code():
    csp = client.get("/api/health").headers["Content-Security-Policy"]
    for loosening in ("'unsafe-inline'", "'unsafe-eval'", "'unsafe-hashes'", "*", "http:", "https:"):
        assert loosening not in csp.split(), loosening


def test_a_symbol_svg_opened_directly_is_covered_too():
    """An SVG rendered as a document can run script; the policy forbids it."""
    symbols = client.get("/api/symbols").json()
    first = (symbols if isinstance(symbols, list) else symbols["symbols"])[0]["id"]
    r = client.get(f"/api/symbols/{first}/image")
    assert r.status_code == 200
    assert r.headers["Content-Security-Policy"] == CSP
    assert r.headers["X-Content-Type-Options"] == "nosniff"
