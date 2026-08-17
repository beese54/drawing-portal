"""
export.py — POST /api/export/docx

Produces a Word (.docx) compliance report: one table, one row per individual
FAIL/WARN issue, with a cropped "focus" image of the flagged element/pipe
(blank if no crop was captured for that row) and the non-compliant clause
description.

The frontend already has the full evaluation result (from /api/evaluate) and
captures each row's crop itself, directly from the live Konva canvas at high
resolution — see EvaluationModal.tsx / issueCropRegions.ts. This endpoint is
deliberately dumb: it just assembles whatever rows + crops it's given into a
table. It does not re-run compliance checks or do any image processing, so
there's no risk of the row content drifting from what the officer saw on
screen, and nothing here is persisted server-side.
"""

from __future__ import annotations

import io
import json

from docx import Document
from docx.shared import Inches
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

from app.config import settings
from app.services.upload_validation import is_allowed_image

router = APIRouter()

# The same set /api/evaluate accepts. Crops are canvas captures produced by the
# frontend, which emits PNG.
ALLOWED_CROP_TYPES = {"image/jpeg", "image/png"}


@router.post("/export/docx")
async def export_docx(
    manifest_json: str = Form(...),
    crops: list[UploadFile] = File(default=[]),
) -> StreamingResponse:
    # Bounded before the parse — max_report_rows below bounds the row COUNT on
    # the already-parsed list, so it cannot bound the allocation json.loads
    # makes here. See config.max_manifest_chars.
    if len(manifest_json) > settings.max_manifest_chars:
        raise HTTPException(
            status_code=413,
            detail=f"manifest_json is over the {settings.max_manifest_chars // (1024 * 1024)}MB limit.",
        )

    try:
        rows: list[dict] = json.loads(manifest_json)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=422, detail=f"Invalid JSON in manifest_json: {e}")
    if not isinstance(rows, list):
        raise HTTPException(status_code=422, detail="manifest_json must be a JSON array.")
    if len(rows) > settings.max_report_rows:
        raise HTTPException(
            status_code=413,
            detail=f"manifest_json has {len(rows)} rows, over the {settings.max_report_rows} limit.",
        )

    if len(crops) > settings.max_crops:
        raise HTTPException(
            status_code=413,
            detail=f"{len(crops)} crops supplied, over the {settings.max_crops} limit.",
        )

    # Read one at a time against a running total rather than reading all of
    # them up front. Every crop stays in memory for the life of the request, so
    # the cumulative size is what bounds memory — a per-file cap would still
    # allow max_crops x per_file. See the security risk assessment (held outside this repo), R-03.
    crop_bytes: list[bytes] = []
    total = 0
    for f in crops:
        data = await f.read()
        if len(data) > settings.max_crop_bytes:
            raise HTTPException(
                status_code=413,
                detail=f"a crop is over the {settings.max_crop_bytes // (1024 * 1024)}MB per-file limit.",
            )
        total += len(data)
        if total > settings.max_total_crop_bytes:
            raise HTTPException(
                status_code=413,
                detail=(
                    f"crops exceed the {settings.max_total_crop_bytes // (1024 * 1024)}MB "
                    "combined limit."
                ),
            )
        # add_picture below parses each crop to determine its format and
        # dimensions, so unverified bytes reach an image parser in-process.
        # Checked on the signature rather than on Content-Type: that header is
        # supplied by the caller and is not evidence of anything. This endpoint
        # previously performed no type checking at all.
        if not is_allowed_image(data, ALLOWED_CROP_TYPES):
            raise HTTPException(status_code=422, detail="crops must be JPEG or PNG images.")
        crop_bytes.append(data)

    document = Document()
    document.add_heading("Compliance Evaluation — Non-Compliant Items", level=1)
    table = document.add_table(rows=1, cols=2)
    table.style = "Table Grid"
    header = table.rows[0].cells
    header[0].text = "Location"
    header[1].text = "Non-Compliant Clause"

    for row in rows:
        if not isinstance(row, dict):
            continue
        crop_index = row.get("crop_index")
        table_row = table.add_row()
        if isinstance(crop_index, int) and 0 <= crop_index < len(crop_bytes):
            try:
                run = table_row.cells[0].paragraphs[0].add_run()
                run.add_picture(io.BytesIO(crop_bytes[crop_index]), width=Inches(2.5))
            except Exception:
                # The signature check proves a crop STARTS like an image; it
                # does not prove the rest parses. python-docx raises on
                # truncated or corrupt data, and an uncaught raise here turned
                # one bad crop into a 500 for the whole report. A blank cell
                # loses one thumbnail; the alternative loses the document.
                pass
        status = row.get("status", "")
        check_title = row.get("check_title", "")
        check_id = row.get("check_id", "")
        text = row.get("text", "")
        table_row.cells[1].text = f"[{status}] {check_title} ({check_id}): {text}"

    if len(rows) == 0:
        table.add_row().cells[1].text = "No FAIL or WARN items — schematic passed all checks."

    buf = io.BytesIO()
    document.save(buf)
    buf.seek(0)

    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": "attachment; filename=compliance_report.docx"},
    )
