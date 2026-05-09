"""
metrics_tracker.py — Track token usage, costs, latency, and RAG quality.

Stores records in a local SQLite database: backend/metrics.db
"""

from __future__ import annotations

import sqlite3
import time
from contextlib import contextmanager
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

DB_PATH = Path(__file__).resolve().parents[2] / "metrics.db"

# ---------------------------------------------------------------------------
# Model pricing (USD per 1M tokens, as of mid-2025)
# ---------------------------------------------------------------------------
MODEL_PRICING: dict[str, dict[str, float]] = {
    "gpt-4o-mini": {"input": 0.15, "output": 0.60},
    "Qwen/Qwen2.5-7B-Instruct-Turbo": {"input": 0.20, "output": 0.20},
}


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------

@dataclass
class QueryMetrics:
    session_id: str
    model: str
    provider: str                  # "openai" | "qwen"
    input_tokens: int
    output_tokens: int
    cost_usd: float
    latency_ms: float
    tokens_per_sec: float
    # RAG quality
    retrieved_chunks: int
    top_similarity: float
    mean_similarity: float
    faithfulness: float            # 0–1 heuristic
    # Conversation quality (Recap technique)
    clarification_turns: int
    recap_used: bool
    timestamp: float = 0.0        # Unix timestamp, filled on save


# ---------------------------------------------------------------------------
# DB helpers
# ---------------------------------------------------------------------------

def _get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def _ensure_table() -> None:
    with _get_conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS query_metrics (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id      TEXT,
                model           TEXT,
                provider        TEXT,
                input_tokens    INTEGER,
                output_tokens   INTEGER,
                cost_usd        REAL,
                latency_ms      REAL,
                tokens_per_sec  REAL,
                retrieved_chunks INTEGER,
                top_similarity  REAL,
                mean_similarity REAL,
                faithfulness    REAL,
                clarification_turns INTEGER,
                recap_used      INTEGER,
                timestamp       REAL
            )
        """)


_ensure_table()


# ---------------------------------------------------------------------------
# Cost calculation
# ---------------------------------------------------------------------------

def calculate_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    """Return cost in USD based on token counts and model pricing table."""
    pricing = MODEL_PRICING.get(model, {"input": 0.0, "output": 0.0})
    return (input_tokens * pricing["input"] + output_tokens * pricing["output"]) / 1_000_000


# ---------------------------------------------------------------------------
# Faithfulness heuristic
# ---------------------------------------------------------------------------

def estimate_faithfulness(answer: str, retrieved_chunks: list[str]) -> float:
    """Heuristic faithfulness: fraction of answer sentences that share
    at least one significant word with the retrieved context.

    This is a lightweight proxy — production systems should use a dedicated
    NLI or LLM-as-judge approach.
    """
    if not retrieved_chunks or not answer.strip():
        return 0.0

    context = " ".join(retrieved_chunks).lower()
    # Tokenise context into significant words (>4 chars)
    context_words = set(w for w in context.split() if len(w) > 4)

    sentences = [s.strip() for s in answer.replace(".\n", ". ").split(". ") if s.strip()]
    if not sentences:
        return 0.0

    grounded = 0
    for sent in sentences:
        sent_words = set(w.lower() for w in sent.split() if len(w) > 4)
        if sent_words & context_words:
            grounded += 1

    return round(grounded / len(sentences), 3)


# ---------------------------------------------------------------------------
# Timer context manager
# ---------------------------------------------------------------------------

@contextmanager
def timer():
    """Context manager that yields a dict with 'elapsed_ms' set on exit."""
    data: dict[str, float] = {}
    start = time.perf_counter()
    yield data
    data["elapsed_ms"] = (time.perf_counter() - start) * 1000.0


# ---------------------------------------------------------------------------
# Save & query
# ---------------------------------------------------------------------------

def save_metrics(m: QueryMetrics) -> None:
    """Persist a QueryMetrics record to SQLite."""
    m.timestamp = time.time()
    row = asdict(m)
    row["recap_used"] = int(row["recap_used"])

    with _get_conn() as conn:
        conn.execute("""
            INSERT INTO query_metrics
            (session_id, model, provider, input_tokens, output_tokens,
             cost_usd, latency_ms, tokens_per_sec, retrieved_chunks,
             top_similarity, mean_similarity, faithfulness,
             clarification_turns, recap_used, timestamp)
            VALUES
            (:session_id, :model, :provider, :input_tokens, :output_tokens,
             :cost_usd, :latency_ms, :tokens_per_sec, :retrieved_chunks,
             :top_similarity, :mean_similarity, :faithfulness,
             :clarification_turns, :recap_used, :timestamp)
        """, row)


def get_summary() -> dict[str, Any]:
    """Return aggregate statistics across all recorded queries."""
    with _get_conn() as conn:
        rows = conn.execute("SELECT * FROM query_metrics").fetchall()

    if not rows:
        return {"total_queries": 0}

    total_queries   = len(rows)
    total_cost      = sum(r["cost_usd"]      for r in rows)
    avg_latency_ms  = sum(r["latency_ms"]    for r in rows) / total_queries
    avg_faithfulness = sum(r["faithfulness"] for r in rows) / total_queries
    avg_similarity  = sum(r["mean_similarity"] for r in rows) / total_queries
    total_tokens    = sum(r["input_tokens"] + r["output_tokens"] for r in rows)

    by_model: dict[str, dict] = {}
    for r in rows:
        m = r["model"]
        if m not in by_model:
            by_model[m] = {"queries": 0, "cost_usd": 0.0, "avg_latency_ms": 0.0}
        by_model[m]["queries"]      += 1
        by_model[m]["cost_usd"]     += r["cost_usd"]
        by_model[m]["avg_latency_ms"] += r["latency_ms"]
    for m in by_model:
        by_model[m]["avg_latency_ms"] = round(
            by_model[m]["avg_latency_ms"] / by_model[m]["queries"], 1
        )
        by_model[m]["cost_usd"] = round(by_model[m]["cost_usd"], 6)

    return {
        "total_queries":      total_queries,
        "total_tokens":       total_tokens,
        "total_cost_usd":     round(total_cost, 6),
        "avg_latency_ms":     round(avg_latency_ms, 1),
        "avg_faithfulness":   round(avg_faithfulness, 3),
        "avg_similarity":     round(avg_similarity, 3),
        "by_model":           by_model,
    }
