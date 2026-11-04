#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

"$SCRIPT_DIR/preflight.sh"
if [[ ! -f "$ROOT_DIR/.env" ]]; then
    echo "ERROR: $ROOT_DIR/.env not found. Copy .env.example to .env and configure secrets first." >&2
    exit 1
fi

echo "[install] Starting Private Server containers..."
docker compose -f "$ROOT_DIR/compose.yaml" up -d --build
echo "[install] Private Server installation complete."

