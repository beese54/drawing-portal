"""manifest.py — read access to the symbol library index.

`write_manifest` and `now_iso` were removed on 2026-08-04 with the symbol write
API. `write_manifest` truncated the file before writing, so an interruption
mid-write would have left the library's only index corrupt — a defect that no
longer has a code path to reach it.

manifest.json now ships inside the container image and is never written at
runtime.
"""

import json
from pathlib import Path


def read_manifest(manifest_path: Path) -> dict:
    if not manifest_path.exists():
        return {"version": 1, "symbols": []}
    with open(manifest_path, "r") as f:
        return json.load(f)


def find_symbol(manifest: dict, symbol_id: str) -> dict | None:
    for sym in manifest.get("symbols", []):
        if sym["id"] == symbol_id:
            return sym
    return None
