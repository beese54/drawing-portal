import shutil
import re
import uuid
from pathlib import Path
from fastapi import UploadFile, HTTPException

from app.config import settings
from app.schemas.manifest import read_manifest, write_manifest, find_symbol, now_iso

ALLOWED_MIME_TYPES = {"image/svg+xml", "image/png"}
ALLOWED_EXTENSIONS = {".svg", ".png"}
MAX_FILE_SIZE = 2 * 1024 * 1024  # 2 MB


def _slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9_]", "_", name.lower().strip())



def get_symbol_file_path(symbol_id: str) -> Path:
    manifest = read_manifest(settings.manifest_path)
    sym = find_symbol(manifest, symbol_id)
    if not sym:
        raise HTTPException(status_code=404, detail="Symbol not found")
    path = settings.symbols_dir / sym["filename"]
    if not path.exists():
        raise HTTPException(status_code=404, detail="Symbol file not found on disk")
    return path


async def create_symbol(file: UploadFile, name: str) -> dict:
    # Validate extension
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=422, detail="Only SVG and PNG files are accepted")

    # Validate declared content-type
    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(status_code=422, detail="Only SVG and PNG files are accepted")

    # Read content and check size
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=422, detail="File exceeds 2MB limit")

    # Reject SVGs containing embedded scripts (stored XSS prevention)
    if suffix == ".svg":
        text = content.decode("utf-8", errors="replace").lower()
        if "<script" in text or "javascript:" in text or re.search(r"\bon\w+\s*=", text):
            raise HTTPException(status_code=422, detail="SVG contains disallowed script content")

    # Generate ID and filename
    short_id = uuid.uuid4().hex[:8]
    slug = _slugify(name)
    symbol_id = f"{slug}_{short_id}"
    filename = f"custom/{symbol_id}{suffix}"

    # Ensure custom dir exists
    settings.custom_symbols_dir.mkdir(parents=True, exist_ok=True)

    # Write file
    dest = settings.symbols_dir / filename
    dest.write_bytes(content)

    # Update manifest
    manifest = read_manifest(settings.manifest_path)
    manifest["symbols"].append({
        "id": symbol_id,
        "name": name,
        "category": "custom",
        "filename": filename,
        "created_at": now_iso(),
    })
    write_manifest(settings.manifest_path, manifest)

    return {
        "id": symbol_id,
        "name": name,
        "category": "custom",
        "url": f"/api/symbols/{symbol_id}/image",
    }


def rename_symbol(symbol_id: str, new_name: str) -> dict:
    manifest = read_manifest(settings.manifest_path)
    sym = find_symbol(manifest, symbol_id)
    if not sym:
        raise HTTPException(status_code=404, detail="Symbol not found")
    sym["name"] = new_name
    write_manifest(settings.manifest_path, manifest)
    return {**sym, "url": f"/api/symbols/{symbol_id}/image"}


def delete_symbol(symbol_id: str) -> None:
    manifest = read_manifest(settings.manifest_path)
    sym = find_symbol(manifest, symbol_id)
    if not sym:
        raise HTTPException(status_code=404, detail="Symbol not found")
    if sym["category"] == "default":
        raise HTTPException(status_code=400, detail="Cannot delete default symbols")

    # Remove file
    file_path = settings.symbols_dir / sym["filename"]
    if file_path.exists():
        file_path.unlink()

    # Update manifest
    manifest["symbols"] = [s for s in manifest["symbols"] if s["id"] != symbol_id]
    write_manifest(settings.manifest_path, manifest)
