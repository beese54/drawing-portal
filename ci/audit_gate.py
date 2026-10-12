"""
audit_gate.py — Decide whether known-vulnerable dependencies fail the pipeline.

Reads the JSON reports the `deps:` jobs in .gitlab-ci.yml produce and applies
one set of rules, so the policy lives in one place:

  backend  pip-audit, requirements.txt   BLOCKS on any advisory (no severity
                                         data; the set is small and pinned)
  frontend npm audit --omit=dev          BLOCKS on high/critical: this code
                                         ships to every user's browser
  frontend npm audit (dev + build)       REPORTS only. Build tools never ship;
                                         their major upgrades are planned work,
                                         not a red pipeline nobody can clear.

An advisory can be waived in ci/audit-exceptions.json with a reason and an
expiry date. An expired waiver fails the gate itself, so nothing is waived
forever by being forgotten.

    python ci/audit_gate.py --pip pip-audit.json --npm-runtime npm-runtime.json \
        --npm-all npm-all.json --exceptions ci/audit-exceptions.json
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from dataclasses import dataclass
from pathlib import Path

SEVERITY_RANK = {"info": 0, "low": 1, "moderate": 2, "high": 3, "critical": 4}
NPM_RUNTIME_BLOCKS_AT = "high"


@dataclass(frozen=True)
class Advisory:
    source: str           # "pip", "npm-runtime" or "npm-all"
    package: str
    id: str               # GHSA-/PYSEC- id
    aliases: tuple[str, ...]
    severity: str         # npm severity, or "unrated" for pip-audit
    title: str

    def ids(self) -> set[str]:
        return {self.id, *self.aliases}


class NotAReport(ValueError):
    """The tool failed (network, lockfile) and wrote an error, not findings.
    Treating that as "0 advisories" would be a false pass."""


def parse_pip_audit(report: dict) -> list[Advisory]:
    if "dependencies" not in report:
        raise NotAReport(f"pip-audit output has no 'dependencies': {str(report)[:200]}")
    found = []
    for dep in report.get("dependencies", []):
        for v in dep.get("vulns", []):
            found.append(Advisory("pip", f"{dep['name']}=={dep.get('version', '?')}", v["id"],
                                  tuple(v.get("aliases", [])), "unrated",
                                  (v.get("description") or "")[:80]))
    return found


def parse_npm_audit(report: dict, source: str) -> list[Advisory]:
    """npm 7+ JSON. Each package's `via` mixes advisory objects (the package is
    itself vulnerable) with names of packages it inherits from; only the
    objects are advisories. Dedupe: one advisory can be reached several ways."""
    if "vulnerabilities" not in report or "metadata" not in report:
        raise NotAReport(f"npm audit ({source}) wrote no report: {str(report.get('error', report))[:200]}")
    found: dict[tuple[str, str], Advisory] = {}
    for pkg in report.get("vulnerabilities", {}).values():
        for via in pkg.get("via", []):
            if not isinstance(via, dict):
                continue
            url = via.get("url", "")
            adv_id = url.rstrip("/").rsplit("/", 1)[-1] if url else str(via.get("source"))
            key = (via.get("name", pkg["name"]), adv_id)
            found[key] = Advisory(source, key[0], adv_id, (), via.get("severity", "unrated"),
                                  (via.get("title") or "")[:80])
    return list(found.values())


def blocks(adv: Advisory) -> bool:
    if adv.source == "pip":
        return True
    if adv.source == "npm-runtime":
        return SEVERITY_RANK.get(adv.severity, 4) >= SEVERITY_RANK[NPM_RUNTIME_BLOCKS_AT]
    return False


def evaluate(advisories: list[Advisory], exceptions: list[dict], today: dt.date) -> tuple[list[str], list[str]]:
    """Returns (failures, notes). Any failure fails the gate."""
    failures, notes = [], []
    waived: dict[str, dict] = {}
    for exc in exceptions:
        missing = {"id", "reason", "expires"} - exc.keys()
        if missing:
            failures.append(f"exception {exc.get('id', '?')} is missing {sorted(missing)}")
            continue
        if dt.date.fromisoformat(exc["expires"]) < today:
            failures.append(f"exception {exc['id']} EXPIRED on {exc['expires']} ({exc['reason']}); "
                            "fix the dependency or renew the waiver with a new review")
            continue
        waived[exc["id"]] = exc

    used = set()
    for adv in sorted(advisories, key=lambda a: (a.source, -SEVERITY_RANK.get(a.severity, 4), a.package)):
        line = f"[{adv.source}] {adv.severity:<8} {adv.package:<28} {adv.id}  {adv.title}"
        hit = adv.ids() & waived.keys()
        if hit:
            used |= hit
            notes.append(f"WAIVED  {line}  (until {waived[next(iter(hit))]['expires']})")
        elif blocks(adv):
            failures.append(f"BLOCKS  {line}")
        else:
            notes.append(f"report  {line}")
    for exc_id in waived.keys() - used:
        notes.append(f"unused exception {exc_id}: no longer reported; remove it")
    return failures, notes


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--pip", type=Path, required=True)
    ap.add_argument("--npm-runtime", type=Path, required=True)
    ap.add_argument("--npm-all", type=Path, required=True)
    ap.add_argument("--exceptions", type=Path, required=True)
    args = ap.parse_args(argv)

    try:
        advisories = (parse_pip_audit(json.loads(args.pip.read_text()))
                      + parse_npm_audit(json.loads(args.npm_runtime.read_text()), "npm-runtime"))
        # Dev/build findings: report those not already listed as runtime.
        runtime_keys = {(a.package, a.id) for a in advisories}
        advisories += [a for a in parse_npm_audit(json.loads(args.npm_all.read_text()), "npm-all")
                       if (a.package, a.id) not in runtime_keys]
    except (NotAReport, OSError, json.JSONDecodeError) as e:
        print(f"GATE CANNOT DECIDE: {e}\nA scan that did not run is not a clean scan.")
        return 2
    exceptions = json.loads(args.exceptions.read_text()).get("exceptions", [])

    failures, notes = evaluate(advisories, exceptions, dt.date.today())
    for line in notes + failures:
        print(line)
    blocking = sum(1 for f in failures if f.startswith("BLOCKS"))
    print(f"\n{len(advisories)} advisories: {blocking} blocking, "
          f"{len(failures) - blocking} exception problems, {len(notes)} reported/waived")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
