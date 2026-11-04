#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/pos-platform}"
mkdir -p "$BACKUP_DIR"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_FILE="$BACKUP_DIR/pos_business_${TIMESTAMP}.sql.gz"

echo "[backup] Creating PostgreSQL logical backup at $OUT_FILE..."
docker compose exec -T postgres pg_dump -U "${POSTGRES_USER:-business_app}" "${POSTGRES_DB:-pos_business}" | gzip > "$OUT_FILE"
sha256sum "$OUT_FILE" > "${OUT_FILE}.sha256"
echo "[backup] Completed: $OUT_FILE"

