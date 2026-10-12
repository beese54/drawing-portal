"""
test_health_version.py — /api/health must say exactly which build is running.

The image GovPaaS runs is chosen by tag (see docs/RELEASING.md), so the running
pod has to be able to confirm it: the release version and the commit are baked
in at build time (Dockerfile ARGs from docker-publish.yml) and reported here.
A build that was not given them reports "dev"/"unknown", so a local or
hand-built image can never pass for a release.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.config import Settings, settings
from app.main import app

client = TestClient(app)


def test_unset_build_info_reads_as_dev(monkeypatch):
    monkeypatch.delenv("APP_VERSION", raising=False)
    monkeypatch.delenv("GIT_COMMIT", raising=False)
    s = Settings(_env_file=None)
    assert (s.app_version, s.git_commit) == ("dev", "unknown")


def test_build_info_comes_from_the_environment(monkeypatch):
    monkeypatch.setenv("APP_VERSION", "1.1.0")
    monkeypatch.setenv("GIT_COMMIT", "cd3cff8")
    s = Settings(_env_file=None)
    assert (s.app_version, s.git_commit) == ("1.1.0", "cd3cff8")


def test_health_reports_version_and_commit(monkeypatch):
    monkeypatch.setattr(settings, "app_version", "1.1.0")
    monkeypatch.setattr(settings, "git_commit", "cd3cff8")
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "version": "1.1.0", "commit": "cd3cff8"}
