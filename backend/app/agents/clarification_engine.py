"""
clarification_engine.py — Progressive Clarification + Recap Synthesis

Implements the "Recap" technique from arXiv:2505.06120 to prevent the
~39% LLM performance degradation observed in multi-turn conversations.

Architecture:
    1. Agent asks ONE clarifying question per turn (max 5 turns)
    2. User answers are stored in session state — NOT fed back to the LLM
    3. After all questions answered, ONE consolidated final prompt is built
    4. Single LLM inference call on the consolidated prompt

This avoids middle-turn amnesia, answer bloat, and premature answers
that the paper identifies as root causes of multi-turn degradation.
"""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass, field
from typing import Any, Literal

# ---------------------------------------------------------------------------
# Session state
# ---------------------------------------------------------------------------

QUESTION_KEYS = [
    "source_pressure",
    "pipe_material",
    "pipe_sizes",
    "compliance_focus",
    "building_type",
]

QUESTIONS: dict[str, str] = {
    "source_pressure": (
        "What is the **source pressure** at the mains connection or storage tank outlet? "
        "(Recommended unit: **bar** — e.g., 3 bar. Typical UK mains: 2–4 bar)"
    ),
    "pipe_material": (
        "What **pipe material** is used in this installation? "
        "*(Copper / Stainless Steel)*"
    ),
    "pipe_sizes": (
        "What **nominal pipe sizes** are present? "
        "*(15mm / 22mm / 28mm — or specify a custom internal diameter in mm)*"
    ),
    "compliance_focus": (
        "Is there a **specific compliance area** you want me to focus on? "
        "*(e.g., backflow prevention, minimum flow rates, pipe sizing, hot water return loop)*  "
        "Or type **'all'** to check everything."
    ),
    "building_type": (
        "What is the **building type / occupancy**? "
        "*(Residential / Commercial / Industrial)*"
    ),
}


@dataclass
class ClarificationSession:
    session_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    schematic_json: dict[str, Any] = field(default_factory=dict)
    answers: dict[str, str] = field(default_factory=dict)
    questions_asked: int = 0
    status: Literal["collecting", "ready", "answered"] = "collecting"
    consolidated_prompt: str | None = None

    def next_question(self) -> str | None:
        """Return the next unanswered question text, or None if all answered."""
        for key in QUESTION_KEYS:
            if key not in self.answers:
                return QUESTIONS[key]
        return None

    def record_answer(self, answer: str) -> None:
        """Store the answer to the current pending question."""
        for key in QUESTION_KEYS:
            if key not in self.answers:
                self.answers[key] = answer.strip()
                self.questions_asked += 1
                break

    @property
    def all_answered(self) -> bool:
        return all(k in self.answers for k in QUESTION_KEYS)

    @property
    def current_question_key(self) -> str | None:
        for key in QUESTION_KEYS:
            if key not in self.answers:
                return key
        return None


# ---------------------------------------------------------------------------
# In-memory session store (replace with Redis for multi-worker production)
# ---------------------------------------------------------------------------
_sessions: dict[str, ClarificationSession] = {}


def create_session(schematic_json: dict[str, Any] | None = None) -> ClarificationSession:
    session = ClarificationSession(schematic_json=schematic_json or {})
    _sessions[session.session_id] = session
    return session


def get_session(session_id: str) -> ClarificationSession | None:
    return _sessions.get(session_id)


def delete_session(session_id: str) -> None:
    _sessions.pop(session_id, None)


# ---------------------------------------------------------------------------
# Consolidated prompt builder (the Recap step)
# ---------------------------------------------------------------------------

def build_consolidated_prompt(
    session: ClarificationSession,
    retrieved_chunks: list[str],
    rules_text: str,
) -> str:
    """Build the single, comprehensive prompt that is sent to the LLM.

    This is the Recap technique: all gathered information is merged into
    one coherent context block, preventing multi-turn degradation.
    """
    schematic_summary = _summarise_schematic(session.schematic_json)
    answers_block = _format_answers(session.answers)
    context_block = _format_retrieved_chunks(retrieved_chunks)

    prompt = f"""You are a Senior Hydraulic Engineer reviewing a water plumbing schematic.
You have been provided with all necessary information to perform a thorough compliance evaluation.

═══════════════════════════════════════════════
SCHEMATIC OVERVIEW
═══════════════════════════════════════════════
{schematic_summary}

═══════════════════════════════════════════════
USER-PROVIDED HYDRAULIC PARAMETERS
═══════════════════════════════════════════════
{answers_block}

═══════════════════════════════════════════════
AUTOMATED COMPLIANCE CHECKS (deterministic)
═══════════════════════════════════════════════
{rules_text}

═══════════════════════════════════════════════
RELEVANT STANDARDS & CODES OF PRACTICE
═══════════════════════════════════════════════
{context_block}

═══════════════════════════════════════════════
YOUR TASK
═══════════════════════════════════════════════
Based on ALL the information above, provide a comprehensive hydraulic evaluation that:

1. **Confirms or corrects** the automated compliance check results with engineering reasoning
2. **Identifies any additional issues** based on the standards documents provided
3. **Explains each finding** with reference to the relevant standard/clause where possible
4. **Prioritises** findings as Critical / Major / Minor
5. **Recommends specific remediation steps** for any failures or warnings

Focus area: {session.answers.get("compliance_focus", "full compliance review")}
Building type: {session.answers.get("building_type", "not specified")}

Be precise, cite sources, and use engineering terminology appropriate for a professional report.
"""
    return prompt


def _summarise_schematic(metadata: dict[str, Any]) -> str:
    if not metadata:
        return "No schematic data attached."

    elements = metadata.get("elements", [])
    pipes    = metadata.get("pipes", [])
    hc       = metadata.get("hydraulic_context", {})
    summary  = metadata.get("summary", "")

    element_types = [e.get("node_type", "unknown") for e in elements]
    type_counts: dict[str, int] = {}
    for t in element_types:
        type_counts[t] = type_counts.get(t, 0) + 1

    return (
        f"Elements: {len(elements)} total — "
        + ", ".join(f"{k}: {v}" for k, v in type_counts.items())
        + f"\nPipes: {len(pipes)}"
        + f"\nFlow mode: {hc.get('flow_mode', 'unknown')}"
        + f"\nGravity head available: {hc.get('gravity_head_available_m', 'N/A')} m"
        + (f"\nNote: {hc.get('note', '')}" if hc.get("note") else "")
        + (f"\n{summary}" if summary else "")
    )


def _format_answers(answers: dict[str, str]) -> str:
    labels = {
        "source_pressure":   "Source pressure",
        "pipe_material":     "Pipe material",
        "pipe_sizes":        "Pipe sizes",
        "compliance_focus":  "Compliance focus",
        "building_type":     "Building type",
    }
    lines = [f"• {labels.get(k, k)}: {v}" for k, v in answers.items()]
    return "\n".join(lines) if lines else "No parameters provided."


def _format_retrieved_chunks(chunks: list[str]) -> str:
    if not chunks:
        return "No documents available in knowledge base. (Upload standards documents via the Knowledge tab.)"
    parts = []
    for i, chunk in enumerate(chunks, 1):
        parts.append(f"[Source {i}]\n{chunk}")
    return "\n\n".join(parts)
