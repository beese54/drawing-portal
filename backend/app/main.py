from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.routers import health, symbols, evaluate, export

app = FastAPI(title="Schematic Drawing Portal API", version=settings.app_version)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Belt-and-suspenders fallback: on an earlier split deployment, requests for symbol
# images (loaded via <img crossorigin> so Konva can rasterize them) have been
# observed missing Access-Control-Allow-Origin even with CORSMiddleware
# configured above — restored after a prior cleanup (commit d99ab4e) removed
# this and reintroduced the exact "blocked by CORS policy" failure it fixed.
@app.middleware("http")
async def force_cors(request: Request, call_next):
    response = await call_next(request)
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "*"

    # Content-Security-Policy: img-src ONLY, deliberately.
    #
    # This is the browser-enforced half of the schematic-import stamp guard. The
    # three title-block stamp fields are assigned to img.src; the import path
    # already restricts them to data: URLs (frontend/src/utils/importValidation.ts),
    # but that is application code and application code can regress. This header
    # means a stamp pointing at a third-party URL is refused by the browser
    # regardless — no outbound request, no beacon.
    #
    # No other directive is set. A default-src or script-src would need the app's
    # inline styles and the injected <style> tag audited first, and shipping a
    # broad policy untested is how CSP gets rolled back. Widening this is tracked
    # as the remaining part of AS-9 / R-17.
    #
    # 'self' covers /api/symbols/{id}/image and the two SVGs in public/; data:
    # covers stamps and the drag-ghost pixel. Every image source in the frontend
    # is one of those two. NOTE: if the split deployment is ever revived, the
    # backend origin must be added here or symbol images will be blocked.
    response.headers["Content-Security-Policy"] = "img-src 'self' data:"
    return response

app.include_router(health.router, prefix="/api")
app.include_router(symbols.router, prefix="/api/symbols")
app.include_router(evaluate.router, prefix="/api")
app.include_router(export.router, prefix="/api")

# Only present in the combined image (root Dockerfile copies the built
# frontend into ./static/) — the split backend/Dockerfile never creates this
# directory, so it stays an API-only service there. Mounted last so it can
# never shadow the /api/* routes or FastAPI's own /docs, /openapi.json, etc.
if settings.static_dir.is_dir():
    app.mount("/", StaticFiles(directory=str(settings.static_dir), html=True), name="static")
