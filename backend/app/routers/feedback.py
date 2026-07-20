"""
feedback.py — temporary early-tester feedback collection.

POST /api/feedback              store a submission
GET  /api/admin/feedback/export dump all submissions as CSV (admin-token gated)

Storage is a single SQLite file on the symbols PVC (see
Settings.feedback_db_path) — appropriate for a throwaway ~20-tester feedback
drive, not meant to be a durable/queryable store long-term.
"""

from __future__ import annotations

import csv
import io
import json
import sqlite3
from datetime import datetime, timezone

from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.config import settings

router = APIRouter()


def _get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(settings.feedback_db_path)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS feedback (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            submitted_at TEXT NOT NULL,
            payload_json TEXT NOT NULL
        )
        """
    )
    return conn


class FeedbackSubmission(BaseModel):
    rating: int
    comments: str = ""


@router.post("/feedback", status_code=201)
async def submit_feedback(submission: FeedbackSubmission) -> dict:
    submitted_at = datetime.now(timezone.utc).isoformat()

    # Print first and unconditionally — this is the durable backstop (log
    # stream survives even if the container's disk doesn't), so it must not
    # be skipped or fail just because SQLite below can't write to disk.
    print(f"FEEDBACK_SUBMISSION {submitted_at} {json.dumps(submission.model_dump())}")

    # Best-effort: a broken/read-only filesystem here must not turn into a
    # 500 for the tester, since the print above already preserved the data.
    try:
        conn = _get_connection()
        try:
            conn.execute(
                "INSERT INTO feedback (submitted_at, payload_json) VALUES (?, ?)",
                (
                    submitted_at,
                    json.dumps(submission.model_dump()),
                ),
            )
            conn.commit()
        finally:
            conn.close()
    except Exception as e:
        print(f"FEEDBACK_SQLITE_WRITE_FAILED {submitted_at} {e!r}")

    return {"status": "ok"}


@router.get("/admin/feedback/export")
async def export_feedback(x_admin_token: str = Header(default="")) -> StreamingResponse:
    if not settings.feedback_admin_token or x_admin_token != settings.feedback_admin_token:
        raise HTTPException(status_code=403, detail="Invalid or missing admin token")

    conn = _get_connection()
    try:
        rows = conn.execute(
            "SELECT id, submitted_at, payload_json FROM feedback ORDER BY id"
        ).fetchall()
    finally:
        conn.close()

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["id", "submitted_at", "rating", "comments"])
    for row_id, submitted_at, payload_json in rows:
        payload = json.loads(payload_json)
        writer.writerow([row_id, submitted_at, payload.get("rating", ""), payload.get("comments", "")])

    buffer.seek(0)
    return StreamingResponse(
        buffer,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=feedback.csv"},
    )
