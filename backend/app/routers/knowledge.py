"""
knowledge.py — Knowledge base document management endpoints.

Endpoints:
    POST /api/knowledge/ingest    Re-index all docs in knowledge/ folder
    GET  /api/knowledge/status    Check vector store stats
    GET  /api/knowledge/files     List uploaded knowledge files
    GET  /api/knowledge/metrics   Aggregated LLM usage and RAG quality metrics
    POST /api/knowledge/ask       RAG Q&A with strict grounding and citations
"""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.agents.knowledge_qa import answer_question
from app.services.document_ingestion import ingest_folder
from app.services.metrics_tracker import get_summary
from app.services.vector_store import collection_count

router = APIRouter()


class KnowledgeAskRequest(BaseModel):
    question: str
    provider: str = "openai"
    session_id: str | None = None

KNOWLEDGE_DIR = Path(__file__).resolve().parents[2] / "knowledge"


@router.post("/ingest")
async def ingest_documents() -> dict:
    """Re-index all PDF and DOCX files in the knowledge/ folder.

    This wipes the existing vector store and rebuilds from scratch.
    Call this endpoint after uploading new documents to knowledge/.
    """
    if not KNOWLEDGE_DIR.exists():
        raise HTTPException(status_code=500, detail="knowledge/ folder not found.")

    try:
        summary = ingest_folder(KNOWLEDGE_DIR)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Ingestion failed: {exc}")

    total_chunks = sum(v for v in summary.values() if v > 0)
    return {
        "status":       "ok",
        "files":        summary,
        "total_chunks": total_chunks,
    }


@router.get("/status")
async def knowledge_status() -> dict:
    """Return current vector store statistics."""
    return {
        "chunks_indexed": collection_count(),
        "knowledge_dir":  str(KNOWLEDGE_DIR),
    }


@router.get("/files")
async def list_knowledge_files() -> dict:
    """List files currently in the knowledge/ folder."""
    if not KNOWLEDGE_DIR.exists():
        return {"files": []}

    supported = {".pdf", ".docx"}
    files = [
        {"name": f.name, "size_kb": round(f.stat().st_size / 1024, 1)}
        for f in KNOWLEDGE_DIR.iterdir()
        if f.suffix.lower() in supported
    ]
    return {"files": files}


@router.get("/metrics")
async def metrics_summary() -> dict:
    """Return aggregated LLM usage and RAG quality metrics."""
    return get_summary()


@router.post("/ask")
async def ask_knowledge_base(body: KnowledgeAskRequest) -> dict:
    """Answer a question using only the ingested knowledge base documents.

    Guardrails:
    - If the top retrieved chunk similarity < 0.45, returns out_of_scope=true
      without calling the LLM.
    - The LLM is instructed to cite [Source: <file>, Page <N>] for every claim
      and to explicitly refuse to answer if the excerpts don't cover the topic.

    Returns
    -------
    {
      "answer":           str,
      "citations":        [{source, page, snippet, score}, ...],
      "out_of_scope":     bool,
      "confidence":       float,   # mean similarity of retrieved chunks
      "retrieved_chunks": int,
      "latency_ms":       float,
    }
    """
    if not body.question.strip():
        raise HTTPException(status_code=400, detail="Question must not be empty.")

    try:
        result = await answer_question(
            body.question.strip(), body.provider, body.session_id
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Knowledge Q&A failed: {exc}")

    return {
        "type":             result.type,
        "answer":           result.answer,
        "session_id":       result.session_id,
        "citations":        result.citations,
        "out_of_scope":     result.out_of_scope,
        "confidence":       result.confidence,
        "retrieved_chunks": result.retrieved_chunks,
        "latency_ms":       result.latency_ms,
        "input_tokens":     result.input_tokens,
        "output_tokens":    result.output_tokens,
        "cost_usd":         result.cost_usd,
    }
