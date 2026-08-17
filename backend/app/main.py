from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.routers import health, symbols, evaluate, export

app = FastAPI(title="Schematic Drawing Portal API", version=settings.app_version)

# Wildcard for now. The allowlist to narrow to at go-live already exists and is
# wired to the ALLOWED_ORIGINS env var — settings.origins_list (config.py) —
# it is simply not referenced here yet. Note the app is same-origin in the
# combined image (the frontend is served by this process, see the static mount
# below), so CORS is not load-bearing for normal operation.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)

    # ── CORS fallback ────────────────────────────────────────────────────────
    # Fills the header in only when CORSMiddleware did not set one. On an
    # earlier split deployment, requests for symbol images (loaded via
    # <img crossorigin> so Konva can rasterize them) were observed missing
    # Access-Control-Allow-Origin even with CORSMiddleware configured above —
    # restored after a prior cleanup (commit d99ab4e) removed this and
    # reintroduced the exact "blocked by CORS policy" failure it fixed.
    #
    # Conditional, deliberately. Setting it unconditionally made this
    # middleware silently override CORSMiddleware on EVERY response: narrowing
    # allow_origins above would then have had no effect whatsoever, because
    # this line re-forced "*" afterwards. That is a trap for whoever tightens
    # CORS at go-live, and it is why the two must be changed together — or,
    # as now, why this one defers to the other.
    if "access-control-allow-origin" not in response.headers:
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "*"

    # ── Security headers ─────────────────────────────────────────────────────
    # nosniff is the one that matters for this service specifically:
    # /api/symbols/{id}/image serves image/svg+xml, and an SVG rendered as a
    # DOCUMENT (direct navigation, not via <img>) executes script in this
    # origin. The CSP below is img-src only, so it does not constrain that path
    # at all. The symbol library is baked into the container image and the
    # write API was removed on 2026-08-04, so this guards against a future
    # committed SVG rather than a live exposure.
    #
    # Strict-Transport-Security is deliberately NOT set here. TLS terminates at
    # the Cloudflare edge and the zone's HSTS position is GovPaaS's to state —
    # asked 2026-08-04 and again since, still unanswered. Setting a max-age
    # from the application would commit a pub.gov.sg subdomain to a policy the
    # platform owner has not agreed to.
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"

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
