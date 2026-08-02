#!/bin/bash
set -e

# Airbase injects $PORT at runtime; 3000 is the local-testing default and must
# match the "port" value in airbase.json.
APP_PORT=${PORT:-3000}

# Activate the venv so uvicorn and its dependencies are on PATH.
. /app/venv/bin/activate

# One process serves both /api/* and the React SPA. main.py mounts the SPA at /
# only when STATIC_PATH exists, and mounts it last so it can never shadow
# /api/*, /docs or /openapi.json.
cd /app/backend
exec uvicorn app.main:app --host 0.0.0.0 --port "${APP_PORT}"
