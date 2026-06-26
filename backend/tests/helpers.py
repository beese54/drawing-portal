"""Shared builder helpers for compliance check tests.

All compliance check functions are pure (dict → CheckResult), so tests just build
minimal metadata dicts and assert on the result. No mocking, no DB, no HTTP.
"""

from __future__ import annotations


def el(id_: str, sym: str, **kw) -> dict:
    """Minimal element dict. Extra kwargs override defaults (e.g. backflow_requirement, elevation_m)."""
    base: dict = {
        "id": id_,
        "symbol_id": sym,
        "symbol_name": sym.replace("_", " ").title(),
        "ports": [],
        "connected_pipe_ids": [],
    }
    base.update(kw)
    return base


def pipe(id_: str, from_id: str, to_id: str) -> dict:
    """Pipe connecting two elements (sets all four endpoint fields recognised by every adjacency builder)."""
    return {
        "id": id_,
        "flow_from_element_id": from_id,
        "flow_to_element_id": to_id,
        "start_connects_to": from_id,
        "end_connects_to": to_id,
    }


def meta(elements: list[dict], pipes: list[dict] | None = None, **kw) -> dict:
    """Minimal metadata dict understood by all compliance check functions."""
    return {"elements": elements, "pipes": pipes or [], **kw}


def has_pass_line(detail: list[str], rule: str) -> bool:
    return any(line.startswith("✓") and rule in line for line in detail)


def has_warn_line(detail: list[str], rule: str) -> bool:
    return any(line.startswith("⚠") and rule in line for line in detail)


def has_fail_line(detail: list[str], rule: str) -> bool:
    return any(line.startswith("✗") and rule in line for line in detail)
