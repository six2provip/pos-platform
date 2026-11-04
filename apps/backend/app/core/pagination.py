"""Opaque tenant-bound cursor pagination utilities.

Reference:
- docs/03-api-specification.md (Section 5.6, 8.2)
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
from typing import Any, Dict

from app.core.exceptions import ValidationAppError


def encode_cursor(
    secret_key: str,
    organization_id: str,
    stream: str,
    payload: Dict[str, Any],
) -> str:
    """Create an opaque HMAC-protected cursor bound to organization_id and stream."""
    envelope = {
        "org": organization_id,
        "stream": stream,
        "p": payload,
    }
    raw_bytes = json.dumps(envelope, sort_keys=True, separators=(",", ":")).encode("utf-8")
    sig = hmac.new(secret_key.encode("utf-8"), raw_bytes, hashlib.sha256).hexdigest()[:24]
    token = base64.urlsafe_b64encode(raw_bytes).decode("ascii").rstrip("=")
    return f"{token}.{sig}"


def decode_cursor(
    cursor: str,
    secret_key: str,
    expected_organization_id: str,
    expected_stream: str,
) -> Dict[str, Any]:
    """Verify and decode an opaque cursor, rejecting cross-tenant or cross-stream reuse."""
    try:
        if "." not in cursor:
            raise ValueError("Missing signature delimiter")
        token, provided_sig = cursor.rsplit(".", 1)
        padding = "=" * (-len(token) % 4)
        raw_bytes = base64.urlsafe_b64decode(token + padding)
        expected_sig = hmac.new(
            secret_key.encode("utf-8"), raw_bytes, hashlib.sha256
        ).hexdigest()[:24]
        if not hmac.compare_digest(provided_sig, expected_sig):
            raise ValueError("Invalid cursor signature")
        envelope = json.loads(raw_bytes.decode("utf-8"))
    except Exception as exc:
        raise ValidationAppError(
            code="INVALID_CURSOR",
            message="The provided pagination or synchronization cursor is invalid.",
        ) from exc

    if envelope.get("org") != expected_organization_id or envelope.get("stream") != expected_stream:
        raise ValidationAppError(
            code="CURSOR_SCOPE_MISMATCH",
            message="Cursor does not belong to the current organization or stream.",
        )

    return dict(envelope.get("p", {}))

