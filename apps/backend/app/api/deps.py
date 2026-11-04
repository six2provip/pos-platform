"""Authentication, Tenant Resolution, Store Scope, RBAC, and Idempotency dependencies.

Reference:
- docs/03-api-specification.md (Section 4, 5, 6, 13)
- docs/07-security-and-licensing.md (Section 6, 7, 8)
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Dict, List, Optional, Set, Tuple, Union
from fastapi import Depends, Header, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.database import set_rls_tenant_context
from app.core.exceptions import (
    ConflictError,
    ForbiddenError,
    NotFoundError,
    UnauthorizedError,
    ValidationAppError,
)
from app.core.security import compute_canonical_request_hash, decode_access_token
from app.infrastructure.models import (
    Device,
    DeviceToken,
    IdempotencyRecord,
    Organization,
    OrganizationMembership,
    Permission,
    Role,
    RolePermission,
    Store,
    User,
    UserRoleAssignment,
    UserStoreAssignment,
)

bearer_scheme = HTTPBearer(auto_error=False)


@dataclass
class UserPrincipal:
    principal_type: str
    user: User
    organization: Organization
    permissions: Set[str]
    all_stores_access: bool
    authorized_store_ids: Set[str]
    session_id: str


@dataclass
class DevicePrincipal:
    principal_type: str
    device: Device
    organization: Organization
    store: Store
    token_family_id: str


Principal = Union[UserPrincipal, DevicePrincipal]


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_db(request: Request) -> Session:
    session_factory = request.app.state.session_factory
    db: Session = session_factory()
    try:
        yield db
    finally:
        db.close()


def get_request_id(request: Request) -> str:
    return getattr(request.state, "request_id", "req_unknown")


def resolve_user_permissions_and_stores(
    db: Session, organization_id: str, user_id: str
) -> Tuple[Set[str], bool, Set[str]]:
    """Compute effective permission codes and authorized store IDs for a user."""
    role_rows = (
        db.query(Role)
        .join(
            UserRoleAssignment,
            (UserRoleAssignment.role_id == Role.id)
            & (UserRoleAssignment.organization_id == Role.organization_id),
        )
        .filter(
            UserRoleAssignment.organization_id == organization_id,
            UserRoleAssignment.user_id == user_id,
        )
        .all()
    )
    if not role_rows:
        return set(), False, set()

    role_ids = [r.id for r in role_rows]
    all_stores_access = any(r.all_stores_access for r in role_rows)

    perm_rows = (
        db.query(Permission.code)
        .join(RolePermission, RolePermission.permission_id == Permission.id)
        .filter(RolePermission.role_id.in_(role_ids))
        .all()
    )
    permissions = {row[0] for row in perm_rows}

    if all_stores_access:
        active_stores = (
            db.query(Store.id)
            .filter(
                Store.organization_id == organization_id,
                Store.status == "active",
                Store.deleted_at.is_(None),
            )
            .all()
        )
        store_ids = {row[0] for row in active_stores}
    else:
        assigned = (
            db.query(UserStoreAssignment.store_id)
            .join(
                Store,
                (Store.organization_id == UserStoreAssignment.organization_id)
                & (Store.id == UserStoreAssignment.store_id),
            )
            .filter(
                UserStoreAssignment.organization_id == organization_id,
                UserStoreAssignment.user_id == user_id,
                Store.status == "active",
                Store.deleted_at.is_(None),
            )
            .all()
        )
        store_ids = {row[0] for row in assigned}

    return permissions, all_stores_access, store_ids


def get_current_principal(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> Principal:
    """Authenticate either an Organization User or a POS Device and bind RLS tenant context."""
    # Reject X-Organization-ID spoofing attempts explicitly if client tries to override tenant
    if credentials is None or not credentials.credentials:
        raise UnauthorizedError(
            code="MISSING_CREDENTIALS",
            message="Bearer authentication token is required.",
        )

    claims = decode_access_token(credentials.credentials, settings=settings)
    org_id = str(claims["org_id"])
    principal_type = claims["principal_type"]

    # Bind transaction-local PostgreSQL RLS context immediately
    set_rls_tenant_context(db, org_id)

    organization = (
        db.query(Organization)
        .filter(Organization.id == org_id, Organization.deleted_at.is_(None))
        .first()
    )
    if organization is None or organization.status != "active":
        raise ForbiddenError(
            code="ORGANIZATION_INACTIVE",
            message="The organization associated with this credential is not active.",
        )

    if principal_type == "organization_user":
        user_id = str(claims["sub"])
        user = (
            db.query(User)
            .filter(
                User.organization_id == org_id,
                User.id == user_id,
                User.deleted_at.is_(None),
            )
            .first()
        )
        if user is None or user.status != "active":
            raise UnauthorizedError(
                code="USER_INACTIVE", message="User account is disabled or locked."
            )

        membership = (
            db.query(OrganizationMembership)
            .filter(
                OrganizationMembership.organization_id == org_id,
                OrganizationMembership.user_id == user_id,
            )
            .first()
        )
        if membership is None or membership.membership_status != "active":
            raise ForbiddenError(
                code="MEMBERSHIP_INACTIVE",
                message="User does not have an active organization membership.",
            )

        perms, all_stores, store_ids = resolve_user_permissions_and_stores(
            db, org_id, user_id
        )
        return UserPrincipal(
            principal_type="organization_user",
            user=user,
            organization=organization,
            permissions=perms,
            all_stores_access=all_stores,
            authorized_store_ids=store_ids,
            session_id=str(claims.get("sid", "")),
        )

    elif principal_type == "pos_device":
        device_id = str(claims["sub"])
        store_id = str(claims["store_id"])
        token_family_id = str(claims["fam_id"])

        device = (
            db.query(Device)
            .filter(
                Device.organization_id == org_id,
                Device.id == device_id,
                Device.deleted_at.is_(None),
            )
            .first()
        )
        if device is None or device.status != "active":
            raise ForbiddenError(
                code="DEVICE_NOT_ACTIVE",
                message="POS device is disabled, revoked, or not active.",
            )
        if device.store_id != store_id:
            raise ForbiddenError(
                code="DEVICE_STORE_REASSIGNED",
                message="POS device store binding has changed; re-fetch configuration.",
            )

        # Verify token family has not been revoked
        active_token_record = (
            db.query(DeviceToken)
            .filter(
                DeviceToken.organization_id == org_id,
                DeviceToken.device_id == device_id,
                DeviceToken.token_family_id == token_family_id,
                DeviceToken.revoked_at.is_(None),
            )
            .first()
        )
        if active_token_record is None:
            raise UnauthorizedError(
                code="DEVICE_TOKEN_REVOKED",
                message="POS device credential has been revoked.",
            )

        store = (
            db.query(Store)
            .filter(
                Store.organization_id == org_id,
                Store.id == store_id,
                Store.deleted_at.is_(None),
            )
            .first()
        )
        if store is None or store.status != "active":
            raise ForbiddenError(
                code="STORE_INACTIVE",
                message="Bound store is not active.",
            )

        return DevicePrincipal(
            principal_type="pos_device",
            device=device,
            organization=organization,
            store=store,
            token_family_id=token_family_id,
        )

    raise UnauthorizedError(
        code="UNKNOWN_PRINCIPAL", message="Unsupported authentication principal."
    )


def get_current_user(
    principal: Principal = Depends(get_current_principal),
) -> UserPrincipal:
    """Require an authenticated Organization User (rejects POS Device tokens)."""
    if not isinstance(principal, UserPrincipal):
        raise ForbiddenError(
            code="USER_PRINCIPAL_REQUIRED",
            message="This endpoint is restricted to Organization Users; POS Device credentials are not permitted.",
        )
    return principal


def get_current_device(
    principal: Principal = Depends(get_current_principal),
) -> DevicePrincipal:
    """Require an authenticated POS Device (rejects Organization User tokens)."""
    if not isinstance(principal, DevicePrincipal):
        raise ForbiddenError(
            code="DEVICE_PRINCIPAL_REQUIRED",
            message="This endpoint requires a bound POS Device credential.",
        )
    return principal


def require_permission(permission_code: str) -> Callable[..., UserPrincipal]:
    """Dependency factory enforcing that an Organization User holds `permission_code`."""

    def _checker(user_principal: UserPrincipal = Depends(get_current_user)) -> UserPrincipal:
        if permission_code not in user_principal.permissions:
            raise ForbiddenError(
                code="INSUFFICIENT_PERMISSIONS",
                message=f"Required permission '{permission_code}' is not granted.",
            )
        return user_principal

    return _checker


def verify_store_access(
    db: Session,
    principal: Principal,
    requested_store_id: Optional[str] = None,
    x_store_id: Optional[str] = None,
    require_store: bool = True,
) -> Optional[Store]:
    """Verify and resolve Store scope for either a UserPrincipal or DevicePrincipal.

    Rules (Section 5.1 & 6.2 of 03-api-specification.md):
    - POS Device: strictly bound to `principal.store.id`. Any mismatch in `requested_store_id`
      is rejected with 403. `X-Store-ID` cannot override device store binding.
    - Organization User: resolves from `requested_store_id` or `X-Store-ID`, verifies store
      belongs to `principal.organization.id` (returning 404 to conceal cross-tenant IDs),
      and checks `authorized_store_ids`.
    """
    if isinstance(principal, DevicePrincipal):
        if requested_store_id and requested_store_id != principal.store.id:
            raise ForbiddenError(
                code="DEVICE_STORE_SCOPE_VIOLATION",
                message="POS device cannot operate on a store other than its bound store.",
            )
        return principal.store

    target_store_id = requested_store_id or x_store_id
    if not target_store_id:
        if require_store:
            raise ValidationAppError(
                code="STORE_CONTEXT_REQUIRED",
                message="Store context is required (provide store_id or X-Store-ID header).",
            )
        return None

    store = (
        db.query(Store)
        .filter(
            Store.organization_id == principal.organization.id,
            Store.id == target_store_id,
            Store.deleted_at.is_(None),
        )
        .first()
    )
    if store is None:
        # Conceal cross-tenant or non-existent store with 404
        raise NotFoundError(
            code="STORE_NOT_FOUND",
            message="The requested store was not found in this organization.",
        )

    if (
        not principal.all_stores_access
        and store.id not in principal.authorized_store_ids
    ):
        raise ForbiddenError(
            code="STORE_ACCESS_DENIED",
            message="You do not have access to the specified store.",
        )

    return store


def check_or_claim_idempotency(
    db: Session,
    *,
    organization_id: str,
    scope: str,
    idempotency_key: Optional[str],
    request_payload: Any,
    ttl_hours: int = 168,
) -> Tuple[Optional[Dict[str, Any]], IdempotencyRecord, str]:
    """Atomically check or claim an idempotency key for a retry-safe write operation.

    Returns:
        (replayed_response_dict_or_none, idempotency_record, request_hash)
    """
    if not idempotency_key or not idempotency_key.strip():
        raise ValidationAppError(
            code="IDEMPOTENCY_KEY_REQUIRED",
            message="Idempotency-Key header is required for this write operation.",
        )
    clean_key = idempotency_key.strip()
    req_hash = compute_canonical_request_hash(request_payload)

    existing = (
        db.query(IdempotencyRecord)
        .filter(
            IdempotencyRecord.organization_id == organization_id,
            IdempotencyRecord.scope == scope,
            IdempotencyRecord.idempotency_key == clean_key,
        )
        .first()
    )
    if existing is not None:
        if existing.request_hash != req_hash:
            raise ConflictError(
                code="IDEMPOTENCY_KEY_REUSED",
                message="Idempotency-Key was already used with a different request payload.",
            )
        if existing.status == "completed" and existing.response_body is not None:
            return existing.response_body, existing, req_hash
        if existing.status == "processing":
            raise ConflictError(
                code="IDEMPOTENCY_REQUEST_IN_PROGRESS",
                message="A request with this Idempotency-Key is currently being processed.",
            )
        return None, existing, req_hash

    now = datetime.now(timezone.utc)
    record = IdempotencyRecord(
        organization_id=organization_id,
        scope=scope,
        idempotency_key=clean_key,
        request_hash=req_hash,
        status="processing",
        created_at=now,
        expires_at=now + timedelta(hours=ttl_hours),
    )
    db.add(record)
    db.flush()
    return None, record, req_hash


def complete_idempotency_record(
    record: IdempotencyRecord,
    *,
    response_status: int,
    response_data: Dict[str, Any],
    resource_type: str,
    resource_id: str,
) -> None:
    """Persist the completed outcome into the idempotency record inside the same DB transaction."""
    record.status = "completed"
    record.response_status = response_status
    record.response_body = response_data
    record.resource_type = resource_type
    record.resource_id = resource_id

