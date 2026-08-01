"""
feedback.py — temporary early-tester feedback collection.

POST /api/feedback   record a submission

Airbase's container filesystem isn't writable (confirmed via
OperationalError('unable to open database file') in prod logs), so there's
no on-disk persistence here. Durability comes from a stdout print, which
lands in the platform's log stream.

Submissions are deliberately not forwarded anywhere off-platform. An earlier
version posted them to a Slack webhook; that was removed on 2026-08-01 so
that free-text feedback — the one field a submitter could paste anything
into — stays inside the platform boundary. This is what lets the service
hold an Official (Open) classification without a caveat about third-party
egress, and it removed the app's only outbound HTTP call.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

from fastapi import APIRouter
from pydantic import BaseModel, Field

router = APIRouter()


class FeedbackSubmission(BaseModel):
    overall_satisfaction: int = Field(ge=1, le=5)
    likelihood_to_use_again: int = Field(ge=1, le=5)
    ease_of_use: int = Field(ge=1, le=5)
    confusion: str = ""
    wished_features: str = ""


@router.post("/feedback", status_code=201)
async def submit_feedback(submission: FeedbackSubmission) -> dict:
    submitted_at = datetime.now(timezone.utc).isoformat()

    # The durable record. The log stream survives even when the container's
    # disk doesn't, so this must not be skipped or made conditional.
    print(f"FEEDBACK_SUBMISSION {submitted_at} {json.dumps(submission.model_dump())}")

    return {"status": "ok"}
