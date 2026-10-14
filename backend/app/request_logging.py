"""
request_logging.py — One structured JSON line per request (H4, 1.1.6).

Each line answers the questions asked during an incident: which route, what
status, how long, and which request. The request id is returned to the caller
as X-Request-ID, so a user can quote it, and it is stamped on every other log
line written while the request runs, including uvicorn's traceback for an
unhandled error.

Deliberately NOT logged (IM8 LM-19):
- query strings, bodies and headers: whatever a caller sends stays out of the log
- the client IP: behind GovPaaS it is the proxy's address, a forwarded header
  is caller-supplied, and the user's IP is personal data. The platform edge
  records the real one (access logging, LM-6, is a platform control).
- successful /api/health probes, which the platform sends every few seconds

configure_logging() sends every logger, uvicorn's included, through one JSON
formatter on stdout, and turns off uvicorn's plain-text access log, which this
replaces. See tests/test_request_logging.py.
"""

from __future__ import annotations

import json
import logging
import sys
import time
import uuid
from contextvars import ContextVar
from datetime import datetime, timezone

from starlette.datastructures import MutableHeaders
from starlette.routing import Route

ACCESS_LOGGER = "app.access"
MAX_PATH_CHARS = 200
HEALTH_PATH = "/api/health"

_request_id: ContextVar[str | None] = ContextVar("request_id", default=None)
_access = logging.getLogger(ACCESS_LOGGER)


class JsonFormatter(logging.Formatter):
    """One JSON object per line. json.dumps escapes newlines and control
    characters, so a hostile path cannot forge a second line."""

    def format(self, record: logging.LogRecord) -> str:
        out = {
            "ts": datetime.fromtimestamp(record.created, timezone.utc)
            .isoformat(timespec="milliseconds")
            .replace("+00:00", "Z"),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        if getattr(record, "request_id", None):
            out["request_id"] = record.request_id
        out.update(getattr(record, "fields", {}))
        if record.exc_info:
            out["exc"] = self.formatException(record.exc_info)
        return json.dumps(out, default=str)


class _StdoutHandler(logging.StreamHandler):
    """Looks sys.stdout up at write time, so a test runner swapping it out
    never leaves the handler holding a closed stream."""

    def __init__(self) -> None:
        super().__init__()

    @property
    def stream(self):
        return sys.stdout

    @stream.setter
    def stream(self, _value):
        pass


def configure_logging() -> None:
    """Idempotent: app.main may be imported more than once (tests reload it)."""
    root = logging.getLogger()
    for h in [h for h in root.handlers if isinstance(h, _StdoutHandler)]:
        root.removeHandler(h)
    handler = _StdoutHandler()
    handler.setFormatter(JsonFormatter())
    root.addHandler(handler)
    root.setLevel(logging.INFO)

    # Uvicorn configures its own plain-text handlers before importing the app.
    # Route its lines through the root handler instead, and drop its access
    # log: the line below replaces it.
    for name in ("uvicorn", "uvicorn.error"):
        lg = logging.getLogger(name)
        lg.handlers.clear()
        lg.propagate = True
    uv_access = logging.getLogger("uvicorn.access")
    uv_access.handlers.clear()
    uv_access.propagate = False
    uv_access.disabled = True

    # Stamp the current request's id on every record when it is created, so
    # any handler (including pytest's) sees it, whichever thread formats it.
    base = logging.getLogRecordFactory()
    if not getattr(base, "_stamps_request_id", False):
        def factory(*args, **kwargs):
            record = base(*args, **kwargs)
            record.request_id = _request_id.get()
            return record

        factory._stamps_request_id = True
        logging.setLogRecordFactory(factory)


def _route_template(scope) -> str | None:
    """The matched endpoint's template (/api/symbols/{symbol_id}/image), so
    lines group by endpoint. None for the static mount and for 404s.

    FastAPI 0.143 keeps an included route's own path without its router's
    prefix ("/{symbol_id}/image"). A template with N slashes matches the last
    N segments of the request path, so those are swapped for it. A full
    template would come out unchanged too."""
    route = scope.get("route")
    if not isinstance(route, Route):
        return None
    parts = scope["path"].split("/")
    return "/".join(parts[: len(parts) - route.path.count("/")]) + route.path


class RequestLoggingMiddleware:
    """Pure ASGI, added last so it is the outermost app middleware: it times
    the whole response, streamed body included, and sees an exception before
    Starlette turns it into a 500."""

    def __init__(self, app) -> None:
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        rid = uuid.uuid4().hex
        # Not reset afterwards on purpose. Uvicorn runs each request in its
        # own task, and logs an unhandled exception's traceback in that task
        # after this middleware has returned. Leaving the id set is what puts
        # it on that traceback.
        _request_id.set(rid)
        start = time.perf_counter()
        status = 500
        error = None

        async def send_with_id(message):
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
                MutableHeaders(scope=message).append("X-Request-ID", rid)
            await send(message)

        try:
            await self.app(scope, receive, send_with_id)
        except Exception as exc:
            error = type(exc).__name__
            raise
        finally:
            path = scope.get("path", "")
            if not (path == HEALTH_PATH and status < 400 and error is None):
                fields = {
                    "method": scope.get("method"),
                    "path": path[:MAX_PATH_CHARS],
                    "route": _route_template(scope),
                    "status": status,
                    "duration_ms": round((time.perf_counter() - start) * 1000, 2),
                }
                if error:
                    fields["error"] = error
                level = logging.ERROR if status >= 500 or error else logging.INFO
                _access.log(level, "request", extra={"fields": fields})
