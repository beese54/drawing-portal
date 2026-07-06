from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import health, symbols, evaluate

app = FastAPI(title="Schematic Drawing Portal API", version=settings.app_version)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Belt-and-suspenders fallback: on the Airbase deployment, requests for symbol
# images (loaded via <img crossorigin> so Konva can rasterize them) have been
# observed missing Access-Control-Allow-Origin even with CORSMiddleware
# configured above — restored after a prior cleanup (commit d99ab4e) removed
# this and reintroduced the exact "blocked by CORS policy" failure it fixed.
@app.middleware("http")
async def force_cors(request: Request, call_next):
    response = await call_next(request)
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "*"
    return response

app.include_router(health.router, prefix="/api")
app.include_router(symbols.router, prefix="/api/symbols")
app.include_router(evaluate.router, prefix="/api")
