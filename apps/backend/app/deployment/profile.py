"""Explicit deployment profile adapter (`cloud` vs `private`).

Reference:
- ADR-003: Multi-tenant Cloud, Single-tenant Private Server
- ADR-004: Mandatory Cloud Control Plane Connection (local cache validation)
- ADR-012: Deployment-specific Configuration
- docs/03-api-specification.md (Section 7.1, 7.4)
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import List, Optional
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.exceptions import ConflictError, ForbiddenError
from app.infrastructure.models import (
    Device,
    LocalDeploymentIdentity,
    LocalLicenseCache,
    Organization,
    Store,
)
from licensing.schemas.envelope import (
    LicenseValidationError,
    SignedLicenseEnvelope,
    parse_rfc3339_utc,
)
from licensing.validator.verifier import LicenseValidator


@dataclass
class EffectiveEntitlements:
    deployment_mode: str
    deployment_id: Optional[str]
    organization_id: str
    edition: str
    features: List[str]
    max_stores: int
    max_devices: int
    license_state: str = "active"
    allow_pos_sales: bool = True
    allow_new_device_activation: bool = True
    allow_new_store_provisioning: bool = True
    warnings: List[str] = field(default_factory=list)


def resolve_organization_entitlements(
    db: Session,
    settings: Settings,
    organization: Organization,
    now: Optional[datetime] = None,
) -> EffectiveEntitlements:
    """Resolve effective capabilities and limits for the active Organization without any network calls."""
    if settings.deployment_mode == "cloud":
        return EffectiveEntitlements(
            deployment_mode="cloud",
            deployment_id=settings.deployment_id,
            organization_id=organization.id,
            edition="cloud_standard",
            features=[
                "pos",
                "pos.sales",
                "pos.cash",
                "catalog.barcode",
                "inventory",
                "inventory.adjustments",
                "reports",
            ],
            max_stores=organization.max_stores_limit or settings.default_max_stores,
            max_devices=organization.max_devices_limit or settings.default_max_devices,
            license_state="active",
        )

    # Private Server mode: validate fixed organization binding
    if settings.organization_id and organization.id != settings.organization_id:
        raise ForbiddenError(
            code="ORGANIZATION_BINDING_MISMATCH",
            message="Requested organization does not match this Private Server deployment.",
        )

    local_identity = db.get(LocalDeploymentIdentity, 1)
    if local_identity is not None and local_identity.organization_id != organization.id:
        raise ForbiddenError(
            code="DEPLOYMENT_IDENTITY_MISMATCH",
            message="Database deployment identity does not match organization binding.",
        )

    if not settings.license_validation_enabled:
        return EffectiveEntitlements(
            deployment_mode="private",
            deployment_id=settings.deployment_id,
            organization_id=organization.id,
            edition="enterprise",
            features=[
                "pos",
                "pos.sales",
                "pos.cash",
                "catalog.barcode",
                "inventory",
                "inventory.adjustments",
                "reports",
            ],
            max_stores=organization.max_stores_limit or settings.default_max_stores,
            max_devices=organization.max_devices_limit or settings.default_max_devices,
            license_state="active",
        )

    license_cache = db.get(LocalLicenseCache, 1)
    if license_cache is None:
        raise ForbiddenError(
            code="LICENSE_NOT_INSTALLED",
            message="No validated license entitlement is installed on this Private Server.",
        )

    if not settings.trusted_license_public_keys:
        raise ForbiddenError(
            code="LICENSE_TRUST_KEYS_MISSING",
            message="No trusted license verification public keys are configured.",
        )

    try:
        envelope = SignedLicenseEnvelope.model_validate_json(
            license_cache.signed_payload
        )
        validator = LicenseValidator(
            trusted_public_keys=settings.trusted_license_public_keys
        )
        evaluation = validator.verify_and_evaluate(
            envelope=envelope,
            expected_deployment_id=settings.deployment_id or license_cache.deployment_id,
            expected_organization_id=organization.id,
            highest_accepted_sequence=license_cache.sequence,
            last_validated_at=license_cache.last_validated_at,
            is_revoked_snapshot=license_cache.revocation_snapshot_at is not None,
            now=now or datetime.now(timezone.utc),
        )
    except LicenseValidationError as exc:
        raise ForbiddenError(code=exc.code, message=exc.message) from exc

    expanded_features = set(evaluation.payload.features)
    if "pos" in expanded_features:
        expanded_features.update({"pos.sales", "pos.cash", "catalog.barcode"})
    if "inventory" in expanded_features:
        expanded_features.add("inventory.adjustments")

    return EffectiveEntitlements(
        deployment_mode="private",
        deployment_id=settings.deployment_id,
        organization_id=organization.id,
        edition=evaluation.payload.edition,
        features=sorted(expanded_features),
        max_stores=evaluation.payload.limits.max_stores,
        max_devices=evaluation.payload.limits.max_devices,
        license_state=evaluation.state,
        allow_pos_sales=evaluation.allow_pos_sales,
        allow_new_device_activation=evaluation.allow_new_device_activation,
        allow_new_store_provisioning=evaluation.allow_new_store_provisioning,
        warnings=evaluation.warnings,
    )


def enforce_store_limit(
    db: Session,
    settings: Settings,
    organization: Organization,
) -> None:
    """Verify creating a new Store does not breach subscription or license limits."""
    entitlements = resolve_organization_entitlements(db, settings, organization)
    if not entitlements.allow_new_store_provisioning:
        raise ForbiddenError(
            code="LICENSE_RESTRICTED_PROVISIONING",
            message="New store provisioning is restricted under the current license state.",
        )
    active_store_count = (
        db.query(Store)
        .filter(
            Store.organization_id == organization.id,
            Store.status != "archived",
            Store.deleted_at.is_(None),
        )
        .count()
    )
    if active_store_count >= entitlements.max_stores:
        raise ConflictError(
            code="LICENSE_LIMIT_EXCEEDED",
            message=f"Store limit ({entitlements.max_stores}) reached for this organization.",
        )


def enforce_device_limit(
    db: Session,
    settings: Settings,
    organization: Organization,
    exclude_device_id: Optional[str] = None,
) -> None:
    """Verify creating or activating a POS Device does not breach subscription or license limits."""
    entitlements = resolve_organization_entitlements(db, settings, organization)
    if not entitlements.allow_new_device_activation:
        raise ForbiddenError(
            code="LICENSE_RESTRICTED_ACTIVATION",
            message="New device activation is restricted under the current license state.",
        )
    query = db.query(Device).filter(
        Device.organization_id == organization.id,
        Device.status.in_(["pending", "active"]),
        Device.deleted_at.is_(None),
    )
    if exclude_device_id:
        query = query.filter(Device.id != exclude_device_id)
    if query.count() >= entitlements.max_devices:
        raise ConflictError(
            code="LICENSE_LIMIT_EXCEEDED",
            message=f"Active POS device limit ({entitlements.max_devices}) reached for this organization.",
        )


def cache_signed_license_envelope(
    db: Session,
    settings: Settings,
    envelope_dict: dict,
    now: Optional[datetime] = None,
) -> SignedLicenseEnvelope:
    """Validate a signed license envelope against trusted keys and persist to `local_license_cache`."""
    envelope = SignedLicenseEnvelope.model_validate(envelope_dict)
    current_cache = db.get(LocalLicenseCache, 1)
    highest_seq = current_cache.sequence if current_cache else 0
    eval_now = now or datetime.now(timezone.utc)

    if settings.trusted_license_public_keys:
        validator = LicenseValidator(
            trusted_public_keys=settings.trusted_license_public_keys
        )
        evaluation = validator.verify_and_evaluate(
            envelope=envelope,
            expected_deployment_id=settings.deployment_id or envelope.payload.deployment_id,
            expected_organization_id=settings.organization_id or envelope.payload.organization_id,
            highest_accepted_sequence=highest_seq,
            last_validated_at=eval_now,
            is_revoked_snapshot=False,
            now=eval_now,
        )
        if not evaluation.allow_pos_sales:
            raise ForbiddenError(
                code="LICENSE_INVALID_STATE",
                message=f"License evaluated to non-operational state '{evaluation.state}'.",
            )

    exp_dt = parse_rfc3339_utc(envelope.payload.expires_at)
    if current_cache is None:
        current_cache = LocalLicenseCache(
            id=1,
            license_id=envelope.payload.license_id,
            deployment_id=envelope.payload.deployment_id,
            organization_id=envelope.payload.organization_id,
            signed_payload=envelope.model_dump_json(),
            key_id=envelope.key_id,
            sequence=envelope.payload.sequence,
            last_validated_at=eval_now,
            expires_at=exp_dt,
        )
        db.add(current_cache)
    else:
        current_cache.license_id = envelope.payload.license_id
        current_cache.deployment_id = envelope.payload.deployment_id
        current_cache.organization_id = envelope.payload.organization_id
        current_cache.signed_payload = envelope.model_dump_json()
        current_cache.key_id = envelope.key_id
        current_cache.sequence = envelope.payload.sequence
        current_cache.last_validated_at = eval_now
        current_cache.expires_at = exp_dt

    db.commit()
    return envelope

