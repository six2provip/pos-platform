#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "[decommission] Taking final backup before decommissioning Private Server..."
"$SCRIPT_DIR/backup.sh" || true
echo "[decommission] Stopping Private Server containers..."
docker compose down
echo "[decommission] Decommission complete."

