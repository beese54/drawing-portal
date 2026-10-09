"""
metadata_schema.py — Type contract for the metadata_json document that
POST /api/evaluate accepts.

The compliance checks index, hash, compare and do arithmetic on nested fields
with no type guards of their own, so a valid JSON document with a wrong nested
type (a list where an id belongs, text where a number belongs) reached them and
raised a 500. Fuzzing found 31 distinct crash sites on 2026-10-09 (see
tests/test_fuzz_inputs.py). This module refuses those documents up front so the
endpoint answers 422 instead.

Design choices:
- VALIDATE ONLY. The caller keeps using the original dict; this model is never
  used to rebuild it. strict=True makes that safe: nothing is coerced (no "12"
  becoming 12.0), so a document that validates is exactly the document the
  checks receive.
- extra="allow". metadataBuilder.ts sends many fields no check reads (pipe
  geometry, port indexes, title block, stamps). Only fields a check READS are
  typed here; everything else passes through untouched.
- Optional vs defaulted. `X | None` where a check tolerates null. A plain type
  with a default where a check would crash on null (it calls .get() or iterates
  the value), so an absent key is fine but an explicit null is refused.
- Numbers are bounded and finite. graph_utils squares coordinate differences,
  which raises OverflowError on huge values, and json.loads accepts NaN and
  Infinity literals. No real schematic comes near +/-1e9.
"""

from __future__ import annotations

from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field

Num = Annotated[float, Field(ge=-1e9, le=1e9, allow_inf_nan=False)]
Id = Annotated[str, Field(min_length=1)]


class _Model(BaseModel):
    model_config = ConfigDict(strict=True, extra="allow")


class Position(_Model):
    canvas_x: Num | None = None
    canvas_y: Num | None = None


class Port(_Model):
    position: Position = Position()
    connects_to_element_id: str | None = None
    label: str | None = None
    supply_mode: str | None = None


class TankProperties(_Model):
    material: str | None = None
    overflow_pipe_diameter_m: Num | None = None
    inlet_pipe_diameter_m: Num | None = None
    overflow_pipe_m_amsl: Num | None = None
    warning_pipe_m_amsl: Num | None = None
    inlet_pipe_m_amsl: Num | None = None
    outlet_pipe_diameter_m: Num | None = None
    distance_outlet_to_base_m: Num | None = None
    is_sunken_tank: bool | None = None
    occupants: Num | None = None
    effective_capacity_l: Num | None = None
    daily_demand_m3: Num | None = None


class Element(_Model):
    id: Id
    symbol_id: str = ""
    symbol_name: str | None = None
    node_type: str | None = None
    supply_mode: str | None = None
    backflow_requirement: str | None = None
    fitting_type: str | None = None
    efficiency_rating: Num | None = None
    elevation_m: Num | None = None
    highest_fitting_elevation_m: Num | None = None
    pump_rated_head_m: Num | None = None
    long_bath_capacity_l: Num | None = None
    position: Position | None = None
    ports: list[Port] = []
    connected_pipe_ids: list[Id] = []
    tank_properties: TankProperties | None = None


class Pipe(_Model):
    id: Id
    flow_from_element_id: str | None = None
    flow_to_element_id: str | None = None
    start_connects_to: str | None = None
    end_connects_to: str | None = None
    supply_mode: str | None = None


class Metadata(_Model):
    elements: list[Element] = []
    pipes: list[Pipe] = []
