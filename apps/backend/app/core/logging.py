"""Structured JSON logging with mandatory sensitive-field redaction.

Reference:
- docs/03-api-specification.md (Section 17)
- docs/07-security-and-licensing.md (Section 15.2)
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Mapping, Set

REDACTED_VALUE = "[REDACTED]"
SENSITIVE_KEYS: Set[str] = {
    "password",
    "password_hash",
    "new_password",
    "current_password",
    "access_token",
    "refresh_token",
    "token",
    "token_hash",
    "activation_code",
    "enrollment_code",
    "authorization",
    "cookie",
    "set-cookie",
    "private_key",
    "deployment_private_key",
    "signing_key",
    "signed_payload",
    "secret",
    "jwt_secret_key",
    "card_number",
    "pan",
    "cvv",
    "pin",
}


def redact_dict(data: Mapping[str, Any]) -> Dict[str, Any]:
    """Recursively redact sensitive keys from dictionaries before logging or auditing."""
    sanitized: Dict[str, Any] = {}
    for key, value in data.items():
        lowered = str(key).lower().strip()
        if lowered in SENSITIVE_KEYS or any(
            s in lowered
            for s in ("password", "secret", "token", "private_key", "activation_code")
        ):
            sanitized[key] = REDACTED_VALUE
        elif isinstance(value, Mapping):
            sanitized[key] = redact_dict(value)
        elif isinstance(value, list):
            sanitized[key] = [
                redact_dict(item) if isinstance(item, Mapping) else item
                for item in value
            ]
        else:
            sanitized[key] = value
    return sanitized


class RedactedJsonFormatter(logging.Formatter):
    """Formats log records as single-line JSON with sensitive keys redacted."""

    def format(self, record: logging.LogRecord) -> str:
        log_entry: Dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        extra_context = getattr(record, "context", None)
        if isinstance(extra_context, Mapping):
            log_entry["context"] = redact_dict(extra_context)
        return json.dumps(log_entry, ensure_ascii=False)

