"""
vector_store.py — ChromaDB wrapper for the RAG knowledge base.

Manages embedding generation (BAAI/bge-small-en-v1.5) and
persistent storage of document chunks for semantic retrieval.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import NamedTuple

import chromadb
from chromadb.config import Settings
from sentence_transformers import SentenceTransformer

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
_BASE = Path(__file__).resolve().parents[2]  # backend/
CHROMA_PATH = _BASE / "chroma_db"
COLLECTION_NAME = "hydraulic_knowledge"

# ---------------------------------------------------------------------------
# Embedding model (loaded once, shared)
# ---------------------------------------------------------------------------
_EMBED_MODEL_NAME = "BAAI/bge-small-en-v1.5"
_embed_model: SentenceTransformer | None = None


def _get_embed_model() -> SentenceTransformer:
    global _embed_model
    if _embed_model is None:
        _embed_model = SentenceTransformer(_EMBED_MODEL_NAME)
    return _embed_model


# ---------------------------------------------------------------------------
# ChromaDB client (singleton)
# ---------------------------------------------------------------------------
_client: chromadb.PersistentClient | None = None


def _get_client() -> chromadb.PersistentClient:
    global _client
    if _client is None:
        CHROMA_PATH.mkdir(parents=True, exist_ok=True)
        _client = chromadb.PersistentClient(
            path=str(CHROMA_PATH),
            settings=Settings(anonymized_telemetry=False),
        )
    return _client


def _get_collection() -> chromadb.Collection:
    client = _get_client()
    return client.get_or_create_collection(
        name=COLLECTION_NAME,
        metadata={"hnsw:space": "cosine"},
    )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

class RetrievedChunk(NamedTuple):
    chunk_id: str
    text: str
    source: str       # filename
    page: int | None
    score: float      # cosine similarity (0–1, higher = more similar)


def add_chunks(
    chunks: list[dict],  # each: {"id", "text", "source", "page"}
    batch_size: int = 64,
) -> int:
    """Embed and store document chunks. Returns count added."""
    if not chunks:
        return 0

    collection = _get_collection()
    model = _get_embed_model()

    texts = [c["text"] for c in chunks]
    ids   = [c["id"]   for c in chunks]
    metas = [{"source": c["source"], "page": c.get("page", -1)} for c in chunks]

    # Batch embed to avoid OOM on large documents
    all_embeddings: list[list[float]] = []
    for i in range(0, len(texts), batch_size):
        batch = texts[i : i + batch_size]
        vecs = model.encode(batch, normalize_embeddings=True).tolist()
        all_embeddings.extend(vecs)

    # ChromaDB max upsert batch = 5461; split to stay under limit
    CHROMA_MAX = 5000
    for i in range(0, len(chunks), CHROMA_MAX):
        collection.upsert(
            ids=ids[i : i + CHROMA_MAX],
            embeddings=all_embeddings[i : i + CHROMA_MAX],
            documents=texts[i : i + CHROMA_MAX],
            metadatas=metas[i : i + CHROMA_MAX],
        )
    return len(chunks)


def query(text: str, k: int = 5) -> list[RetrievedChunk]:
    """Retrieve top-k most relevant chunks for a query string."""
    collection = _get_collection()
    model = _get_embed_model()

    vec = model.encode([text], normalize_embeddings=True).tolist()
    results = collection.query(
        query_embeddings=vec,
        n_results=min(k, collection.count() or 1),
        include=["documents", "metadatas", "distances"],
    )

    chunks: list[RetrievedChunk] = []
    docs      = results.get("documents", [[]])[0]
    metas     = results.get("metadatas",  [[]])[0]
    distances = results.get("distances",  [[]])[0]

    for doc, meta, dist in zip(docs, metas, distances):
        # ChromaDB cosine distance = 1 - cosine_similarity
        similarity = round(1.0 - float(dist), 4)
        chunks.append(RetrievedChunk(
            chunk_id="",
            text=doc,
            source=meta.get("source", "unknown"),
            page=meta.get("page"),
            score=similarity,
        ))

    return chunks


def collection_count() -> int:
    """Number of chunks currently stored."""
    return _get_collection().count()


def clear_collection() -> None:
    """Delete all chunks (used when re-ingesting all documents)."""
    client = _get_client()
    try:
        client.delete_collection(COLLECTION_NAME)
    except Exception:
        pass
