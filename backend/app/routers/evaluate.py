"""
evaluate.py — POST /api/evaluate

Accepts a schematic metadata JSON + optional schematic JPG and runs:
    1. REG28   — backflow prevention check (check valve upstream of water heater)
    2. SEC221  — mode of supply based on height of highest fitting (Handbook 2.2.1)
    3. SEC721  — MWELS water efficiency rating compliance (Handbook 7.2.1)
    4. LLM summary — brief professional summary via OpenAI / Qwen

Returns a structured JSON report rendered in the chat UI.
"""

from __future__ import annotations

import json
import math
import time
import traceback
from dataclasses import asdict
from typing import Any

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from app.agents.compliance_checks import (
    CheckResult,
    check_backflow_prevention,
    check_supply_mode,
    check_water_efficiency,
)
from app.agents.tank_pump_check import check_tank_pump_installation
from app.agents.long_bath_check import check_long_bath_installation
from app.agents.hot_water_contamination_check import check_hot_water_contamination
from app.agents.section3_pipe_check import check_section3_pipes
from app.agents.model_router import complete as llm_complete
from app.services.image_annotator import annotate_schematic

router = APIRouter()


# ---------------------------------------------------------------------------
# Response model
# ---------------------------------------------------------------------------

class EvaluateResponse(BaseModel):
    check1_backflow: dict
    check2_supply_mode: dict
    check3_water_efficiency: dict
    check4_tank_pump: dict
    check5_long_bath: dict
    check6_hot_water: dict
    check7_section3_pipes: dict
    annotated_image_b64: str | None = None
    llm_summary: str | None = None
    llm_usage: dict | None = None


# ---------------------------------------------------------------------------
# LLM summary helper
# ---------------------------------------------------------------------------

async def _build_llm_summary(
    check1: CheckResult,
    check2: CheckResult,
    check3: CheckResult,
    check4: CheckResult,
    check5: CheckResult,
    check6: CheckResult,
    check7: CheckResult,
    provider: str = "openai",
) -> tuple[str | None, dict | None]:
    prompt = f"""You are a licensed professional engineer reviewing a water plumbing schematic for regulatory compliance in Singapore. Provide a concise 3–5 sentence professional summary of the findings below. Be specific, actionable, and reference the relevant regulation or handbook section.

Compliance Check Results:
1. {check1.title}: {check1.status} — {check1.summary}
2. {check2.title}: {check2.status} — {check2.summary}
3. {check3.title}: {check3.status} — {check3.summary}
4. {check4.title}: {check4.status} — {check4.summary}
5. {check5.title}: {check5.status} — {check5.summary}
6. {check6.title}: {check6.status} — {check6.summary}
7. {check7.title}: {check7.status} — {check7.summary}

Write the summary now:"""

    try:
        from app.services.metrics_tracker import calculate_cost
        t0 = time.perf_counter()
        response = await llm_complete(
            provider=provider,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=300,
        )
        latency_ms = (time.perf_counter() - t0) * 1000
        cost = calculate_cost(response.model, response.input_tokens, response.output_tokens)
        usage = {
            "model": response.model,
            "provider": response.provider,
            "input_tokens": response.input_tokens,
            "output_tokens": response.output_tokens,
            "cost_usd": round(cost, 6),
            "latency_ms": round(latency_ms, 1),
        }
        return response.content.strip(), usage
    except Exception as exc:
        traceback.print_exc()
        return None, {"error": str(exc), "provider": provider}


# ---------------------------------------------------------------------------
# Main endpoint
# ---------------------------------------------------------------------------

@router.post("/evaluate", response_model=EvaluateResponse)
async def evaluate_schematic(
    metadata_json: str = Form(...),
    schematic_image: UploadFile | None = File(default=None),
    provider: str = Form(default="openai"),
    skip_llm: bool = Form(default=False),
) -> EvaluateResponse:
    """
    Run all compliance checks on a schematic metadata JSON.
    Optionally annotate the uploaded schematic JPG with element markers.
    """
    # Parse metadata
    try:
        metadata = json.loads(metadata_json)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=422, detail=f"Invalid JSON in metadata_json: {e}")

    elements: list[dict] = metadata.get("elements", [])
    canvas: dict = metadata.get("canvas", {})
    canvas_w = int(canvas.get("width_px", 1200))
    canvas_h = int(canvas.get("height_px", 800))

    # ── Run compliance checks ────────────────────────────────────────────────
    check1 = check_backflow_prevention(metadata)
    check2 = check_supply_mode(metadata)
    check3 = check_water_efficiency(metadata)
    check4 = check_tank_pump_installation(metadata)
    check5 = check_long_bath_installation(metadata)
    check6 = check_hot_water_contamination(metadata)
    check7 = check_section3_pipes(metadata)

    # ── Image annotation ─────────────────────────────────────────────────────
    annotated_image_b64: str | None = None

    if schematic_image is not None and check1.elements_of_interest:
        try:
            image_bytes = await schematic_image.read()

            # Resolve canvas coordinates for each element of interest
            elem_by_id = {e["id"]: e for e in elements}
            annotated_elements: list[dict] = []
            for item in check1.elements_of_interest:
                el = elem_by_id.get(item["element_id"])
                if el:
                    pos = el.get("position", {})
                    annotated_elements.append({
                        "canvas_x": pos.get("canvas_x", 0),
                        "canvas_y": pos.get("canvas_y", 0),
                        "label": item["label"],
                        "color": item["color"],
                    })

            if annotated_elements:
                annotated_image_b64 = annotate_schematic(
                    image_bytes=image_bytes,
                    annotated_elements=annotated_elements,
                    canvas_width=canvas_w,
                    canvas_height=canvas_h,
                )
        except Exception:
            # Annotation failure is non-fatal — log and continue
            traceback.print_exc()

    # ── LLM summary ──────────────────────────────────────────────────────────
    if skip_llm:
        llm_summary, llm_usage = None, None
    else:
        llm_summary, llm_usage = await _build_llm_summary(
            check1, check2, check3, check4, check5, check6, check7,
            provider=provider,
        )

    return EvaluateResponse(
        check1_backflow=asdict(check1),
        check2_supply_mode=asdict(check2),
        check3_water_efficiency=asdict(check3),
        check4_tank_pump=asdict(check4),
        check5_long_bath=asdict(check5),
        check6_hot_water=asdict(check6),
        check7_section3_pipes=asdict(check7),
        annotated_image_b64=annotated_image_b64,
        llm_summary=llm_summary,
        llm_usage=llm_usage,
    )
