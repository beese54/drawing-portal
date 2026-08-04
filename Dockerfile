# ---- Frontend build stage ----
FROM node:20-alpine AS frontend-build
WORKDIR /fe
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci
COPY frontend/ .
# Vite bakes VITE_* vars into the JS bundle at build time. Left empty here on
# purpose: frontend/src/api/client.ts already falls back to relative paths
# ('/api/...') when unset, and combining into one image makes frontend and
# backend same-origin, so no per-environment backend URL is needed at all.
ARG VITE_API_BASE_URL=""
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
RUN npm run build

# ---- Backend + combined runtime stage ----
FROM python:3.12-slim
LABEL version="1"

WORKDIR /app

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/app/ ./app/
COPY backend/symbols/ ./symbols/
COPY --from=frontend-build /fe/dist/ ./static/

# The application has no secrets. SYMBOLS_ADMIN_KEY was removed with the
# symbol write API on 2026-08-04; nothing needs injecting at runtime.
ENV ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173

RUN groupadd --system app && useradd --system --gid app --home /app app \
    && chown -R app:app /app
USER app

EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=5 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')" || exit 1
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
