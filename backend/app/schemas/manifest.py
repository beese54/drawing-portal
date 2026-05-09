import json
from pathlib import Path
from datetime import datetime, timezone
from typing import Any


def read_manifest(manifest_path: Path) -> dict:
    if not manifest_path.exists():
        return {"version": 1, "symbols": []}
    with open(manifest_path, "r") as f:
        return json.load(f)


def write_manifest(manifest_path: Path, data: dict) -> None:
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    with open(manifest_path, "w") as f:
        json.dump(data, f, indent=2, default=str)


def find_symbol(manifest: dict, symbol_id: str) -> dict | None:
    for sym in manifest.get("symbols", []):
        if sym["id"] == symbol_id:
            return sym
    return None


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
