"""
knowledge_qa.py — Strict RAG Q&A with multi-turn clarification (Recap technique).

Architecture (arXiv:2505.06120 — Recap to prevent multi-turn LLM degradation):

  Phase 1 — Query + Clarification Detection
    User query → vector retrieval → few-shot LLM check →
      IF answer is deterministic from chunks  → Phase 3 directly
      IF answer depends on a missing param   → ask ONE clarifying question,
                                               store session

  Phase 2 — Collect Clarification (no chat history fed back)
    User answers the clarifying question → stored in session, NOT appended
    to a message list (prevents ~39% degradation from context accumulation)

  Phase 3 — Consolidated Inference (single LLM call)
    Build Recap prompt: original question + clarification answer + same chunks
    → One LLM call → structured response with citations + token metrics

Session state is in-memory (dict); sessions are discarded after the final answer.
"""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from typing import Literal

from app.agents.model_router import complete
from app.services.metrics_tracker import (
    QueryMetrics,
    calculate_cost,
    estimate_faithfulness,
    save_metrics,
)
from app.services.vector_store import RetrievedChunk, query as vs_query

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SIMILARITY_THRESHOLD = 0.55     # below this → out-of-scope, no LLM call
TOP_K = 8                        # chunks retrieved per query
TEMPERATURE = 0.0                # deterministic throughout

# ---------------------------------------------------------------------------
# System prompts
# ---------------------------------------------------------------------------

# Phase 1 prompt: few-shot examples teach the model to detect ambiguity and
# ask exactly ONE clarifying question when the answer depends on a parameter
# the user has not yet provided.
_CLARIFICATION_SYSTEM_PROMPT = """\
You are a technical reference assistant specialising in Singapore water supply \
regulations and plumbing standards.

Your task: given document excerpts and a user question, decide whether to
(A) answer directly with inline citations, OR
(B) ask exactly ONE clarifying question because the correct answer depends on a
    parameter the user has not provided.

RULES:
1. If the excerpts contain a single, unambiguous answer → answer directly and
   cite every factual claim as [Source: <filename>, Page <number>].
2. If the excerpts show the answer differs depending on an unspecified parameter
   (e.g., property elevation, pipe application, number of units, supply zone) →
   output ONLY: CLARIFY: <your single clarifying question, with bullet options>.
3. Never ask more than one question per turn.
4. If the excerpts do not cover the topic at all → respond with exactly:
   "I cannot find sufficient information about this in the knowledge base. \
This question may be outside the scope of the available documents."
5. Never guess, infer, or extrapolate beyond what the excerpts state.

--- FEW-SHOT EXAMPLES ---

EXAMPLE A — direct answer (no ambiguity):
Question: "What is the minimum internal diameter for a service pipe?"
Excerpts: [...state that the minimum internal diameter for a service pipe is 25 mm...]
Response:
The minimum internal diameter for a service pipe is 25 mm.
[Source: Water Supply (Waterworks) Regulations, Page 12]

EXAMPLE B — needs clarification (answer differs by elevation):
Question: "What mode of supply is required for my house?"
Excerpts: [...describe three modes: direct supply for properties at or below 25 m above
mean sea level (MSL); boosted/pumped supply for 25–37 m above MSL; gravity tank +
booster for properties above 37 m above MSL...]
Response:
CLARIFY: To advise the correct mode of supply for your property, I need to know its \
elevation above mean sea level. Which of the following applies?
• At or below 25 m above mean sea level
• Between 25 m and 37 m above mean sea level
• Above 37 m above mean sea level

EXAMPLE C — needs clarification (material depends on application):
Question: "What type of pipe should I use?"
Excerpts: [...list different approved materials for potable water vs. non-potable applications...]
Response:
CLARIFY: What is the intended application for this pipe?
• Potable (drinking) water supply
• Non-potable use (e.g., irrigation, flushing, fire protection)\
"""

# Phase 3 prompt: used for the consolidated Recap call after clarification is collected.
_ANSWER_SYSTEM_PROMPT = """\
You are a technical reference assistant specialising in Singapore water supply \
regulations and plumbing standards.

STRICT RULES — follow every one without exception:
1. Answer ONLY using the document excerpts provided. Never use outside knowledge.
2. Cite the source document and page number for every factual statement:
   [Source: <filename>, Page <number>]
3. If the excerpts do not contain enough information, respond with exactly:
   "I cannot find sufficient information about this in the knowledge base. \
This question may be outside the scope of the available documents."
4. Never guess, infer, or extrapolate beyond what the excerpts explicitly state.
5. If uncertain about any detail, say so explicitly.\
"""

_OUT_OF_SCOPE_ANSWER = (
    "I cannot find relevant information about this topic in the knowledge base. "
    "The available documents cover Singapore water supply regulations and plumbing "
    "standards (e.g. PUB Water Supply Regulations, Application Handbook). "
    "Please ask a question related to these topics."
)

