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

# Also sweep by command line for stray workers no longer bound to a port —
# see the note in start.sh about OneDrive sync + uvicorn --reload spawning
# zombie processes. Targeted to our specific uvicorn/vite invocations only.
powershell.exe -NoProfile -Command "
  Get-CimInstance Win32_Process -Filter \"Name='python.exe' or Name='python3.11.exe'\" -ErrorAction SilentlyContinue |
    Where-Object { \$_.CommandLine -like '*uvicorn*app.main*' } |
    ForEach-Object { Stop-Process -Id \$_.ProcessId -Force -ErrorAction SilentlyContinue }
  Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" -ErrorAction SilentlyContinue |
    Where-Object { \$_.CommandLine -like '*vite*' } |
    ForEach-Object { Stop-Process -Id \$_.ProcessId -Force -ErrorAction SilentlyContinue }
" 2>/dev/null || true

rm -f "$PROJECT_DIR/.pids"
echo "Done."
