"""
chat.py — Chat endpoints for the AI evaluation agent.

Endpoints:
    POST /api/chat/session          Create a new clarification session
    POST /api/chat/message          Send a message and get a response
    GET  /api/chat/session/{id}     Get session state
    DELETE /api/chat/session/{id}   Delete a session
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.agents.clarification_engine import (
    ClarificationSession,
    create_session,
    delete_session,
    get_session,
)
from app.agents.rag_agent import handle_turn

router = APIRouter()


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------

class NewSessionRequest(BaseModel):
    schematic_json: dict[str, Any] | None = None


class NewSessionResponse(BaseModel):
    session_id: str
    first_message: str


class ChatMessageRequest(BaseModel):
    session_id: str
    message: str
    provider: str = "openai"   # "openai" | "qwen"


class ChatMessageResponse(BaseModel):
    type: str
    content: str
    session_id: str
    is_final: bool
    metrics: dict | None = None


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/session", response_model=NewSessionResponse)
async def create_chat_session(req: NewSessionRequest) -> NewSessionResponse:
    """Start a new evaluation session. Optionally attach schematic metadata."""
    session = create_session(schematic_json=req.schematic_json)

    if req.schematic_json:
        intro = (
            "I've received your schematic. To give you the most accurate hydraulic evaluation, "
            "I'll ask you a few quick questions first.\n\n"
            "I'll ask each question one at a time. You can type **'skip'** at any point "
            "to proceed straight to the evaluation with the information already provided.\n\n"
        )
        # First question
        next_q = session.next_question()
        first_message = intro + (next_q or "All information collected. Type anything to start evaluation.")
    else:
        first_message = (
            "Hello! I'm your Hydraulic Engineering Assistant.\n\n"
            "I can evaluate your water plumbing schematic for compliance with engineering standards.\n\n"
            "To begin, please either:\n"
            "• **Attach your schematic** using the button in the sidebar, or\n"
            "• **Describe your system** and I'll guide you through the assessment."
        )

    return NewSessionResponse(session_id=session.session_id, first_message=first_message)


@router.post("/message", response_model=ChatMessageResponse)
async def send_message(req: ChatMessageRequest) -> ChatMessageResponse:
    """Send a message to the agent and receive a response."""
    session = get_session(req.session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found. Create a new session.")

    provider = req.provider if req.provider in ("openai", "qwen") else "openai"

    try:
        turn = await handle_turn(session, req.message, provider=provider)
    except EnvironmentError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Agent error: {exc}")

    return ChatMessageResponse(
        type=turn.type,
        content=turn.content,
        session_id=turn.session_id,
        is_final=turn.is_final,
        metrics=turn.metrics,
    )


@router.get("/session/{session_id}")
async def get_session_info(session_id: str) -> dict:
    session = get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found.")
    return {
        "session_id":       session.session_id,
        "status":           session.status,
        "questions_asked":  session.questions_asked,
        "answers":          session.answers,
        "has_schematic":    bool(session.schematic_json),
    }


@router.delete("/session/{session_id}")
async def delete_chat_session(session_id: str) -> dict:
    delete_session(session_id)
    return {"deleted": session_id}
