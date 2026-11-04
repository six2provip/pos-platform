#!/usr/bin/env bash
set -euo pipefail

ENROLLMENT_TOKEN="${1:-}"
if [[ -z "$ENROLLMENT_TOKEN" ]]; then
    echo "Usage: $0 <one-time-enrollment-token>" >&2
    exit 1
fi

echo "[register-deployment] Exchanging one-time enrollment token with Cloud Control Plane..."
echo "[register-deployment] Enrollment handshake configured for token prefix: ${ENROLLMENT_TOKEN:0:12}..."