# ---------------------------------------------------------------------------
# Session state  (Recap technique — arXiv:2505.06120)
# ---------------------------------------------------------------------------

@dataclass
class KnowledgeQASession:
    session_id: str
    original_question: str
    retrieved_chunks: list[RetrievedChunk]
    clarification_question: str = ""   # question we asked the user
    clarification_answer: str = ""     # user's response (filled in Phase 2)
    turns: int = 0

# In-memory store; sessions are popped and discarded after the final answer.
_sessions: dict[str, KnowledgeQASession] = {}


# ---------------------------------------------------------------------------
# Response type
# ---------------------------------------------------------------------------

@dataclass
class KnowledgeQAResponse:
    type: Literal["answer", "question"]  # "question" = requesting clarification
    answer: str
    session_id: str | None = None
    citations: list[dict] = field(default_factory=list)
    out_of_scope: bool = False
    confidence: float = 0.0             # mean similarity of retrieved chunks
    retrieved_chunks: int = 0
    latency_ms: float = 0.0
    input_tokens: int = 0
    output_tokens: int = 0
    cost_usd: float = 0.0


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def answer_question(
    question: str,
    provider: str,
    session_id: str | None = None,
) -> KnowledgeQAResponse:
    """Multi-turn knowledge base Q&A using the Recap technique.

    Parameters
    ----------
    question   : The user's question (Phase 1) or clarification answer (Phase 2).
    provider   : 'openai' or 'qwen'.
    session_id : Present on Phase 2 requests; identifies the stored session.
    """
    t_start = time.perf_counter()

    # ── Phase 2: user is answering our clarifying question ──────────────────
    if session_id and session_id in _sessions:
        session = _sessions.pop(session_id)
        session.clarification_answer = question
        return await _consolidated_answer(session, provider, t_start)

    # ── Phase 1: brand-new question ──────────────────────────────────────────
    chunks: list[RetrievedChunk] = vs_query(question, k=TOP_K)

    if not chunks:
        return KnowledgeQAResponse(
            type="answer",
            answer=(
                "The knowledge base appears to be empty. "
                "Please ingest documents via the /api/knowledge/ingest endpoint first."
            ),
            out_of_scope=True,
            latency_ms=_elapsed(t_start),
        )

    top_score = chunks[0].score
    mean_score = sum(c.score for c in chunks) / len(chunks)

    # Hard guardrail: below threshold → canned response, no LLM call
    if top_score < SIMILARITY_THRESHOLD:
        return KnowledgeQAResponse(
            type="answer",
            answer=_OUT_OF_SCOPE_ANSWER,
            out_of_scope=True,
            confidence=round(top_score, 4),
            retrieved_chunks=len(chunks),
            latency_ms=_elapsed(t_start),
        )

    # Build excerpt block for the LLM
    excerpt_lines = _build_excerpt_block(chunks)
    user_prompt = (
        "KNOWLEDGE BASE EXCERPTS:\n\n"
        + "\n\n---\n\n".join(excerpt_lines)
        + f"\n\nQUESTION: {question}\n\n"
        "Determine: answer directly (with citations) or output CLARIFY: <question>:"
    )

    messages = [
        {"role": "system", "content": _CLARIFICATION_SYSTEM_PROMPT},
        {"role": "user",   "content": user_prompt},
    ]

    llm_resp = await complete(provider, messages, temperature=TEMPERATURE)
    content = llm_resp.content.strip()
    input_tokens = llm_resp.input_tokens
    output_tokens = llm_resp.output_tokens
    cost = calculate_cost(llm_resp.model, input_tokens, output_tokens)
    latency = _elapsed(t_start)

    # ── Clarification branch ────────────────────────────────────────────────
    if content.upper().startswith("CLARIFY:"):
        clarification_q = content[len("CLARIFY:"):].strip()
        new_sid = str(uuid.uuid4())
        _sessions[new_sid] = KnowledgeQASession(
            session_id=new_sid,
            original_question=question,
            retrieved_chunks=chunks,
            clarification_question=clarification_q,
            turns=1,
        )
        _save_metrics(
            provider, llm_resp.model, new_sid,
            input_tokens, output_tokens, cost,
            chunks, mean_score, top_score, "",
            latency_ms=latency,
        )
        return KnowledgeQAResponse(
            type="question",
            answer=clarification_q,
            session_id=new_sid,
            confidence=round(mean_score, 4),
            retrieved_chunks=len(chunks),
            latency_ms=latency,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cost_usd=round(cost, 8),
        )

    # ── Direct answer branch ────────────────────────────────────────────────
    citations = _build_citations(chunks)
    _save_metrics(
        provider, llm_resp.model, "single-turn",
        input_tokens, output_tokens, cost,
        chunks, mean_score, top_score, content,
        latency_ms=latency,
    )
    return KnowledgeQAResponse(
        type="answer",
        answer=content,
        citations=citations,
        out_of_scope=False,
        confidence=round(mean_score, 4),
        retrieved_chunks=len(chunks),
        latency_ms=latency,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        cost_usd=round(cost, 8),
    )


