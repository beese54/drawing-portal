"""symbols.py — GET /api/symbols, GET /api/symbols/{id}/image

Read-only. The symbol library is built into the container image and is not
writable at runtime.

The upload / rename / delete routes and their X-Admin-Key guard were removed on
2026-08-04. They could not work on this platform: the production container
filesystem is not writable (see docs/ARCHITECTURE.md §4a), so every write would
have failed, and the service has no attached persistent storage. Removing them
also removed the application's only credential.

To add or change a symbol, commit the SVG to backend/symbols/ with an entry in
manifest.json and redeploy. That is now the only mechanism, and it is version
controlled and reviewable, which the upload path never was.
"""

from fastapi import APIRouter
from fastapi.responses import FileResponse

from app.models.symbol import SymbolList, SymbolMeta
from app.services import symbol_service
from app.config import settings
from app.schemas.manifest import read_manifest

router = APIRouter()


@router.get("", response_model=SymbolList)
async def list_symbols():
    manifest = read_manifest(settings.manifest_path)
    symbols = []
    for sym in manifest.get("symbols", []):
        from datetime import datetime
        created_at = sym.get("created_at", "2026-01-01T00:00:00+00:00")
        if isinstance(created_at, str):
            # handle both offset-aware and naive
            try:
                dt = datetime.fromisoformat(created_at)
            except ValueError:
                from datetime import timezone
                dt = datetime.now(timezone.utc)
        else:
            dt = created_at
        symbols.append(SymbolMeta(
            id=sym["id"],
            name=sym["name"],
            category=sym["category"],
            filename=sym["filename"],
            url=f"/api/symbols/{sym['id']}/image",
            created_at=dt,
        ))
    return SymbolList(symbols=symbols)


@router.get("/{symbol_id}/image")
async def get_symbol_image(symbol_id: str):
    path = symbol_service.get_symbol_file_path(symbol_id)
    suffix = path.suffix.lower()
    media_type = "image/svg+xml" if suffix == ".svg" else "image/png"
    return FileResponse(str(path), media_type=media_type)
