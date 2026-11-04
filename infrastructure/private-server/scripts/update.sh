#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"$SCRIPT_DIR/backup.sh"
echo "[update] Pulling and applying updated container images..."
docker compose up -d --build
"$SCRIPT_DIR/healthcheck.sh"
echo "[update] Upgrade completed."

