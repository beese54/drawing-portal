"""
test_request_logging.py — One structured line per request (H4).

Before 1.1.6 the only record of a request was uvicorn's plain-text access
line: the proxy's address, the full URL including any query string, no
duration, and no way to tie a traceback to the request that caused it.

Now every request produces one JSON line answering: which route, what
status, how long, and which request (an id that is also returned to the
caller as X-Request-ID, and stamped on every other log line written while
that request runs, including uvicorn's traceback). Nothing the caller sent is
logged beyond the method and the path without its query string.
"""

from __future__ import annotations

import json
import logging
import socket
import threading
import time

import httpx
import pytest
import uvicorn
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.main import app
from app.request_logging import ACCESS_LOGGER, MAX_PATH_CHARS, JsonFormatter, RequestLoggingMiddleware

client = TestClient(app)
FIELDS = {"ts", "level", "logger", "msg", "request_id", "method", "path", "route", "status", "duration_ms"}


def _lines(caplog) -> list[dict]:
    """The access lines, rendered exactly as production renders them."""
    fmt = JsonFormatter()
    return [json.loads(fmt.format(r)) for r in caplog.records if r.name == ACCESS_LOGGER]


def _app_output(caplog) -> str:
    """Everything the app logged. The test client's own httpx logger is left
    out: it logs the full URL it sent, and production never runs it."""
    fmt = JsonFormatter()
    return "\n".join(fmt.format(r) for r in caplog.records if not r.name.startswith("httpx"))


@pytest.fixture
def logs(caplog):
    caplog.set_level(logging.INFO)
    return caplog


# ── The access line ─────────────────────────────────────────────────────────

def test_one_json_line_per_request_with_the_agreed_fields(logs):
    r = client.get("/api/symbols")
    assert r.status_code == 200
    [line] = _lines(logs)
    assert set(line) == FIELDS
    assert line["msg"] == "request"
    assert (line["method"], line["path"], line["route"], line["status"]) == ("GET", "/api/symbols", "/api/symbols", 200)
    assert isinstance(line["duration_ms"], float) and line["duration_ms"] >= 0
    assert line["ts"].endswith("Z")


def test_the_route_is_the_template_not_the_concrete_path(logs):
    symbols = client.get("/api/symbols").json()
    first = (symbols if isinstance(symbols, list) else symbols["symbols"])[0]["id"]
    logs.clear()
    client.get(f"/api/symbols/{first}/image")
    [line] = _lines(logs)
    assert line["path"] == f"/api/symbols/{first}/image"
    assert line["route"] == "/api/symbols/{symbol_id}/image"


def test_the_response_carries_the_logged_request_id(logs):
    r = client.get("/api/symbols")
    [line] = _lines(logs)
    assert r.headers["X-Request-ID"] == line["request_id"]
    assert len(line["request_id"]) == 32


def test_each_request_gets_its_own_id(logs):
    a = client.get("/api/symbols").headers["X-Request-ID"]
    b = client.get("/api/symbols").headers["X-Request-ID"]
    assert a != b


def test_an_inbound_request_id_is_not_trusted(logs):
    """The id is ours. A caller-chosen one could collide or forge a trail."""
    r = client.get("/api/symbols", headers={"X-Request-ID": "attacker-chosen"})
    assert r.headers["X-Request-ID"] != "attacker-chosen"


# ── What is NOT logged (IM8 LM-19) ─────────────────────────────────────────

def test_the_query_string_is_never_logged(logs):
    client.get("/api/symbols?token=SECRET123")
    assert "SECRET123" not in _app_output(logs)
    [line] = _lines(logs)
    assert line["path"] == "/api/symbols"


def test_request_bodies_and_headers_are_never_logged(logs):
    client.post(
        "/api/evaluate",
        data={"metadata_json": '{"elements": [], "pipes": [], "marker": "BODY-MARKER"}'},
        headers={"Authorization": "Bearer HEADER-MARKER", "User-Agent": "UA-MARKER"},
    )
    rendered = _app_output(logs)
    for marker in ("BODY-MARKER", "HEADER-MARKER", "UA-MARKER"):
        assert marker not in rendered


def test_a_long_path_is_truncated(logs):
    client.get("/" + "a" * (MAX_PATH_CHARS * 3))
    [line] = _lines(logs)
    assert len(line["path"]) == MAX_PATH_CHARS


def test_a_newline_in_the_path_cannot_forge_a_second_line(logs):
    client.get('/x%0A{"msg": "forged"}')
    rendered = [JsonFormatter().format(r) for r in logs.records if r.name == ACCESS_LOGGER]
    assert len(rendered) == 1 and "\n" not in rendered[0]
    assert json.loads(rendered[0])["path"] == '/x\n{"msg": "forged"}'


# ── Which requests are logged ───────────────────────────────────────────────

def test_a_successful_health_probe_is_not_logged(logs):
    """The platform and Docker probe it every few seconds; 200s are noise."""
    assert client.get("/api/health").status_code == 200
    assert _lines(logs) == []


