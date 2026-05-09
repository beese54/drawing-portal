from pydantic import BaseModel
from typing import Literal
from datetime import datetime


class SymbolMeta(BaseModel):
    id: str
    name: str
    category: Literal["default", "custom", "fixtures", "valves", "equipment"]
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
    category: Literal["default", "custom", "fixtures", "valves", "equipment"]
    url: str
