#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd "$(dirname "$0")/.." && pwd)"
cd "$project_dir"
if [[ "${CONFIRM_DESTRUCTIVE_DEMO_SEED:-}" != "yes" ]]; then
  echo "Refusing demo seed. Set CONFIRM_DESTRUCTIVE_DEMO_SEED=yes; this may replace existing data." >&2
  exit 1
fi
[[ -f .env ]] || { echo "Missing .env" >&2; exit 1; }
set -a
source .env
set +a
echo 'No demo seed is defined for this project.'

