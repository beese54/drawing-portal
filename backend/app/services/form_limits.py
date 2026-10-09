"""
form_limits.py — Route class that sizes Starlette's multipart part limit to
this app's own field caps.

Starlette >= 0.40 (the fix for CVE-2024-47874) caps every non-file form field
at 1 MB by default, and FastAPI calls request.form() without overriding it.
metadata_json legitimately exceeds 1 MB, because the frontend embeds the
title-block stamps in it as base64, and config allows it up to
max_metadata_chars (20 MB). Left at the default, the upgrade would have
refused large drawings with a 400.

The limit is set just above the largest app-level cap, so two layers apply:
- up to the app cap: accepted, then checked by the routers' own size checks
  (413 with a specific message), exactly as before the upgrade;
- beyond cap + margin: refused by Starlette while the part is still streaming,
  so an oversized field never sits in memory at all.

Pattern: https://fastapi.tiangolo.com/how-to/custom-request-and-route/
"""

from __future__ import annotations

from collections.abc import Callable, Coroutine
from typing import Any

from fastapi import Request, Response
from fastapi.routing import APIRoute

from app.config import settings

# The margin keeps the routers' own 413s reachable for slightly-oversized
# fields; without it Starlette would answer first with a generic 400.
MAX_FORM_PART_BYTES = max(settings.max_metadata_chars, settings.max_manifest_chars) + 1024 * 1024


class _SizedFormRequest(Request):
    def form(self, *, max_files: int | float = 1000, max_fields: int | float = 1000,
             max_part_size: int = MAX_FORM_PART_BYTES):
        return super().form(max_files=max_files, max_fields=max_fields, max_part_size=max_part_size)


class SizedFormRoute(APIRoute):
    def get_route_handler(self) -> Callable[[Request], Coroutine[Any, Any, Response]]:
        handler = super().get_route_handler()

        async def sized_form_handler(request: Request) -> Response:
            return await handler(_SizedFormRequest(request.scope, request.receive))

        return sized_form_handler
