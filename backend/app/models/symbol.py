from pydantic import BaseModel
from typing import Literal
from datetime import datetime


class SymbolMeta(BaseModel):
    id: str
    name: str
    category: Literal["default", "custom", "water_supply", "backflow_prevention", "pumps", "tanks", "sanitary"]
    filename: str
    url: str
    created_at: datetime


class SymbolList(BaseModel):
    symbols: list[SymbolMeta]


class SymbolRenameRequest(BaseModel):
    name: str


class SymbolCreateResponse(BaseModel):
    id: str
    name: str
    category: Literal["default", "custom", "water_supply", "backflow_prevention", "pumps", "tanks", "sanitary"]
    url: str