@pytest.mark.parametrize("method,path,data,status", [
    ("GET", "/api/no-such-route", None, 404),
    ("POST", "/api/evaluate", {"metadata_json": "not json"}, 422),
])
def test_client_errors_are_logged(logs, method, path, data, status):
    r = client.request(method, path, data=data)
    assert r.status_code == status
    [line] = _lines(logs)
    assert line["status"] == status
    assert line["level"] == "INFO"


def test_the_static_frontend_is_logged_without_a_route(logs):
    client.get("/no-such-asset.js")
    [line] = _lines(logs)
    assert line["route"] is None


# ── Server errors ───────────────────────────────────────────────────────────

def _app_that_fails() -> FastAPI:
    """A throwaway app wired the same way as app.main, with a route that raises."""
    broken = FastAPI()

    @broken.get("/boom")
    def boom():
        logging.getLogger("app.test").warning("about to fail")
        raise RuntimeError("deliberate")

    broken.add_middleware(RequestLoggingMiddleware)
    return broken


def test_an_unhandled_exception_is_logged_as_a_500_with_its_id(logs):
    c = TestClient(_app_that_fails(), raise_server_exceptions=False)
    r = c.get("/boom")
    assert r.status_code == 500
    [line] = _lines(logs)
    assert (line["status"], line["level"], line["route"]) == (500, "ERROR", "/boom")
    assert line["error"] == "RuntimeError"
    [app_line] = [r for r in logs.records if r.name == "app.test"]
    assert json.loads(JsonFormatter().format(app_line))["request_id"] == line["request_id"]


def test_under_real_uvicorn_the_traceback_carries_the_request_id(logs):
    """The traceback is logged by uvicorn, outside every middleware. The
    request id still reaches it through the request's context."""
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    server = uvicorn.Server(uvicorn.Config(_app_that_fails(), log_config=None, access_log=False))
    t = threading.Thread(target=server.run, kwargs={"sockets": [sock]}, daemon=True)
    t.start()
    try:
        for _ in range(100):
            if server.started:
                break
            time.sleep(0.05)
        r = httpx.get(f"http://127.0.0.1:{port}/boom")
        assert r.status_code == 500
        rid = r.headers.get("X-Request-ID")  # absent: the 500 is built outside us
        for _ in range(100):
            tb = [x for x in logs.records if x.name.startswith("uvicorn") and x.exc_info]
            if tb:
                break
            time.sleep(0.05)
    finally:
        server.should_exit = True
        t.join(5)
        sock.close()
    [access] = _lines(logs)
    [traceback_record] = tb
    rendered = json.loads(JsonFormatter().format(traceback_record))
    assert rendered["request_id"] == access["request_id"]
    assert "RuntimeError: deliberate" in rendered["exc"]
    assert rid is None or rid == access["request_id"]


def test_a_handled_annotation_failure_is_logged_as_json_not_printed(logs, capsys, monkeypatch):
    """Annotation failure is non-fatal: the report still returns, without the
    annotated image. Until 1.1.7 it called traceback.print_exc(), a plain-text
    traceback on stderr with no request id, the one path that broke the
    all-JSON log stream."""
    import io

    from PIL import Image

    import app.routers.evaluate as evaluate

    real_check = evaluate.check_backflow_prevention

    def with_an_element_of_interest(metadata, adjacency):
        result = real_check(metadata, adjacency)
        result.elements_of_interest = [{"element_id": "e0", "label": "x", "color": "red"}]
        return result

    def failing_annotation(**_kwargs):
        raise RuntimeError("deliberate annotation failure")

    monkeypatch.setattr(evaluate, "check_backflow_prevention", with_an_element_of_interest)
    monkeypatch.setattr(evaluate, "annotate_schematic", failing_annotation)
    png = io.BytesIO()
    Image.new("RGB", (8, 8), "white").save(png, format="PNG")
    capsys.readouterr()

    r = client.post(
        "/api/evaluate",
        data={"metadata_json": '{"elements": [{"id": "e0", "type": "tap", "position": {"canvas_x": 1, "canvas_y": 1}}], "pipes": []}'},
        files={"schematic_image": ("s.png", png.getvalue(), "image/png")},
    )
    assert r.status_code == 200
    assert "Traceback" not in capsys.readouterr().err
    [record] = [x for x in logs.records if x.name == "app.routers.evaluate"]
    line = json.loads(JsonFormatter().format(record))
    assert line["level"] == "WARNING"
    assert line["request_id"] == r.headers["X-Request-ID"]
    assert "RuntimeError: deliberate annotation failure" in line["exc"]


# ── The formatter on its own ────────────────────────────────────────────────

def test_a_log_line_outside_any_request_has_no_request_id():
    record = logging.LogRecord("uvicorn.error", logging.INFO, __file__, 1, "Started server process [%d]", (1,), None)
    out = json.loads(JsonFormatter().format(record))
    assert out["msg"] == "Started server process [1]"
    assert "request_id" not in out
