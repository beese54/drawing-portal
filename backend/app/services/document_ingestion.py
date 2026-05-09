"""
document_ingestion.py — Ingest PDF and DOCX files into the vector store.

Chunking strategy:
- Chunk size:    512 tokens  (~2000 characters)
- Overlap:       50  tokens  (~200 characters)
- Boundary-aware: prefer splitting at paragraph/sentence boundaries
"""

from __future__ import annotations

import hashlib
import re
from pathlib import Path
from typing import Iterator

# ---------------------------------------------------------------------------
# Document readers
# ---------------------------------------------------------------------------

def _read_pdf(path: Path) -> Iterator[tuple[str, int]]:
    """Yield (text, page_number) for each page of a PDF.

    Strips repeating page-header/footer lines (e.g. running headers in legal
    documents like "Public Utilities ... Regulations [2004Ed. p. N]") so they
    don't inflate similarity scores for every chunk in the document.
    """
    try:
        import pdfplumber
        with pdfplumber.open(str(path)) as pdf:
            # Collect all page texts first to detect repeating header/footer lines
            raw_pages: list[tuple[str, int]] = []
            for i, page in enumerate(pdf.pages, start=1):
                text = page.extract_text() or ""
                if text.strip():
                    raw_pages.append((text, i))

            if not raw_pages:
                return

            # Build a frequency map of individual lines across pages
            from collections import Counter
            line_freq: Counter = Counter()
            for text, _ in raw_pages:
                for line in text.splitlines():
                    stripped = line.strip()
                    if stripped:
                        line_freq[stripped] += 1

            # Lines appearing on >40% of pages are header/footer noise — remove them
            n_pages = len(raw_pages)
            noise_lines: set[str] = {
                line for line, count in line_freq.items()
                if count > max(2, n_pages * 0.4)
            }

            for text, page_num in raw_pages:
                clean_lines = [
                    ln for ln in text.splitlines()
                    if ln.strip() not in noise_lines
                ]
                clean_text = "\n".join(clean_lines).strip()
                clean_text = _strip_legal_headers(clean_text)
                if clean_text:
                    yield clean_text, page_num

    except Exception as exc:
        raise RuntimeError(f"Failed to read PDF {path.name}: {exc}") from exc


def _read_docx(path: Path) -> Iterator[tuple[str, int]]:
    """Yield (text, pseudo-page) for a DOCX file. DOCX has no real pages so
    we group every 40 paragraphs as a pseudo-page."""
    try:
        from docx import Document
        doc = Document(str(path))
        page_num = 1
        buffer: list[str] = []
        for i, para in enumerate(doc.paragraphs):
            text = para.text.strip()
            if text:
                buffer.append(text)
            if len(buffer) >= 40:
                yield "\n".join(buffer), page_num
                buffer = []
                page_num += 1
        if buffer:
            yield "\n".join(buffer), page_num
    except Exception as exc:
        raise RuntimeError(f"Failed to read DOCX {path.name}: {exc}") from exc


# ---------------------------------------------------------------------------
# Text splitting
# ---------------------------------------------------------------------------

def _strip_legal_headers(text: str) -> str:
    """Remove running headers/footers common in Singapore legal/regulatory PDFs.

    These headers repeat on every page with only the page number varying, so
    frequency-based detection misses them. Regex patterns are specific to the
    PUB documents bundled with this project.
    """
    # Remove lines matching known header/footer patterns (page number varies)
    patterns = [
        # "Public Utilities (Water Supply)" standalone line
        r"^Public Utilities \(Water Supply\)\s*$",
        # "CAP. 261, Rg 5] Regulations [2004Ed. p. 85"  (right-side header)
        r"^CAP\.\s*261,\s*Rg\s*5\]\s*Regulations\s*\[2004Ed\.\s*p\.\s*\d+\s*$",
        # "p. 14 2004Ed.] Regulations [CAP. 261, Rg 5"  (left-side header)
        r"^p\.\s*\d+\s*2004Ed\.\]\s*Regulations\s*\[CAP\.\s*261,\s*Rg\s*5\s*$",
        # "in force from DD/MM/YYYY" footer
        r"^in force from\s+\d+/\d+/\d+\s*$",
    ]
    combined = re.compile("|".join(patterns), re.MULTILINE | re.IGNORECASE)
    return combined.sub("", text).strip()


def _split_text(text: str, chunk_chars: int = 2000, overlap_chars: int = 200) -> list[str]:
    """Split text into overlapping chunks, preferring paragraph/sentence boundaries."""
    # Normalise whitespace
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    if not text:
        return []

    chunks: list[str] = []
    start = 0
    n = len(text)

    while start < n:
        end = min(start + chunk_chars, n)

        # Try to break at a paragraph boundary first
        if end < n:
            para_break = text.rfind("\n\n", start, end)
            if para_break > start + chunk_chars // 2:
                end = para_break
            else:
                # Fall back to sentence boundary
                sent_break = max(
                    text.rfind(". ", start, end),
                    text.rfind(".\n", start, end),
                )
                if sent_break > start + chunk_chars // 2:
                    end = sent_break + 1  # include the period

        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)

        if end >= n:
            break  # reached end of text — prevents 1-char sliding on short pages

        next_start = end - overlap_chars
        # If overlap would go backward (e.g. short sentence break), skip forward to end
        start = next_start if next_start > start else end

    return chunks


# ---------------------------------------------------------------------------
# Public ingest function
# ---------------------------------------------------------------------------

def ingest_folder(knowledge_dir: Path) -> dict[str, int]:
    """Ingest all PDFs and DOCX files in knowledge_dir into the vector store.

    Returns a summary dict: {filename: chunks_added}
    """
    from app.services.vector_store import add_chunks, clear_collection

    # Clear existing index before full re-ingest
    clear_collection()

    supported = {".pdf", ".docx"}
    files = [f for f in knowledge_dir.iterdir() if f.suffix.lower() in supported]

    if not files:
        return {}

    summary: dict[str, int] = {}

    for file_path in files:
        chunks_to_add: list[dict] = []
        suffix = file_path.suffix.lower()

        try:
            pages: Iterator[tuple[str, int]] = (
                _read_pdf(file_path) if suffix == ".pdf" else _read_docx(file_path)
            )
            for page_text, page_num in pages:
                text_chunks = _split_text(page_text)
                for chunk_idx, chunk_text in enumerate(text_chunks):
                    # Deterministic ID based on content hash
                    chunk_hash = hashlib.md5(
                        f"{file_path.name}:{page_num}:{chunk_idx}:{chunk_text[:50]}".encode()
                    ).hexdigest()[:12]
                    chunks_to_add.append({
                        "id":     f"{file_path.stem}_{chunk_hash}",
                        "text":   chunk_text,
                        "source": file_path.name,
                        "page":   page_num,
                    })
        except Exception as exc:
            summary[file_path.name] = -1
            print(f"[ingestion] Error processing {file_path.name}: {exc}")
            continue

        added = add_chunks(chunks_to_add)
        summary[file_path.name] = added
        print(f"[ingestion] {file_path.name}: {added} chunks ingested")

    return summary
