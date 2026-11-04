"""Canonical license payload and signed envelope schemas.

Reference:
- docs/04-cloud-control-plane.md (Section 13)
- docs/07-security-and-licensing.md (Section 10, 11)
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Dict, List, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator


class LicenseValidationError(Exception):
    """Raised when a license envelope fails cryptographic or policy validation."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


class LicenseLimits(BaseModel):
    """Enforceable resource limits embedded in the signed entitlement."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    max_stores: int = Field(ge=1)
    max_devices: int = Field(ge=1)
    max_users: Optional[int] = Field(default=None, ge=1)


class GracePolicy(BaseModel):
    """Configurable connectivity and expiration grace policy."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    policy_id: str = "grace-standard-01"
    heartbeat_interval_seconds: int = 300
    refresh_interval_seconds: int = 21600
    warning_after_offline_hours: int = 24
    escalated_warning_after_offline_hours: int = 72
    cached_entitlement_grace_days: int = 7
    expiry_warning_days: int = 14


class LicensePayload(BaseModel):
    """Immutable entitlement snapshot signed by the Cloud Control Plane."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    schema_version: Literal[1] = 1
    license_id: str
    customer_id: str
    deployment_id: str
    organization_id: str
    edition: str
    features: List[str]
    limits: LicenseLimits
    sequence: int = Field(ge=1)
    issued_at: str
    not_before: str
    expires_at: str
    grace_policy_id: str = "grace-standard-01"
    key_id: str

    @field_validator("issued_at", "not_before", "expires_at")
    @classmethod
    def validate_iso_utc(cls, value: str) -> str:
        dt = parse_rfc3339_utc(value)
        return format_rfc3339_utc(dt)

    def canonical_bytes(self) -> bytes:
        """Return deterministic UTF-8 JSON bytes with sorted keys and no whitespace."""
        payload_dict = self.model_dump(mode="json")
        # Sort features deterministically so canonical form is invariant
        payload_dict["features"] = sorted(set(payload_dict["features"]))
        return json.dumps(
            payload_dict,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
        ).encode("utf-8")


class SignedLicenseEnvelope(BaseModel):
    """Detached/embedded Ed25519 signed envelope."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    algorithm: Literal["Ed25519"] = "Ed25519"
    key_id: str
    payload: LicensePayload
    canonical_payload_b64: str
    signature_b64: str


class LicenseEvaluationResult(BaseModel):
    """Structured local evaluation outcome for a Private Server."""

    model_config = ConfigDict(extra="forbid")

    valid: bool
    state: Literal[
        "active",
        "expiring",
        "warning_offline",
        "escalated_offline",
        "grace_period",
        "expired_restricted",
        "revoked",
    ]
    allow_pos_sales: bool
    allow_new_device_activation: bool
    allow_new_store_provisioning: bool
    warnings: List[str] = Field(default_factory=list)
    payload: LicensePayload
    evaluated_at: datetime


def parse_rfc3339_utc(value: str) -> datetime:
    """Parse an ISO-8601 / RFC-3339 string and normalize to UTC."""
    normalized = value.strip()
    if normalized.endswith("Z"):
        normalized = normalized[:-1] + "+00:00"
    dt = datetime.fromisoformat(normalized)
    if dt.tzinfo is None:
        raise ValueError("Timestamp must include timezone offset")
    return dt.astimezone(timezone.utc)


def format_rfc3339_utc(dt: datetime) -> str:
    """Format a datetime as canonical UTC ISO-8601 string with Z suffix."""
    utc_dt = dt.astimezone(timezone.utc)
    return utc_dt.strftime("%Y-%m-%dT%H:%M:%SZ")

