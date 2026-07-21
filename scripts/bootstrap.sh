#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd "$(dirname "$0")/.." && pwd)"
cd "$project_dir"
[[ -f .env ]] || cp .env.example .env
(cd backend && npm ci)
(cd frontend && npm ci)
echo "Dependencies installed. Configure .env, then run ./scripts/migrate.sh."

