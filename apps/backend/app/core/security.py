"""Cryptographic utilities for passwords, JWTs, opaque tokens, and idempotency hashing.

Reference:
- docs/03-api-specification.md (Section 4, 13)
- docs/06-pos-offline-sync.md (Section 9.4)
- docs/07-security-and-licensing.md (Section 6, 8, 10)
"""

from __future__ import annotations

import hashlib
import hmac
import json
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Literal, Optional
import bcrypt
import jwt

from app.core.config import Settings
from app.core.exceptions import UnauthorizedError


def hash_password(password: str) -> str:
    """Hash a plaintext password using bcrypt with per-password random salt."""
    if not password or len(password) < 8:
        raise ValueError("Password must be at least 8 characters long")
    hashed = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12))
    return hashed.decode("utf-8")


def verify_password(plain_password: str, password_hash: str) -> bool:
    """Constant-time verification of a plaintext password against its stored hash."""
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"), password_hash.encode("utf-8")
        )
    except Exception:
        return False


def generate_opaque_secret(prefix: str = "tok", num_bytes: int = 32) -> str:
    """Generate a high-entropy URL-safe opaque secret."""
    return f"{prefix}_{secrets.token_urlsafe(num_bytes)}"


def hash_opaque_secret(secret: str) -> str:
    """Compute SHA-256 hex digest of an opaque token or activation code for database storage."""
    return hashlib.sha256(secret.encode("utf-8")).hexdigest()


def verify_opaque_secret(secret: str, expected_hash: str) -> bool:
    """Constant-time comparison of an opaque secret against its SHA-256 hash."""
    computed = hash_opaque_secret(secret)
    return hmac.compare_digest(computed, expected_hash)


def create_user_access_token(
    settings: Settings,
    user_id: str,
    organization_id: str,
    session_id: str,
    permissions: list[str],
    now: Optional[datetime] = None,
) -> str:
    """Issue a short-lived user access JWT scoped to the user's Organization."""
    issued_at = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    expires_at = issued_at + timedelta(seconds=settings.access_token_expire_seconds)
    claims: Dict[str, Any] = {
        "sub": user_id,
        "principal_type": "organization_user",
        "org_id": organization_id,
        "sid": session_id,
        "perms": sorted(set(permissions)),
        "iss": settings.jwt_issuer,
        "aud": settings.jwt_user_audience,
        "iat": int(issued_at.timestamp()),
        "nbf": int(issued_at.timestamp()),
        "exp": int(expires_at.timestamp()),
        "jti": str(uuid.uuid4()),
    }
    return jwt.encode(claims, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def create_device_access_token(
    settings: Settings,
    device_id: str,
    organization_id: str,
    store_id: str,
    token_family_id: str,
    deployment_id: Optional[str] = None,
    now: Optional[datetime] = None,
) -> str:
    """Issue a short-lived POS device access JWT bound to Organization, Store, and Device."""
    issued_at = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    expires_at = issued_at + timedelta(
        seconds=settings.device_access_token_expire_seconds
    )
    claims: Dict[str, Any] = {
        "sub": device_id,
        "principal_type": "pos_device",
        "org_id": organization_id,
        "store_id": store_id,
        "fam_id": token_family_id,
        "dep_id": deployment_id,
        "iss": settings.jwt_issuer,
        "aud": settings.jwt_device_audience,
        "iat": int(issued_at.timestamp()),
        "nbf": int(issued_at.timestamp()),
        "exp": int(expires_at.timestamp()),
        "jti": str(uuid.uuid4()),
    }
    return jwt.encode(claims, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_access_token(
    token: str,
    settings: Settings,
    expected_principal_type: Optional[Literal["organization_user", "pos_device"]] = None,
) -> Dict[str, Any]:
    """Decode and validate a JWT access token, strictly enforcing issuer, audience, and type."""
    audiences = [settings.jwt_user_audience, settings.jwt_device_audience]
    if expected_principal_type == "organization_user":
        audiences = [settings.jwt_user_audience]
    elif expected_principal_type == "pos_device":
        audiences = [settings.jwt_device_audience]

    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm],
            issuer=settings.jwt_issuer,
            audience=audiences,
            options={"require": ["sub", "principal_type", "org_id", "iss", "aud", "exp"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise UnauthorizedError(
            code="TOKEN_EXPIRED", message="Access token has expired."
        ) from exc
    except jwt.InvalidTokenError as exc:
        raise UnauthorizedError(
            code="INVALID_TOKEN", message="Invalid authentication token."
        ) from exc

    p_type = payload.get("principal_type")
    if expected_principal_type and p_type != expected_principal_type:
        raise UnauthorizedError(
            code="INVALID_PRINCIPAL_TYPE",
            message=f"Token principal '{p_type}' is not valid for this endpoint.",
        )

    # Enforce private-server fixed organization binding if running in private mode
    if (
        settings.deployment_mode == "private"
        and settings.organization_id
        and payload.get("org_id") != settings.organization_id
    ):
        raise UnauthorizedError(
            code="ORGANIZATION_BINDING_MISMATCH",
            message="Token organization does not match this Private Server deployment.",
        )

    return payload


def compute_canonical_request_hash(payload: Any) -> str:
    """Compute a deterministic SHA-256 hash over a semantically canonicalized request payload."""
    canonical_json = json.dumps(
        payload, sort_keys=True, separators=(",", ":"), default=str
    )
    return hashlib.sha256(canonical_json.encode("utf-8")).hexdigest()

