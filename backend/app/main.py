import threading
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.routers import health, symbols, evaluate, export

# The image runs on Alpine (musl), which gives a new thread a 128 KiB stack;
# glibc gives 8 MiB, and CPython's recursion guard assumes the larger one. With
# the musl default, deeply nested input parsed in a worker thread (Starlette's
# threadpool) overflows the C stack and segfaults the whole server instead of
# raising RecursionError. Set before any worker thread exists. It reserves
# address space, not memory. See tests/test_thread_stack.py.
threading.stack_size(8 * 1024 * 1024)

app = FastAPI(title="Schematic Drawing Portal API", version=settings.app_version)

# Cross-origin access is OFF unless a deployment lists origins in
# ALLOWED_ORIGINS (empty by default; audit F3, fixed in 1.1.2). The app does
# not need any: this process serves the frontend too (the static mount below),
# and in development the Vite server proxies /api, so every request the app
# makes is same-origin, and browsers never apply CORS to those. A listed origin
# is echoed back exactly, never "*". Only GET and POST exist, so only those
# may be preflighted. See tests/test_cors.py.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins_list,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)

    # A CORS fallback used to sit here, adding Access-Control-Allow-Origin: *
    # whenever CORSMiddleware had not. It served the retired split deployment
    # (frontend and API on different origins, where a symbol image cached
    # without CORS headers was reused for an <img crossorigin> load). Removed
    # in 1.1.2: same-origin requests need no CORS headers, and it re-added "*"
    # for exactly the origins CORSMiddleware had refused.

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

    # Content-Security-Policy: img-src and object-src ONLY, deliberately.
    #
    # img-src is the browser-enforced half of the schematic-import stamp guard. The
    # three title-block stamp fields are assigned to img.src; the import path
    # already restricts them to data: URLs (frontend/src/utils/importValidation.ts),
    # but that is application code and application code can regress. This header
    # means a stamp pointing at a third-party URL is refused by the browser
    # regardless — no outbound request, no beacon.
    #
    # object-src 'none' blocks <object>/<embed> plugin content, which can run
    # script. The frontend uses neither, so it costs nothing; GitLab DAST check
    # 16.8 flagged its absence (2026-10-09).
    #
    # No other directive is set. A default-src or script-src would need the app's
    # inline styles and the injected <style> tag audited first, and shipping a
    # broad policy untested is how CSP gets rolled back. Widening this is tracked
    # as the remaining part of AS-9 / R-17.
    #
    # 'self' covers /api/symbols/{id}/image and the two SVGs in public/; data:
    # covers stamps and the drag-ghost pixel. Every image source in the frontend
    # is one of those two.
    response.headers["Content-Security-Policy"] = "img-src 'self' data:; object-src 'none'"
    return response

app.include_router(health.router, prefix="/api")
app.include_router(symbols.router, prefix="/api/symbols")
app.include_router(evaluate.router, prefix="/api")
app.include_router(export.router, prefix="/api")

# Only present in the combined image (root Dockerfile copies the built
# frontend into ./static/). In development the Vite dev server serves the
# frontend instead, so this directory is absent and the backend is API-only. Mounted last so it can
# never shadow the /api/* routes or FastAPI's own /docs, /openapi.json, etc.
if settings.static_dir.is_dir():
    app.mount("/", StaticFiles(directory=str(settings.static_dir), html=True), name="static")
