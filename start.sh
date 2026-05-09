#!/usr/bin/env bash
# start.sh — start backend + frontend dev servers

set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"

# ── Kill any stale processes on our ports ───────────────────────────────────
echo "Clearing ports 8000 and 5173..."
for PORT in 8000 5173; do
  PIDS=$(powershell.exe -Command "
    (Get-NetTCPConnection -LocalPort $PORT -ErrorAction SilentlyContinue).OwningProcess |
    Where-Object { \$_ -match '^\d+$' }
  " 2>/dev/null | tr -d '\r')
  if [ -n "$PIDS" ]; then
    for PID in $PIDS; do
      powershell.exe -Command "Stop-Process -Id $PID -Force -ErrorAction SilentlyContinue" 2>/dev/null
    done
    echo "  Killed processes on port $PORT"
  fi
done
sleep 1

# ── Start backend ────────────────────────────────────────────────────────────
echo "Starting backend on http://localhost:8000 ..."
cd "$BACKEND_DIR"
python -m uvicorn app.main:app --reload --port 8000 > "$PROJECT_DIR/backend.log" 2>&1 &
BACKEND_PID=$!

# Wait for backend to be ready
for i in $(seq 1 15); do
  if curl -s http://localhost:8000/api/health > /dev/null 2>&1; then
    echo "  Backend ready."
    break
  fi
  sleep 1
done

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
