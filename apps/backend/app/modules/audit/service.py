"""Append-only business and security audit recording service.

Reference:
- docs/02-database-schema.md (Section 7.9)
- docs/07-security-and-licensing.md (Section 15.1, 15.2)
"""

from __future__ import annotations

from typing import Any, Dict, Optional
from sqlalchemy.orm import Session

from app.core.logging import redact_dict
from app.infrastructure.models import AuditLog


def record_audit_event(
    db: Session,
    *,
    action: str,
    entity_type: str,
    actor_type: str = "user",
    actor_id: Optional[str] = None,
    organization_id: Optional[str] = None,
    store_id: Optional[str] = None,
    entity_id: Optional[str] = None,
    request_id: Optional[str] = None,
    source_ip: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> AuditLog:
    """Insert an append-only audit log entry with automatic secret redaction."""
    safe_metadata = redact_dict(metadata or {})
    entry = AuditLog(
        organization_id=organization_id,
        store_id=store_id,
        actor_type=actor_type,
        actor_id=actor_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        request_id=request_id,
        source_ip=source_ip,
        audit_metadata=safe_metadata,
    )
    db.add(entry)
    return entry

