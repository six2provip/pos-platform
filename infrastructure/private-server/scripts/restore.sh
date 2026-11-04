#!/usr/bin/env bash
set -euo pipefail

ARCHIVE_FILE="${1:-}"
if [[ -z "$ARCHIVE_FILE" || ! -f "$ARCHIVE_FILE" ]]; then
    echo "Usage: $0 <backup-archive.sql.gz>" >&2
    exit 1
fi

if [[ -f "${ARCHIVE_FILE}.sha256" ]]; then
    echo "[restore] Verifying SHA-256 checksum..."
    sha256sum -c "${ARCHIVE_FILE}.sha256"
fi

echo "[restore] Restoring database from $ARCHIVE_FILE..."
gunzip -c "$ARCHIVE_FILE" | docker compose exec -T postgres psql -U "${POSTGRES_USER:-business_app}" -d "${POSTGRES_DB:-pos_business}"
echo "[restore] Restore completed."

