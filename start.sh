#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "$0")" && pwd)"
cd "$project_dir"

if [[ ! -f .env ]]; then
  echo "Missing .env; copy .env.example and configure it." >&2
  exit 1
fi
set -a
source .env
set +a

if [[ ! -d backend/node_modules || ! -d frontend/node_modules ]]; then
  echo "Dependencies are missing; run ./scripts/bootstrap.sh explicitly." >&2
  exit 1
fi

: "${BACKEND_PORT:?BACKEND_PORT is required}"
: "${FRONTEND_PORT:?FRONTEND_PORT is required}"
[[ "$BACKEND_PORT" != "$FRONTEND_PORT" ]] || { echo "BACKEND_PORT and FRONTEND_PORT must differ." >&2; exit 1; }
for runtime_port in "$BACKEND_PORT" "$FRONTEND_PORT"; do
  if lsof -nP -iTCP:"$runtime_port" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Port $runtime_port is already in use; no process was changed." >&2
    exit 1
  fi
done

(cd backend && PORT="$BACKEND_PORT" npm start) &
backend_pid=$!
(cd frontend && npm run dev -- --host 127.0.0.1 --port "$FRONTEND_PORT" --strictPort) &
frontend_pid=$!

cleanup() {
  kill "$backend_pid" "$frontend_pid" 2>/dev/null || true
}
trap cleanup INT TERM EXIT
while kill -0 "$backend_pid" 2>/dev/null && kill -0 "$frontend_pid" 2>/dev/null; do
  sleep 1
done
cleanup
set +e
wait "$backend_pid"; backend_status=$?
wait "$frontend_pid"; frontend_status=$?
set -e
if (( backend_status != 0 || frontend_status != 0 )); then
  echo "A child service exited unexpectedly (backend=$backend_status frontend=$frontend_status)." >&2
  exit 1
fi
