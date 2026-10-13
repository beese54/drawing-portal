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
# Alpine, not Debian slim (1.1.1): measured with GitLab's container scanner on
# 2026-10-12, python:3.12-slim carried 166 OS-package CVEs (44 High, 2
# fixable) and python:3.12-alpine carried 1. Every backend dependency ships a
# musllinux wheel, so nothing is compiled here.
# Pinned by digest so a build is reproducible; Dependabot proposes the bumps.
FROM python:3.12-alpine@sha256:1b668429b3511ab407d8e00648891631b0b1a4d7e15e3ca70f38ab5b91ad4ab4

# Take Alpine's security fixes released since the base image was published.
# The image digest still records exactly what shipped.
RUN apk upgrade --no-cache

WORKDIR /app

COPY backend/requirements.txt .
# pip is a build tool: once the dependencies are in, the app never calls it.
# Removing it drops 6 CVEs the base image's pip 25.0.1 carried (found
# 2026-10-13 by scanning installed Python packages, not just requirements.txt).
RUN pip install --no-cache-dir -r requirements.txt \
    && pip uninstall --yes pip

COPY backend/app/ ./app/
COPY backend/symbols/ ./symbols/
COPY --from=frontend-build /fe/dist/ ./static/

# The application has no secrets. SYMBOLS_ADMIN_KEY was removed with the
# symbol write API on 2026-08-04; nothing needs injecting at runtime.
# ALLOWED_ORIGINS is deliberately unset: no cross-origin access (1.1.2, F3).

# The code stays owned by root: the app user can read and run it but not
# change it, so a code-execution bug cannot plant a backdoor in the app itself
# (before 1.1.2 `chown -R app:app /app` let it). Bytecode is compiled here,
# because the app could otherwise not write its own __pycache__ (and never
# needs to: PYTHONDONTWRITEBYTECODE). At runtime the app writes only to /tmp
# (Starlette spools uploads over 1 MB there), which is writable as usual.
RUN python -m compileall -q /app/app
ENV PYTHONDONTWRITEBYTECODE=1

# busybox equivalents of groupadd/useradd --system: a system user with no
# password and no new home directory (/app already exists).
RUN addgroup -S app && adduser -S -D -H -h /app -G app app

# Which build this is, reported by /api/health. docker-publish.yml passes the
# release version (or "latest" for a main push) and the full commit SHA. Kept
# this late so a new version only rebuilds this layer, not the pip install.
ARG APP_VERSION=dev
ARG GIT_COMMIT=unknown
ENV APP_VERSION=${APP_VERSION} GIT_COMMIT=${GIT_COMMIT}
USER app

EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=5 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')" || exit 1
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
