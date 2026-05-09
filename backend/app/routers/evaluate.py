"""
evaluate.py — POST /api/evaluate

Accepts a schematic metadata JSON + optional schematic JPG and runs:
    1. REG28   — backflow prevention check (check valve upstream of water heater)
    2. SEC221  — mode of supply based on height of highest fitting (Handbook 2.2.1)
    3. SEC721  — MWELS water efficiency rating compliance (Handbook 7.2.1)
    4. Hydraulic analysis — flow rates, velocities, pressures at all fittings
    5. LLM summary — brief professional summary via OpenAI / Qwen

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
    MWELS_DEMAND_LPS,
    DEFAULT_DEMAND_LPS,
    check_backflow_prevention,
    check_supply_mode,
    check_water_efficiency,
)
from app.agents.tank_pump_check import check_tank_pump_installation
from app.agents.long_bath_check import check_long_bath_installation
from app.agents.hydraulic_engine import (
    NetworkNode,
    NetworkPipe,
    solve_tree_network,
)
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
    hydraulic_report: dict
    annotated_image_b64: str | None = None
    llm_summary: str | None = None
    llm_usage: dict | None = None


# ---------------------------------------------------------------------------
# Hydraulic analysis helper
# ---------------------------------------------------------------------------

def _build_hydraulic_report(
    metadata: dict[str, Any],
    source_pressure_bar: float | None,
) -> dict[str, Any]:
    """
    Build a per-pipe and per-fitting hydraulic report from the schematic metadata.
    Uses per-pipe material/size from the metadata (falls back to copper 22mm).
    """
    elements: list[dict] = metadata.get("elements", [])
    pipes: list[dict] = metadata.get("pipes", [])
    hc: dict = metadata.get("hydraulic_context", {})

    if source_pressure_bar is None:
        return {
            "source_pressure_bar": None,
            "total_demand_lpm": 0.0,
            "pipes": [],
            "fittings": [],
            "note": "Source pressure not set — hydraulic analysis skipped. Set 'Source / Mains Pressure' in the Draw tab.",
        }

    has_tank = any(e.get("symbol_id") == "water_tank" for e in elements)
    has_pump = any(e.get("symbol_id") == "pump" for e in elements)
    if has_tank and has_pump:
        return {
            "source_pressure_bar": source_pressure_bar,
            "total_demand_lpm": 0.0,
            "pipes": [],
            "fittings": [],
            "note": (
                "Hydraulic analysis skipped — indirect supply system (water tank + pump detected). "
                "Pump sizing and tank capacity calculations are outside the scope of this tool."
            ),
        }

    elem_by_id = {e["id"]: e for e in elements}
    source_id = hc.get("source_element_id")

    # For direct-supply schematics there is no water_tank, so source_element_id
    # is null.  Fall back to the water_meter as the mains entry point.
    if not source_id:
        meter = next(
            (e for e in elements if e.get("symbol_id") == "water_meter"), None
        )
        if meter:
            source_id = meter["id"]

    # Build network nodes
    network_nodes: list[NetworkNode] = []
    for el in elements:
        el_id = el["id"]
        elevation = float(el.get("elevation_m", 0.0))
        node_type = el.get("node_type", "")
        fitting_type = el.get("fitting_type")

        if el_id == source_id:
            network_nodes.append(NetworkNode(
                id=el_id,
                elevation_m=elevation,
                fixed_pressure_bar=source_pressure_bar,
            ))
        elif node_type in ("outlet", "water_fittings", "water_fitting") or el.get("symbol_id") == "water_fittings":
            # Use MWELS-based demand for water fittings
            demand = MWELS_DEMAND_LPS.get(fitting_type, DEFAULT_DEMAND_LPS) if fitting_type else DEFAULT_DEMAND_LPS
            network_nodes.append(NetworkNode(
                id=el_id,
                elevation_m=elevation,
                demand_lps=demand,
            ))
        else:
            network_nodes.append(NetworkNode(
                id=el_id,
                elevation_m=elevation,
            ))

    # Build network pipes — use per-pipe properties where available
    network_pipes: list[NetworkPipe] = []
    pipe_meta: dict[str, dict] = {}   # for later reporting
    for pipe in pipes:
        from_id = pipe.get("flow_from_element_id") or pipe.get("start_connects_to")
        to_id = pipe.get("flow_to_element_id") or pipe.get("end_connects_to")
        if not from_id or not to_id:
            continue
        if from_id not in elem_by_id or to_id not in elem_by_id:
            continue

        length_m = pipe.get("length_m")
        if not length_m or length_m <= 0:
            # Fall back to pixel-based estimate
            length_m = max(pipe.get("length_px", 100.0) / 200.0, 0.5)

        material = pipe.get("material") or "copper"
        nominal_mm = pipe.get("nominal_size_mm") or 22

        # Determine fittings based on connected elements (approximate)
        fittings: dict[str, int] = {}
        for conn_id in [from_id, to_id]:
            el = elem_by_id.get(conn_id, {})
            sym = el.get("symbol_id", "")
            if sym == "elbow_bend":
                fittings["elbow_90"] = fittings.get("elbow_90", 0) + 1
            elif sym == "tee_junction":
                fittings["tee_junction"] = fittings.get("tee_junction", 0) + 1
            elif sym == "gate_valve":
                fittings["gate_valve"] = fittings.get("gate_valve", 0) + 1
            elif sym == "check_valve":
                fittings["check_valve"] = fittings.get("check_valve", 0) + 1

        network_pipes.append(NetworkPipe(
            id=pipe["id"],
            node_from=from_id,
            node_to=to_id,
            length_m=length_m,
            material=material,
            nominal_mm=nominal_mm,
            fittings=fittings,
        ))
        pipe_meta[pipe["id"]] = {
            "length_m": pipe.get("length_m"),
            "nominal_size_mm": pipe.get("nominal_size_mm"),
            "material": pipe.get("material"),
            "pipe_type": pipe.get("pipe_type", "cold"),
            "from_id": from_id,
            "to_id": to_id,
        }

    # Add virtual zero-length pipes for symbol-to-symbol port-touching connections.
    # These are connections where two symbols are placed port-to-port with no drawn pipe.
    # The frontend marks them ✓ (connected) but they are not captured in the pipes array.
    PORT_PROXIMITY_SQ = 5.0 ** 2  # px² — same threshold as compliance_checks.py
    virtual_pipe_counter = 0
    already_linked: set[frozenset] = set()
    # Collect pairs that are already linked by an explicit pipe
    for np in network_pipes:
        already_linked.add(frozenset([np.node_from, np.node_to]))

    for i, el_a in enumerate(elements):
        ports_a = el_a.get("ports", [])
        for el_b in elements[i + 1:]:
            if frozenset([el_a["id"], el_b["id"]]) in already_linked:
                continue
            ports_b = el_b.get("ports", [])
            linked = False
            for pa in ports_a:
                if linked:
                    break
                pos_a = pa.get("position", {})
                ax, ay = pos_a.get("canvas_x"), pos_a.get("canvas_y")
                if ax is None:
                    continue
                for pb in ports_b:
                    pos_b = pb.get("position", {})
                    bx, by = pos_b.get("canvas_x"), pos_b.get("canvas_y")
                    if bx is None:
                        continue
                    if (ax - bx) ** 2 + (ay - by) ** 2 <= PORT_PROXIMITY_SQ:
                        # Determine from/to: upstream port side is "from"
                        if pa.get("role") == "downstream":
                            from_id_v, to_id_v = el_a["id"], el_b["id"]
                        elif pb.get("role") == "downstream":
                            from_id_v, to_id_v = el_b["id"], el_a["id"]
                        else:
                            from_id_v, to_id_v = el_a["id"], el_b["id"]
                        virtual_pipe_counter += 1
                        vp_id = f"__virtual_{virtual_pipe_counter}"
                        # Minor losses for the virtual connection
                        vp_fittings: dict[str, int] = {}
                        for sym in [el_a.get("symbol_id", ""), el_b.get("symbol_id", "")]:
                            if sym == "gate_valve":
                                vp_fittings["gate_valve"] = vp_fittings.get("gate_valve", 0) + 1
                            elif sym == "check_valve":
                                vp_fittings["check_valve"] = vp_fittings.get("check_valve", 0) + 1
                            elif sym == "tee_junction":
                                vp_fittings["tee_junction"] = vp_fittings.get("tee_junction", 0) + 1
                        network_pipes.append(NetworkPipe(
                            id=vp_id,
                            node_from=from_id_v,
                            node_to=to_id_v,
                            length_m=0.1,   # negligible length
                            material="copper",
                            nominal_mm=22,
                            fittings=vp_fittings,
                        ))
                        already_linked.add(frozenset([el_a["id"], el_b["id"]]))
                        linked = True
                        break

    if not network_pipes or len(network_nodes) < 2:
        return {
            "source_pressure_bar": source_pressure_bar,
            "total_demand_lpm": 0.0,
            "pipes": [],
            "fittings": [],
            "note": "Insufficient pipe network for hydraulic analysis. Ensure pipes connect elements with flow direction set.",
        }

    # Check that source node was resolved and is part of the network
    node_ids = {n.id for n in network_nodes}
    if not source_id or source_id not in node_ids:
        return {
            "source_pressure_bar": source_pressure_bar,
            "total_demand_lpm": 0.0,
            "pipes": [],
            "fittings": [],
            "note": (
                "No pressure source found. "
                "For direct supply: add a Water Meter symbol and connect it to the supply pipe. "
                "For indirect supply: add a Water Tank symbol as the source. "
                "The hydraulic solver needs a fixed-pressure entry point."
            ),
        }

    try:
        result = solve_tree_network(network_pipes, network_nodes)
    except Exception as exc:
        return {
            "source_pressure_bar": source_pressure_bar,
            "total_demand_lpm": 0.0,
            "pipes": [],
            "fittings": [],
            "note": f"Hydraulic solver error: {exc}",
        }

    # Determine source elevation for orientation checks
    source_el_obj = next((el for el in elements if el["id"] == source_id), None)
    source_elevation_m: float = float(source_el_obj.get("elevation_m", 0.0)) if source_el_obj else 0.0

    solver_note = "Network solver converged." if result.converged else "Results approximate — solver did not converge (no fixed-pressure source found)."

    # Build per-pipe report
    pipe_rows = []
    for np in network_pipes:
        flow_lps = result.pipe_flows.get(np.id)
        velocity = result.node_velocities.get(np.id)
        from_p = result.node_pressures.get(np.node_from, 0.0)
        to_p = result.node_pressures.get(np.node_to, 0.0)
        friction_loss = round(max(from_p - to_p, 0.0), 4) if flow_lps is not None else None
        pm = pipe_meta.get(np.id, {})
        from_el = elem_by_id.get(pm.get("from_id", ""), {})
        to_el = elem_by_id.get(pm.get("to_id", ""), {})
        pipe_rows.append({
            "id": np.id,
            "from_element_name": from_el.get("symbol_name", "—"),
            "to_element_name": to_el.get("symbol_name", "—"),
            "pipe_type": pm.get("pipe_type", "cold"),
            "length_m": pm.get("length_m"),
            "nominal_size_mm": pm.get("nominal_size_mm"),
            "material": pm.get("material"),
            "flow_lpm": round(flow_lps * 60, 2) if flow_lps is not None else None,
            "velocity_ms": round(velocity, 3) if velocity is not None else None,
            "friction_loss_bar": friction_loss,
        })

    # Identify highest-elevation fitting before building rows
    fitting_elements = [
        e for e in elements
        if e.get("node_type") in ("water_fittings", "water_fitting", "outlet")
        or e.get("symbol_id") == "water_fittings"
    ]
    highest_fitting_id: str | None = None
    highest_elevation_m: float | None = None
    if fitting_elements:
        highest_el = max(fitting_elements, key=lambda e: float(e.get("elevation_m", 0.0)))
        highest_fitting_id = highest_el["id"]
        highest_elevation_m = float(highest_el.get("elevation_m", 0.0))

    # Build per-fitting report
    fitting_rows = []
    total_demand_lpm = 0.0
    disconnected_count = 0
    for el in fitting_elements:
        el_id = el["id"]
        fitting_type = el.get("fitting_type")
        ticks = el.get("efficiency_rating")
        demand_lps = MWELS_DEMAND_LPS.get(fitting_type, DEFAULT_DEMAND_LPS) if fitting_type else DEFAULT_DEMAND_LPS
        total_demand_lpm += demand_lps * 60

        connected = el_id in result.reached_node_ids
        if not connected:
            disconnected_count += 1
            fitting_rows.append({
                "id": el_id,
                "fitting_type": fitting_type or el.get("symbol_id", "outlet"),
                "ticks": ticks,
                "design_flow_lpm": round(demand_lps * 60, 2),
                "residual_pressure_bar": None,
                "elevation_m": float(el.get("elevation_m", 0.0)),
                "is_highest": el_id == highest_fitting_id,
                "disconnected": True,
            })
        else:
            residual = result.node_pressures.get(el_id, 0.0)
            # Cap unphysically high pressures (can't exceed source + max gravity head ~5 bar)
            physically_impossible = residual > source_pressure_bar + 5.0
            fitting_rows.append({
                "id": el_id,
                "fitting_type": fitting_type or el.get("symbol_id", "outlet"),
                "ticks": ticks,
                "design_flow_lpm": round(demand_lps * 60, 2),
                "residual_pressure_bar": None if physically_impossible else round(residual, 3),
                "elevation_m": float(el.get("elevation_m", 0.0)),
                "is_highest": el_id == highest_fitting_id,
                "disconnected": False,
                "calculation_error": physically_impossible,
            })

    # Build warning notes
    warnings: list[str] = []
    if disconnected_count:
        warnings.append(
            f"⚠ {disconnected_count} fitting(s) are not connected to the water supply source via continuous pipes "
            f"— residual pressure cannot be calculated. Connect all fittings back to the Water Meter with pipes."
        )
    connected_fittings = [f for f in fitting_rows if not f.get("disconnected") and not f.get("calculation_error")]
    overpressure = [f for f in connected_fittings if f["residual_pressure_bar"] is not None and f["residual_pressure_bar"] > source_pressure_bar + 0.05]
    if overpressure:
        warnings.append(
            f"⚠ {len(overpressure)} fitting(s) show residual pressure above the source pressure "
            f"({source_pressure_bar} bar) due to gravity head gain (fitting is below source elevation). "
            f"Source elevation: {source_elevation_m:.1f} m MRL. "
            f"For direct mains supply, the Water Meter should be placed at or below the lowest fitting."
        )
    calculation_errors = [f for f in fitting_rows if f.get("calculation_error")]
    if calculation_errors:
        warnings.append(
            f"❌ {len(calculation_errors)} fitting(s) produced unphysical pressure values "
            f"(> source pressure + 5 bar) — these have been suppressed. "
            "This indicates a disconnected or looped topology the solver cannot handle."
        )
    note = solver_note
    if warnings:
        note += " " + " ".join(warnings)

    # Aggregate pressure adequacy (threshold: 1.0 bar minimum at outlet)
    MIN_RESIDUAL_BAR = 1.0
    outlets_with_pressure = [f for f in fitting_rows if f["residual_pressure_bar"] is not None]
    outlets_adequate = [f for f in outlets_with_pressure if f["residual_pressure_bar"] >= MIN_RESIDUAL_BAR]
    outlets_total = len(fitting_rows)
    min_residual = min((f["residual_pressure_bar"] for f in outlets_with_pressure), default=None)
    max_residual = max((f["residual_pressure_bar"] for f in outlets_with_pressure), default=None)

    if outlets_total == 0:
        aggregate_status = "N/A"
    elif disconnected_count > 0 or calculation_errors:
        aggregate_status = "FAIL"
    elif len(outlets_adequate) == outlets_total:
        aggregate_status = "PASS"
    elif len(outlets_adequate) == 0:
        aggregate_status = "FAIL"
    else:
        aggregate_status = "WARN"

    # Pressure at the highest fitting (worst-case outlet)
    highest_fitting_pressure_bar: float | None = None
    highest_fitting_type: str | None = None
    if highest_fitting_id:
        highest_row = next((f for f in fitting_rows if f["id"] == highest_fitting_id), None)
        highest_fitting_pressure_bar = highest_row["residual_pressure_bar"] if highest_row else None
        highest_fitting_type = next(
            (f["fitting_type"] for f in fitting_rows if f["id"] == highest_fitting_id), None
        )

    return {
        "source_pressure_bar": source_pressure_bar,
        "source_elevation_m": round(source_elevation_m, 2),
        "total_demand_lpm": round(total_demand_lpm, 2),
        "pipes": pipe_rows,
        "fittings": fitting_rows,
        "note": note,
        "aggregate": {
            "status": aggregate_status,
            "outlets_total": outlets_total,
            "outlets_adequate": len(outlets_adequate),
            "min_residual_bar": round(min_residual, 3) if min_residual is not None else None,
            "max_residual_bar": round(max_residual, 3) if max_residual is not None else None,
            "highest_elevation_m": highest_elevation_m,
            "highest_fitting_type": highest_fitting_type,
            "highest_fitting_pressure_bar": highest_fitting_pressure_bar,
            "source_elevation_m": round(source_elevation_m, 2),
        },
    }


# ---------------------------------------------------------------------------
# LLM summary helper
# ---------------------------------------------------------------------------

async def _build_llm_summary(
    check1: CheckResult,
    check2: CheckResult,
    check3: CheckResult,
    hydraulic_note: str,
    provider: str = "openai",
) -> tuple[str | None, dict | None]:
    prompt = f"""You are a licensed professional engineer reviewing a water plumbing schematic for regulatory compliance in Singapore. Provide a concise 3–5 sentence professional summary of the findings below. Be specific, actionable, and reference the relevant regulation or handbook section.

