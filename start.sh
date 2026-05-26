#!/usr/bin/env bash
# start.sh — start backend + frontend dev servers

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"

# ── Kill any stale processes on our ports ───────────────────────────────────
echo "Clearing ports 8000 and 5173..."
for PORT in 8000 5173; do
  PIDS=$(powershell.exe -Command "
    (Get-NetTCPConnection -LocalPort $PORT -ErrorAction SilentlyContinue).OwningProcess |
    Where-Object { \$_ -match '^\d+$' }
  " 2>/dev/null | tr -d '\r') || true
  if [ -n "$PIDS" ]; then
    for PID in $PIDS; do
      powershell.exe -Command "Stop-Process -Id $PID -Force -ErrorAction SilentlyContinue" 2>/dev/null || true
    done
    echo "  Killed processes on port $PORT"
  fi
done
sleep 1

# ── Start backend ────────────────────────────────────────────────────────────
echo "Starting backend on http://localhost:8000 ..."
cd "$BACKEND_DIR"

# Use venv python if available, otherwise fall back to system python
if [ -f ".venv/Scripts/python.exe" ]; then
  PYTHON=".venv/Scripts/python.exe"
elif [ -f ".venv/bin/python" ]; then
  PYTHON=".venv/bin/python"
else
  PYTHON="python"
fi

find "$BACKEND_DIR" -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
PYTHONDONTWRITEBYTECODE=1 "$PYTHON" -m uvicorn app.main:app --reload --port 8000 > "$PROJECT_DIR/backend.log" 2>&1 &
BACKEND_PID=$!

# Wait for backend to be ready
echo -n "  Waiting for backend"
for i in $(seq 1 20); do
  if curl -s http://localhost:8000/api/health > /dev/null 2>&1; then
    echo " ready."
    break
  fi
  echo -n "."
  sleep 1
done

# Check backend actually started
if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
  echo ""
  echo "ERROR: Backend failed to start. Last log:"
  tail -20 "$PROJECT_DIR/backend.log"
  exit 1
fi

# ── Start frontend ───────────────────────────────────────────────────────────
echo "Starting frontend on http://localhost:5173 ..."
cd "$FRONTEND_DIR"
npm run dev -- --port 5173 > "$PROJECT_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!

echo ""
echo "  Backend:  http://localhost:8000"
echo "  Frontend: http://localhost:5173"
echo ""
echo "Logs: backend.log / frontend.log"
echo "To stop: ./stop.sh"

# Save PIDs for stop.sh
echo "$BACKEND_PID $FRONTEND_PID" > "$PROJECT_DIR/.pids"

wait
