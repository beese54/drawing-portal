"""
rag_agent.py — RAG Agent Orchestration

Coordinates:
  1. ClarificationEngine  → collect user parameters (Recap technique)
  2. RulesEngine          → deterministic compliance checks
  3. VectorStore          → retrieve relevant document chunks
  4. ModelRouter          → single consolidated LLM call
  5. MetricsTracker       → log token usage, cost, latency, RAG quality
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any

from app.agents.clarification_engine import (
    ClarificationSession,
    build_consolidated_prompt,
    get_session,
)
from app.agents.model_router import complete, LLMResponse
from app.agents.rules_engine import run_checks
from app.services.metrics_tracker import (
    QueryMetrics,
    calculate_cost,
    estimate_faithfulness,
    save_metrics,
)
from app.services.vector_store import RetrievedChunk, query as vs_query


@dataclass
class AgentTurnResponse:
    """Returned for each conversational turn."""
    type: str                         # "question" | "answer" | "error"
    content: str                      # Message to display to user
    session_id: str
    is_final: bool = False
    metrics: dict | None = None       # populated on final answer turn


# ---------------------------------------------------------------------------
# Conversational turn handler
# ---------------------------------------------------------------------------

async def handle_turn(
    session: ClarificationSession,
    user_message: str,
    provider: str = "openai",
    top_k: int = 5,
) -> AgentTurnResponse:
    """Process one user message in the clarification → evaluation pipeline.

    Parameters
    ----------
    session : ClarificationSession
        Active session object.
    user_message : str
        The user's latest message.
    provider : str
        'openai' or 'qwen'.
    top_k : int
        Number of document chunks to retrieve.

    Returns
    -------
    AgentTurnResponse
    """
    # ── Phase 1: Collecting clarification answers ───────────────────────────
    if session.status == "collecting":
        # Store the answer for the currently pending question
        if session.current_question_key:
            session.record_answer(user_message)

        # Check if we now have all answers (or user typed "skip" / "evaluate")
        force_evaluate = user_message.strip().lower() in ("skip", "evaluate", "done", "go")

        if session.all_answered or force_evaluate:
            session.status = "ready"
            return await _run_evaluation(session, provider, top_k)

        # Ask next question
        next_q = session.next_question()
        if next_q:
            return AgentTurnResponse(
                type="question",
                content=next_q,
                session_id=session.session_id,
            )

    # ── Phase 2: Already collected, now evaluate ────────────────────────────
    if session.status == "ready":
        return await _run_evaluation(session, provider, top_k)

    # ── Already answered — allow follow-up Q&A ─────────────────────────────
    if session.status == "answered":
        return await _run_followup(session, user_message, provider, top_k)

    return AgentTurnResponse(
        type="error",
        content="Session in unexpected state. Please start a new session.",
        session_id=session.session_id,
    )


async def _run_evaluation(
    session: ClarificationSession,
    provider: str,
    top_k: int,
) -> AgentTurnResponse:
    """Build consolidated prompt and run single LLM inference."""
    t_start = time.perf_counter()

    # 1. Deterministic rules check
    rules_report = run_checks(session.schematic_json)
    rules_text = rules_report.as_text()

    # 2. RAG retrieval — build a rich query from schematic + answers
    query_text = _build_retrieval_query(session)
    retrieved: list[RetrievedChunk] = vs_query(query_text, k=top_k)
    chunk_texts = [c.text for c in retrieved]

    # 3. Recap: build ONE consolidated prompt
    final_prompt = build_consolidated_prompt(session, chunk_texts, rules_text)
    session.consolidated_prompt = final_prompt

    messages = [
        {"role": "system",
         "content": "You are a Senior Hydraulic Engineer specialising in water plumbing compliance."},
        {"role": "user", "content": final_prompt},
    ]

    # 4. Single LLM call
    llm_resp: LLMResponse = await complete(provider, messages, temperature=0.2)

    latency_ms = (time.perf_counter() - t_start) * 1000.0
    t_per_s = (llm_resp.output_tokens / (latency_ms / 1000.0)) if latency_ms > 0 else 0.0

    # 5. Metrics
    cost = calculate_cost(llm_resp.model, llm_resp.input_tokens, llm_resp.output_tokens)
    faithfulness = estimate_faithfulness(llm_resp.content, chunk_texts)
    similarity_scores = [c.score for c in retrieved]

    metrics = QueryMetrics(
        session_id=session.session_id,
        model=llm_resp.model,
        provider=provider,
        input_tokens=llm_resp.input_tokens,
        output_tokens=llm_resp.output_tokens,
        cost_usd=cost,
        latency_ms=round(latency_ms, 1),
        tokens_per_sec=round(t_per_s, 1),
        retrieved_chunks=len(retrieved),
        top_similarity=round(max(similarity_scores, default=0.0), 4),
        mean_similarity=round(
            sum(similarity_scores) / len(similarity_scores) if similarity_scores else 0.0, 4
        ),
        faithfulness=faithfulness,
        clarification_turns=session.questions_asked,
        recap_used=True,
    )
    save_metrics(metrics)

    session.status = "answered"

    return AgentTurnResponse(
        type="answer",
        content=llm_resp.content,
        session_id=session.session_id,
        is_final=True,
        metrics={
            "model":             llm_resp.model,
            "provider":          provider,
            "input_tokens":      llm_resp.input_tokens,
            "output_tokens":     llm_resp.output_tokens,
            "cost_usd":          round(cost, 6),
            "latency_ms":        round(latency_ms, 1),
            "tokens_per_sec":    round(t_per_s, 1),
            "retrieved_chunks":  len(retrieved),
            "top_similarity":    metrics.top_similarity,
            "mean_similarity":   metrics.mean_similarity,
            "faithfulness":      faithfulness,
            "clarification_turns": session.questions_asked,
            "recap_used":        True,
            "rules_summary": {
                "fail": rules_report.fail_count,
                "warn": rules_report.warn_count,
                "pass": rules_report.pass_count,
                "items": rules_report.as_list(),
            },
        },
    )


async def _run_followup(
    session: ClarificationSession,
    user_message: str,
    provider: str,
    top_k: int,
) -> AgentTurnResponse:
    """Handle follow-up questions after the main evaluation is done.

    For follow-ups we allow a short multi-turn exchange, but we prepend
    a context summary (the Recap approach) to each follow-up prompt so
    the model doesn't lose context.
    """
    t_start = time.perf_counter()

    retrieved: list[RetrievedChunk] = vs_query(user_message, k=top_k)
    chunk_texts = [c.text for c in retrieved]
    context = "\n\n".join(chunk_texts) if chunk_texts else "No additional documents found."

    messages = [
        {"role": "system",
         "content": "You are a Senior Hydraulic Engineer. Answer follow-up questions "
                    "about the schematic evaluation you already completed."},
        {"role": "user",
         "content": (
             f"[Context recap — previously evaluated schematic session {session.session_id}]\n"
             f"Pipe material: {session.answers.get('pipe_material', 'unknown')}, "
             f"Source pressure: {session.answers.get('source_pressure', 'unknown')}, "
             f"Building: {session.answers.get('building_type', 'unknown')}\n\n"
             f"[Relevant knowledge base excerpts]\n{context}\n\n"
             f"[Follow-up question]\n{user_message}"
         )},
    ]

    llm_resp: LLMResponse = await complete(provider, messages, temperature=0.3)
    latency_ms = (time.perf_counter() - t_start) * 1000.0

    cost = calculate_cost(llm_resp.model, llm_resp.input_tokens, llm_resp.output_tokens)
    faithfulness = estimate_faithfulness(llm_resp.content, chunk_texts)
    similarity_scores = [c.score for c in retrieved]

    save_metrics(QueryMetrics(
        session_id=session.session_id,
        model=llm_resp.model,
        provider=provider,
        input_tokens=llm_resp.input_tokens,
        output_tokens=llm_resp.output_tokens,
        cost_usd=cost,
        latency_ms=round(latency_ms, 1),
        tokens_per_sec=round(llm_resp.output_tokens / (latency_ms / 1000.0 or 1), 1),
        retrieved_chunks=len(retrieved),
        top_similarity=round(max(similarity_scores, default=0.0), 4),
        mean_similarity=round(sum(similarity_scores) / len(similarity_scores) if similarity_scores else 0.0, 4),
        faithfulness=faithfulness,
        clarification_turns=0,
        recap_used=True,  # context recap prepended
    ))

    return AgentTurnResponse(
        type="answer",
        content=llm_resp.content,
        session_id=session.session_id,
        is_final=False,
        metrics={
            "cost_usd":       round(cost, 6),
            "latency_ms":     round(latency_ms, 1),
            "input_tokens":   llm_resp.input_tokens,
            "output_tokens":  llm_resp.output_tokens,
            "faithfulness":   faithfulness,
        },
    )


def _build_retrieval_query(session: ClarificationSession) -> str:
    """Build a rich retrieval query from schematic context + user answers."""
    parts = [
        "water plumbing hydraulic compliance",
        session.answers.get("compliance_focus", ""),
        session.answers.get("building_type", ""),
        session.answers.get("pipe_material", ""),
    ]
    hc = session.schematic_json.get("hydraulic_context", {})
    if hc.get("flow_mode"):
        parts.append(f"{hc['flow_mode']} water supply")

    return " ".join(p for p in parts if p).strip() or "water plumbing standards"
