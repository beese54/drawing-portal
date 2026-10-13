"""
test_api_docs.py — The interactive API docs are off unless asked for (H1).

FastAPI serves /docs (Swagger UI), /redoc and /openapi.json by default. The
repo is public, so this hides nothing from a reader. It is about the live
service: Swagger UI and ReDoc run script from a third-party CDN on this
origin, /docs is a ready-made console for sending requests to production, and
scanners pick up /openapi.json automatically. Development keeps them with
ENABLE_API_DOCS=1 (set by docker-compose.yml and start.sh).
"""

from __future__ import annotations

import importlib

import pytest
from fastapi.testclient import TestClient

import app.config
import app.main

DOC_PATHS = ["/docs", "/redoc", "/openapi.json", "/docs/oauth2-redirect"]


@pytest.mark.parametrize("path", DOC_PATHS)
def test_docs_are_off_by_default(path):
    r = TestClient(app.main.app).get(path)
    assert r.status_code == 404, f"{path} -> {r.status_code}"


def test_the_api_still_works_with_docs_off():
    assert TestClient(app.main.app).get("/api/health").status_code == 200


@pytest.fixture
def app_with_docs(monkeypatch):
    """The app as development runs it."""
    monkeypatch.setenv("ENABLE_API_DOCS", "1")
    importlib.reload(app.config)
    importlib.reload(app.main)
    yield TestClient(app.main.app)
    monkeypatch.delenv("ENABLE_API_DOCS")
    importlib.reload(app.config)
    importlib.reload(app.main)


@pytest.mark.parametrize("path", ["/docs", "/redoc", "/openapi.json"])
def test_docs_can_be_switched_on_for_development(app_with_docs, path):
    assert app_with_docs.get(path).status_code == 200
