"""
feedback.py — temporary early-tester feedback collection.

POST /api/feedback   store a submission

Airbase's container filesystem isn't writable (confirmed via
OperationalError('unable to open database file') in prod logs), so there's
no on-disk persistence here. Durability comes from two independent
best-effort channels instead: a stdout print (lands in Airbase's log
stream) and a Slack webhook post for real-time visibility.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.config import settings

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

    # Print first and unconditionally — this is the durable backstop (log
    # stream survives even if the container's disk doesn't), so it must not
    # be skipped or fail just because the Slack post below can't reach out.
    print(f"FEEDBACK_SUBMISSION {submitted_at} {json.dumps(submission.model_dump())}")

    # Best-effort: real-time visibility without depending on disk or having
    # to dig submissions out of routine request-log noise.
    if settings.slack_feedback_webhook_url:
        try:
            lines = [
                f"Overall satisfaction: {submission.overall_satisfaction}/5",
                f"Likelihood to use again: {submission.likelihood_to_use_again}/5",
                f"Ease of use: {submission.ease_of_use}/5",
            ]
            if submission.confusion:
                lines.append(f"What confused them: {submission.confusion}")
            if submission.wished_features:
                lines.append(f"Wished features: {submission.wished_features}")

            async with httpx.AsyncClient(timeout=5.0) as client:
                await client.post(
                    settings.slack_feedback_webhook_url,
                    json={"text": "\n".join(lines)},
                )
        except Exception as e:
            print(f"FEEDBACK_SLACK_POST_FAILED {submitted_at} {e!r}")

    return {"status": "ok"}
