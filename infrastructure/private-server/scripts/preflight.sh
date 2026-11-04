#!/usr/bin/env bash
set -euo pipefail

echo "[preflight] Checking Private Server host requirements..."
command -v docker >/dev/null 2>&1 || { echo "ERROR: docker is required." >&2; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "ERROR: docker compose v2+ is required." >&2; exit 1; }
echo "[preflight] OK: Docker & Docker Compose are installed."

