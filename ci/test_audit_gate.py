"""Rules of ci/audit_gate.py, on synthetic reports shaped like the real tools'."""

from __future__ import annotations

import datetime as dt

import pytest

from audit_gate import NotAReport, evaluate, parse_npm_audit, parse_pip_audit

TODAY = dt.date(2026, 10, 12)

PIP = {"dependencies": [
    {"name": "starlette", "version": "0.37.2",
     "vulns": [{"id": "PYSEC-1", "aliases": ["GHSA-pip1"], "description": "x"}]},
    {"name": "fastapi", "version": "0.143.0", "vulns": []},
]}


def npm(severity: str, name: str = "axios", ghsa: str = "GHSA-npm1") -> dict:
    return {"metadata": {}, "vulnerabilities": {
        name: {"name": name, "severity": severity, "via": [
            {"source": 1, "name": name, "title": "t", "severity": severity,
             "url": f"https://github.com/advisories/{ghsa}"}]},
        # Inherits the advisory from `name`: must not be counted twice.
        "parent": {"name": "parent", "severity": severity, "via": [name]},
    }}


def test_any_pip_advisory_blocks():
    failures, _ = evaluate(parse_pip_audit(PIP), [], TODAY)
    assert len(failures) == 1 and "PYSEC-1" in failures[0]


def test_runtime_npm_blocks_at_high_not_moderate():
    assert evaluate(parse_npm_audit(npm("high"), "npm-runtime"), [], TODAY)[0]
    assert not evaluate(parse_npm_audit(npm("moderate"), "npm-runtime"), [], TODAY)[0]


def test_dev_npm_only_reports_even_when_critical():
    failures, notes = evaluate(parse_npm_audit(npm("critical"), "npm-all"), [], TODAY)
    assert not failures and notes[0].startswith("report")


def test_inherited_via_names_are_not_extra_advisories():
    assert len(parse_npm_audit(npm("high"), "npm-runtime")) == 1


def test_waiver_clears_a_blocking_advisory_until_it_expires():
    advs = parse_npm_audit(npm("high"), "npm-runtime")
    waiver = {"id": "GHSA-npm1", "reason": "browser build has no proxy", "expires": "2026-12-31"}
    assert not evaluate(advs, [waiver], TODAY)[0]
    failures, _ = evaluate(advs, [waiver], dt.date(2027, 1, 1))
    assert any("EXPIRED" in f for f in failures)


def test_waiver_matches_pip_aliases():
    waiver = {"id": "GHSA-pip1", "reason": "r", "expires": "2026-12-31"}
    assert not evaluate(parse_pip_audit(PIP), [waiver], TODAY)[0]


def test_waiver_without_reason_or_expiry_fails():
    failures, _ = evaluate([], [{"id": "GHSA-x"}], TODAY)
    assert failures and "missing" in failures[0]


def test_unused_waiver_is_flagged_for_removal():
    _, notes = evaluate([], [{"id": "GHSA-gone", "reason": "r", "expires": "2026-12-31"}], TODAY)
    assert any("unused exception GHSA-gone" in n for n in notes)


def test_a_tool_error_is_not_a_clean_report():
    """npm audit offline writes {"error": ...}; that must fail, not pass as 0."""
    with pytest.raises(NotAReport):
        parse_npm_audit({"error": {"code": "ENOTFOUND"}}, "npm-runtime")
    with pytest.raises(NotAReport):
        parse_pip_audit({})
