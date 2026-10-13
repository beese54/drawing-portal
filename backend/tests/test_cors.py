"""
test_cors.py — No other website may read this API's responses (audit F3).

The page and the API are served from one origin (the combined image, and the
Vite proxy in development), and browsers never apply CORS to same-origin
requests, so the app itself needs no cross-origin permission at all. Until
1.1.2, every response carried `Access-Control-Allow-Origin: *`, both from
CORSMiddleware and from a fallback in the security-headers middleware that
re-added "*" whenever CORSMiddleware had not set it. That made narrowing the
allowlist a no-op.

Now cross-origin access is off unless a deployment lists origins in
ALLOWED_ORIGINS, and a listed origin is echoed back exactly, never "*".
"""

from __future__ import annotations

import importlib
import json

import pytest
from fastapi.testclient import TestClient

import app.config
import app.main
from app.config import Settings
from tests.fuzz_strategies import seed_metadata

EVIL = "https://evil.example"
LISTED = "http://localhost:3000"
ACAO = "access-control-allow-origin"


def _client() -> TestClient:
    return TestClient(app.main.app)


def test_other_website_gets_no_permission_on_get():
    r = _client().get("/api/health", headers={"Origin": EVIL})
    assert r.status_code == 200
    assert ACAO not in r.headers, r.headers.get(ACAO)


def test_other_website_gets_no_permission_on_post():
    r = _client().post("/api/evaluate", headers={"Origin": EVIL},
                       data={"metadata_json": json.dumps(seed_metadata())})
    assert r.status_code == 200
    assert ACAO not in r.headers, r.headers.get(ACAO)


def test_preflight_from_other_website_is_refused():
    r = _client().options("/api/evaluate", headers={
        "Origin": EVIL, "Access-Control-Request-Method": "POST"})
    assert r.status_code == 400
    assert ACAO not in r.headers, r.headers.get(ACAO)


def test_same_origin_request_works_without_cors_headers():
    """The real app: no Origin header on same-origin GETs, and none needed."""
    r = _client().get("/api/health")
    assert r.status_code == 200
    assert ACAO not in r.headers


def test_empty_allowlist_means_no_origins():
    assert Settings(_env_file=None, allowed_origins="").origins_list == []
    assert Settings(_env_file=None, allowed_origins=" a , ,b ").origins_list == ["a", "b"]


@pytest.fixture
def app_listing_one_origin(monkeypatch):
    """The app as a deployment that opts in to one cross-origin frontend."""
    monkeypatch.setenv("ALLOWED_ORIGINS", LISTED)
    importlib.reload(app.config)
    importlib.reload(app.main)
    yield TestClient(app.main.app)
    monkeypatch.delenv("ALLOWED_ORIGINS")
    importlib.reload(app.config)
    importlib.reload(app.main)


def test_a_listed_origin_is_echoed_exactly_never_wildcard(app_listing_one_origin):
    c = app_listing_one_origin
    assert c.get("/api/health", headers={"Origin": LISTED}).headers.get(ACAO) == LISTED
    assert ACAO not in c.get("/api/health", headers={"Origin": EVIL}).headers


def test_a_listed_origin_may_only_preflight_the_methods_the_api_has(app_listing_one_origin):
    ok = app_listing_one_origin.options("/api/evaluate", headers={
        "Origin": LISTED, "Access-Control-Request-Method": "POST"})
    assert ok.status_code == 200 and ok.headers.get(ACAO) == LISTED
    refused = app_listing_one_origin.options("/api/evaluate", headers={
        "Origin": LISTED, "Access-Control-Request-Method": "DELETE"})
    assert refused.status_code == 400