# ---------------------------------------------------------------------------
# Phase 3 — Consolidated Recap inference
# ---------------------------------------------------------------------------

async def _consolidated_answer(
    session: KnowledgeQASession,
    provider: str,
    t_start: float,
) -> KnowledgeQAResponse:
    """Single LLM call with original question + clarification baked into one prompt.

    This is the Recap technique: instead of feeding back the chat history
    (which degrades LLM performance ~39% per arXiv:2505.06120), we reconstruct
    the full context from stored state in a single consolidated user message.
    The SAME chunks retrieved in Phase 1 are reused — no re-retrieval.
    """
    chunks = session.retrieved_chunks
    mean_score = sum(c.score for c in chunks) / len(chunks) if chunks else 0.0
    top_score = max((c.score for c in chunks), default=0.0)

    excerpt_lines = _build_excerpt_block(chunks)

    # Recap-style: everything baked into one user message, no prior turns in messages[]
    consolidated_prompt = (
        "KNOWLEDGE BASE EXCERPTS:\n\n"
        + "\n\n---\n\n".join(excerpt_lines)
        + f"\n\nORIGINAL QUESTION: {session.original_question}\n\n"
        f"CLARIFICATION PROVIDED:\n"
        f"  Question asked: {session.clarification_question}\n"
        f"  User's answer:  {session.clarification_answer}\n\n"
        "Using the clarification above, answer the original question. "
        "Cite [Source: <filename>, Page <number>] for every factual claim."
    )

    messages = [
        {"role": "system", "content": _ANSWER_SYSTEM_PROMPT},
        {"role": "user",   "content": consolidated_prompt},
    ]

    llm_resp = await complete(provider, messages, temperature=TEMPERATURE)
    content = llm_resp.content.strip()
    input_tokens = llm_resp.input_tokens
    output_tokens = llm_resp.output_tokens
    cost = calculate_cost(llm_resp.model, input_tokens, output_tokens)
    latency = _elapsed(t_start)

    citations = _build_citations(chunks)
    _save_metrics(
        provider, llm_resp.model, session.session_id,
        input_tokens, output_tokens, cost,
        chunks, mean_score, top_score, content,
        latency_ms=latency,
        clarification_turns=session.turns,
        recap_used=True,
    )

    return KnowledgeQAResponse(
        type="answer",
        answer=content,
        citations=citations,
        out_of_scope=False,
        confidence=round(mean_score, 4),
        retrieved_chunks=len(chunks),
        latency_ms=latency,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        cost_usd=round(cost, 8),
    )


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

def _build_excerpt_block(chunks: list[RetrievedChunk]) -> list[str]:
    lines = []
    for i, chunk in enumerate(chunks, 1):
        page_str = f"Page {chunk.page}" if chunk.page and chunk.page > 0 else "Page unknown"
        header = (
            f"[Excerpt {i} | Source: {chunk.source} | {page_str} "
            f"| Relevance: {chunk.score:.0%}]"
        )
        lines.append(f"{header}\n{chunk.text}")
    return lines


def _build_citations(chunks: list[RetrievedChunk]) -> list[dict]:
    return [
        {
            "source":  c.source,
            "page":    c.page if c.page and c.page > 0 else None,
            "snippet": c.text[:200] + "…" if len(c.text) > 200 else c.text,
            "score":   round(c.score, 3),
        }
        for c in chunks
        if c.score >= SIMILARITY_THRESHOLD
    ]


def _save_metrics(
    provider: str,
    model: str,
    session_id: str,
    input_tokens: int,
    output_tokens: int,
    cost: float,
    chunks: list[RetrievedChunk],
    mean_score: float,
    top_score: float,
    answer: str,
    latency_ms: float,
    clarification_turns: int = 0,
    recap_used: bool = False,
) -> None:
    chunk_texts = [c.text for c in chunks]
    faithfulness = estimate_faithfulness(answer, chunk_texts)
    tps = (output_tokens / (latency_ms / 1000.0)) if latency_ms > 0 else 0.0
    save_metrics(QueryMetrics(
        session_id=session_id,
        model=model,
        provider=provider,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        cost_usd=cost,
        latency_ms=round(latency_ms, 1),
        tokens_per_sec=round(tps, 1),
        retrieved_chunks=len(chunks),
        top_similarity=round(top_score, 4),
        mean_similarity=round(mean_score, 4),
        faithfulness=faithfulness,
        clarification_turns=clarification_turns,
        recap_used=recap_used,
    ))


def _elapsed(t_start: float) -> float:
    return round((time.perf_counter() - t_start) * 1000.0, 1)
