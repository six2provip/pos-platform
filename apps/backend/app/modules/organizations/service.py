"""Organization provisioning, bootstrap, and settings validation service.

Reference:
- docs/02-database-schema.md (Section 7.1, 7.10, 16.2, 16.3, 20.2)
- docs/03-api-specification.md (Section 7.3)
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.exceptions import ConflictError, ValidationAppError
from app.core.logging import SENSITIVE_KEYS
from app.core.security import hash_password
from app.infrastructure.models import (
    CatalogChangeLog,
    LocalDeploymentIdentity,
    Organization,
    OrganizationMembership,
    OrganizationSetting,
    PaymentMethod,
    PriceList,
    Store,
    StoreSetting,
    User,
    UserRoleAssignment,
)
from app.modules.audit.service import record_audit_event
from app.modules.authorization.constants import seed_organization_system_roles


def validate_non_secret_settings(settings_dict: Dict[str, Any]) -> None:
    """Reject settings payloads that attempt to store secrets, keys, passwords, or tokens."""

    def _scan(obj: Any) -> None:
        if isinstance(obj, dict):
            for k, v in obj.items():
                lowered = str(k).lower().strip()
                if lowered in SENSITIVE_KEYS or any(
                    bad in lowered
                    for bad in (
                        "password",
                        "secret",
                        "private_key",
                        "signing_key",
                        "device_token",
                        "refresh_token",
                        "access_token",
                    )
                ):
                    raise ValidationAppError(
                        code="SECRET_IN_SETTINGS_FORBIDDEN",
                        message=f"Field '{k}' cannot be stored in preferences JSON.",
                    )
                _scan(v)
        elif isinstance(obj, list):
            for item in obj:
                _scan(item)

    _scan(settings_dict)


def provision_organization(
    db: Session,
    settings: Settings,
    *,
    code: str,
    name: str,
    admin_email: str,
    admin_password: str,
    admin_display_name: str = "Organization Admin",
    organization_id: Optional[str] = None,
    default_currency: str = "VND",
    timezone_name: str = "Asia/Ho_Chi_Minh",
    legal_name: Optional[str] = None,
    tax_identifier: Optional[str] = None,
    initial_store_code: Optional[str] = None,
    initial_store_name: Optional[str] = None,
    max_stores_limit: int = 10,
    max_devices_limit: int = 50,
    status: str = "active",
) -> Tuple[Organization, User, Optional[Store]]:
    """Bootstrap an Organization, system roles, initial admin user, and default payment methods.

    In `private` deployment mode, strictly enforces the Single-Organization rule.
    """
    if settings.deployment_mode == "private":
        existing_org_count = db.query(Organization).count()
        if existing_org_count >= 1:
            raise ConflictError(
                code="PRIVATE_SINGLE_ORGANIZATION_VIOLATION",
                message="A Private Server deployment is bound to exactly one Organization and cannot create another.",
            )
        if settings.organization_id and organization_id and organization_id != settings.organization_id:
            raise ConflictError(
                code="ORGANIZATION_ID_MISMATCH",
                message="Provided organization_id does not match Private Server configured ORGANIZATION_ID.",
            )
        organization_id = organization_id or settings.organization_id

    norm_code = code.strip().upper()
    if db.query(Organization).filter(Organization.code == norm_code).first() is not None:
        raise ConflictError(
            code="ORGANIZATION_CODE_EXISTS",
            message=f"Organization with code '{norm_code}' already exists.",
        )

    org = Organization(
        id=organization_id,
        code=norm_code,
        name=name.strip(),
        legal_name=legal_name,
        tax_identifier=tax_identifier,
        default_currency=default_currency.upper(),
        timezone=timezone_name,
        status=status,
        max_stores_limit=max_stores_limit,
        max_devices_limit=max_devices_limit,
    )
    if organization_id:
        org.id = organization_id
    db.add(org)
    db.flush()

    default_org_settings = {
        "offline_policy": {
            "enabled": True,
            "cash_recording_allowed": True,
            "allow_negative_stock": False,
            "inventory_conflict_policy": "reject_if_insufficient",
            "price_validation_policy": "cached_price_grace",
            "maximum_offline_age_seconds": 259200,
        },
        "receipt_header": org.name,
    }
    org_setting = OrganizationSetting(
        organization_id=org.id,
        settings=default_org_settings,
        version=1,
    )
    db.add(org_setting)

    if settings.deployment_mode == "private":
        local_id = db.get(LocalDeploymentIdentity, 1)
        if local_id is None:
            db.add(
                LocalDeploymentIdentity(
                    id=1,
                    deployment_id=settings.deployment_id or "dep_unregistered",
                    organization_id=org.id,
                    deployment_mode="private",
                )
            )

    roles = seed_organization_system_roles(db, org.id)
    owner_role = roles["org_owner"]

    norm_email = admin_email.strip().lower()
    admin_user = User(
        organization_id=org.id,
        email=norm_email,
        display_name=admin_display_name.strip(),
        password_hash=hash_password(admin_password),
        status="active",
    )
    db.add(admin_user)
    db.flush()

    db.add(
        OrganizationMembership(
            organization_id=org.id,
            user_id=admin_user.id,
            membership_status="active",
        )
    )
    db.add(
        UserRoleAssignment(
            organization_id=org.id,
            user_id=admin_user.id,
            role_id=owner_role.id,
            assigned_by=admin_user.id,
        )
    )

    # Seed default price list
    default_price_list = PriceList(
        organization_id=org.id,
        code="DEFAULT",
        name="Default Price List",
        currency_code=org.default_currency,
        is_default=True,
        status="active",
    )
    db.add(default_price_list)

    # Seed default payment methods
    default_methods = [
        ("CASH", "Cash", "cash", True, False),
        ("BANK_TRANSFER", "Bank Transfer", "bank_transfer", False, True),
        ("CARD_TERMINAL", "Card Terminal", "card_terminal", False, True),
    ]
    for pm_code, pm_name, pm_type, offline_ok, ext_auth in default_methods:
        pm = PaymentMethod(
            organization_id=org.id,
            code=pm_code,
            name=pm_name,
            method_type=pm_type,
            supports_offline_recording=offline_ok,
            requires_external_authorization=ext_auth,
            status="active",
        )
        db.add(pm)
        db.flush()
        db.add(
            CatalogChangeLog(
                organization_id=org.id,
                stream_name="payment_methods",
                entity_type="payment_method",
                change_type="upsert",
                entity_id=pm.id,
                version=1,
                payload={
                    "id": pm.id,
                    "code": pm.code,
                    "name": pm.name,
                    "method_type": pm.method_type,
                    "supports_offline_recording": pm.supports_offline_recording,
                    "requires_external_authorization": pm.requires_external_authorization,
                    "status": pm.status,
                },
            )
        )

    initial_store: Optional[Store] = None
    if initial_store_code and initial_store_name:
        initial_store = Store(
            organization_id=org.id,
            code=initial_store_code.strip().upper(),
            name=initial_store_name.strip(),
            timezone=org.timezone,
            currency_code=org.default_currency,
            status="active",
            created_by=admin_user.id,
        )
        db.add(initial_store)
        db.flush()
        db.add(
            StoreSetting(
                organization_id=org.id,
                store_id=initial_store.id,
                settings={"receipt_footer": "Thank you for your purchase!"},
                version=1,
            )
        )

    record_audit_event(
        db,
        action="organization.provisioned",
        entity_type="organization",
        actor_type="system",
        actor_id=admin_user.id,
        organization_id=org.id,
        entity_id=org.id,
        metadata={"code": org.code, "deployment_mode": settings.deployment_mode},
    )
    db.flush()
    return org, admin_user, initial_store

