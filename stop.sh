#!/usr/bin/env bash
# stop.sh — stop backend + frontend dev servers

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Stopping dev servers..."

for PORT in 8000 5173; do
  PIDS=$(powershell.exe -Command "
    (Get-NetTCPConnection -LocalPort $PORT -ErrorAction SilentlyContinue).OwningProcess |
    Where-Object { \$_ -match '^\d+$' }
  " 2>/dev/null | tr -d '\r')
  if [ -n "$PIDS" ]; then
    for PID in $PIDS; do
      powershell.exe -Command "Stop-Process -Id $PID -Force -ErrorAction SilentlyContinue" 2>/dev/null
    done
    echo "  Stopped port $PORT"
  fi
done

rm -f "$PROJECT_DIR/.pids"
echo "Done."
