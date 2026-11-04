#!/usr/bin/env bash
set -euo pipefail

API_URL="${PUBLIC_BASE_URL:-http://127.0.0.1:8000}"
echo "[healthcheck] Probing $API_URL/health/live and $API_URL/health/ready..."
curl -fsS "$API_URL/health/live" >/dev/null
curl -fsS "$API_URL/health/ready" >/dev/null
echo "[healthcheck] OK: Private Server is alive and ready."

