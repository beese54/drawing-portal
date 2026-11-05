"""
test_static_types.py — Static files go out with the right Content-Type.

The frontend is served by StaticFiles, which labels each file from its
extension using Python's mimetypes. Python 3.12 (the image's version) has no
entry for .webp, so app/main.py registers one. Without it the User Guide's
screenshots were sent as application/octet-stream alongside nosniff.
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.testclient import TestClient

import app.main  # noqa: F401  (importing it registers the type)


def test_webp_is_served_as_image_webp(tmp_path):
    (tmp_path / "shot.webp").write_bytes(b"RIFF\x00\x00\x00\x00WEBPVP8 ")
    site = FastAPI()
    site.mount("/", StaticFiles(directory=str(tmp_path)), name="static")

    response = TestClient(site).get("/shot.webp")

    assert response.status_code == 200
    assert response.headers["content-type"] == "image/webp"
