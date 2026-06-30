from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import health, symbols, evaluate

app = FastAPI(title="Schematic Drawing Portal API", version=settings.app_version)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins_list,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api")
app.include_router(symbols.router, prefix="/api/symbols")
app.include_router(evaluate.router, prefix="/api")
