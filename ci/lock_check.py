"""
lock_check.py — Fail the pipeline when a Python lock no longer matches its input.

backend/requirements.in lists the direct dependencies; requirements.txt is the
hashed lock pip-compile builds from it (H5, 1.1.6), and the image installs the
lock alone. Recompiling here would download several GB of wheels to hash them,
so this checks what a forgotten recompile gets wrong instead:

  - every direct pin in requirements.in is in the lock, at that exact version
  - every direct dependency of requirements-dev.in is in the dev lock
  - the dev lock has exactly the production lock's runtime versions, so CI
    tests what ships
  - every package in either lock carries at least one hash

A package removed from requirements.in but left in the lock is not caught;
`pip check` in the Dockerfile and the deps:audit scan still cover it.

    python ci/lock_check.py backend
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

_REQ = re.compile(r"^([A-Za-z0-9][A-Za-z0-9._-]*)(\[[^\]]*\])?\s*(==|>=|~=|<=|>|<|!=)?\s*([^\s;\\#]*)")


def _norm(name: str) -> str:
    """PEP 503: Pillow, pillow and python_docx/python-docx compare equal."""
    return re.sub(r"[-_.]+", "-", name).lower()


def read_in(text: str) -> dict[str, tuple[str | None, str | None]]:
    """name -> (operator, version) for each requirement line of a .in file."""
    out = {}
    for line in text.splitlines():
        line = line.split("#", 1)[0].strip()
        if not line or line.startswith("-"):
            continue
        m = _REQ.match(line)
        if m:
            out[_norm(m.group(1))] = (m.group(3), m.group(4) or None)
    return out


def read_lock(text: str) -> dict[str, tuple[str, bool]]:
    """name -> (version, has_hash) for each package of a compiled lock."""
    out: dict[str, tuple[str, bool]] = {}
    current = None
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if raw[:1].strip() and "==" in line:
            name, version = line.split("==", 1)
            current = _norm(name.split("[", 1)[0])
            out[current] = (version.split()[0].rstrip("\\").strip(), False)
        if current and "--hash=" in line:
            out[current] = (out[current][0], True)
    return out


def check(backend: Path) -> list[str]:
    errors = []
    runtime_in = read_in((backend / "requirements.in").read_text(encoding="utf-8"))
    dev_in = read_in((backend / "requirements-dev.in").read_text(encoding="utf-8"))
    lock = read_lock((backend / "requirements.txt").read_text(encoding="utf-8"))
    dev_lock = read_lock((backend / "requirements-dev.txt").read_text(encoding="utf-8"))

    for name, (op, version) in runtime_in.items():
        if op != "==":
            errors.append(f"requirements.in: {name} must be pinned with ==")
        elif name not in lock:
            errors.append(f"requirements.txt: {name} is missing; recompile")
        elif lock[name][0] != version:
            errors.append(f"requirements.txt: {name}=={lock[name][0]}, requirements.in says {version}; recompile")
    for name in dev_in:
        if name not in dev_lock:
            errors.append(f"requirements-dev.txt: {name} is missing; recompile")
    for name, (version, _) in lock.items():
        if dev_lock.get(name, (None,))[0] != version:
            errors.append(f"requirements-dev.txt: {name} differs from requirements.txt ({version}); recompile")
    for file, packages in (("requirements.txt", lock), ("requirements-dev.txt", dev_lock)):
        for name, (_, hashed) in packages.items():
            if not hashed:
                errors.append(f"{file}: {name} has no --hash")
    return errors


if __name__ == "__main__":
    problems = check(Path(sys.argv[1] if len(sys.argv) > 1 else "backend"))
    for p in problems:
        print(f"LOCK: {p}")
    print("lock check: " + ("FAILED" if problems else "ok"))
    sys.exit(1 if problems else 0)
