#!/bin/bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"

echo "[start.sh] Freeing ports 3201 and 5273..."
for p in 3201 5273; do
  for pid in $(lsof -ti:$p 2>/dev/null); do
    kill -9 "$pid" 2>/dev/null || true
  done
done

# Ensure database exists
echo "[start.sh] Ensuring 'aging_in_place' database..."
psql -U postgres -tc "SELECT 1 FROM pg_database WHERE datname = 'aging_in_place'" 2>/dev/null | grep -q 1 || \
  createdb -U postgres aging_in_place 2>/dev/null || true

echo "[start.sh] Starting backend (port 3001)..."
cd "$BACKEND"
nohup node server.js > /tmp/aging_backend.log 2>&1 &
echo $! > /tmp/aging_backend.pid

echo "[start.sh] Starting frontend (Vite, port 5273)..."
cd "$FRONTEND"
nohup npx vite --port 5273 --strictPort > /tmp/aging_frontend.log 2>&1 &
echo $! > /tmp/aging_frontend.pid

echo "[start.sh] Started. Backend log: /tmp/aging_backend.log  |  Frontend log: /tmp/aging_frontend.log"
echo "[start.sh] Backend PID $(cat /tmp/aging_backend.pid)  Frontend PID $(cat /tmp/aging_frontend.pid)"