Compliance Check Results:
1. {check1.title}: {check1.status} — {check1.summary}
2. {check2.title}: {check2.status} — {check2.summary}
3. {check3.title}: {check3.status} — {check3.summary}

Hydraulic Analysis Note: {hydraulic_note}

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
    Run all three compliance checks + hydraulic analysis on a schematic metadata JSON.
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
    source_pressure_bar: float | None = metadata.get("source_pressure_bar")

    # ── Run compliance checks ────────────────────────────────────────────────
    check1 = check_backflow_prevention(metadata)
    check2 = check_supply_mode(metadata)
    check3 = check_water_efficiency(metadata)
    check4 = check_tank_pump_installation(metadata)
    check5 = check_long_bath_installation(metadata)

    # ── Hydraulic analysis ───────────────────────────────────────────────────
    hydraulic_report = _build_hydraulic_report(metadata, source_pressure_bar)

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
            check1, check2, check3,
            hydraulic_note=hydraulic_report.get("note", ""),
            provider=provider,
        )

    return EvaluateResponse(
        check1_backflow=asdict(check1),
        check2_supply_mode=asdict(check2),
        check3_water_efficiency=asdict(check3),
        check4_tank_pump=asdict(check4),
        check5_long_bath=asdict(check5),
        hydraulic_report=hydraulic_report,
        annotated_image_b64=annotated_image_b64,
        llm_summary=llm_summary,
        llm_usage=llm_usage,
    )
