"""Platform Super-Admin API endpoints (/api/v1/platform/*)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import (
    get_db,
    get_request_id,
    get_settings,
    require_platform_admin,
    require_super_admin,
)
from app.core.config import Settings
from app.core.database import set_rls_tenant_context
from app.core.envelope import ok_response
from app.core.exceptions import (
    ConflictError,
    ForbiddenError,
    NotFoundError,
    UnauthorizedError,
    ValidationAppError,
)
from app.core.security import create_platform_admin_token, hash_password, verify_password
from app.infrastructure.models import (
    AuthSession,
    Device,
    Organization,
    PlatformAdmin,
    Role,
    Store,
    User,
    UserRoleAssignment,
)
from app.modules.organizations.service import provision_organization

router = APIRouter(prefix="/platform", tags=["Platform Super-Admin"])


class PlatformLoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=1, max_length=200)


class CreatePlatformAdminRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: str = Field(min_length=3, max_length=255)
    display_name: str = Field(min_length=1, max_length=160)
    password: str = Field(min_length=8, max_length=200)
    role: str = Field(default="support", pattern="^(super_admin|support)$")


class UpdatePlatformAdminRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: Optional[str] = Field(default=None, pattern="^(super_admin|support)$")
    status: Optional[str] = Field(default=None, pattern="^(active|locked)$")
    display_name: Optional[str] = Field(default=None, min_length=1, max_length=160)


class PlatformProvisionOrgRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str = Field(min_length=2, max_length=50)
    name: str = Field(min_length=2, max_length=200)
    admin_email: str = Field(min_length=3, max_length=255)
    admin_password: str = Field(min_length=8, max_length=200)
    admin_display_name: str = Field(min_length=1, max_length=160)
    initial_store_code: Optional[str] = Field(default=None, max_length=60)
    initial_store_name: Optional[str] = Field(default=None, max_length=200)
    max_stores_limit: int = Field(default=10, ge=1, le=500)
    max_devices_limit: int = Field(default=50, ge=1, le=2000)
    status: str = Field(default="active", pattern="^(active|pending_approval|suspended)$")


class UpdateOrgStatusRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: str = Field(..., pattern="^(active|pending_approval|suspended)$")


class UpdateOrgLimitsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    max_stores_limit: int = Field(..., ge=1, le=500)
    max_devices_limit: int = Field(..., ge=1, le=2000)


class ResetOrgUserPasswordRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    new_password: str = Field(min_length=8, max_length=200)
    revoke_sessions: bool = True


class UpdateOrgUserStatusRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: str = Field(..., pattern="^(active|locked)$")


def _serialize_admin(a: PlatformAdmin) -> Dict[str, Any]:
    return {
        "id": a.id,
        "email": a.email,
        "display_name": a.display_name,
        "role": a.role,
        "status": a.status,
        "last_login_at": a.last_login_at.isoformat() if a.last_login_at else None,
        "created_at": a.created_at.isoformat() if a.created_at else None,
    }


@router.post("/auth/login")
def platform_admin_login(
    body: PlatformLoginRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    if settings.deployment_mode == "private":
        raise ForbiddenError(
            code="PLATFORM_ADMIN_DISABLED",
            message="Platform administration is disabled on Private Server deployments.",
        )

    admin = (
        db.query(PlatformAdmin)
        .filter(func.lower(PlatformAdmin.email) == body.email.strip().lower())
        .first()
    )
    if admin is None or not verify_password(body.password, admin.password_hash):
        raise UnauthorizedError(
            code="INVALID_CREDENTIALS",
            message="Email hoặc mật khẩu Super Admin không chính xác.",
        )
    if admin.status != "active":
        raise ForbiddenError(
            code="ADMIN_LOCKED",
            message="Tài khoản Super Admin đã bị khóa.",
        )

    admin.last_login_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(admin)

    token = create_platform_admin_token(
        settings,
        admin_id=admin.id,
        email=admin.email,
        role=admin.role,
    )
    return ok_response(
        {
            "access_token": token,
            "token_type": "bearer",
            "expires_in": settings.access_token_expire_seconds,
            "admin": _serialize_admin(admin),
        },
        request_id=request_id,
    )


@router.get("/auth/me")
def platform_admin_me(
    admin: PlatformAdmin = Depends(require_platform_admin),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    return ok_response(_serialize_admin(admin), request_id=request_id)


@router.get("/admins")
def list_platform_admins(
    _admin: PlatformAdmin = Depends(require_super_admin),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    rows = db.query(PlatformAdmin).order_by(PlatformAdmin.created_at.asc()).all()
    return ok_response([_serialize_admin(r) for r in rows], request_id=request_id)


@router.post("/admins", status_code=status.HTTP_201_CREATED)
def create_platform_admin(
    body: CreatePlatformAdminRequest,
    _admin: PlatformAdmin = Depends(require_super_admin),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> JSONResponse:
    norm_email = body.email.strip().lower()
    if (
        db.query(PlatformAdmin)
        .filter(func.lower(PlatformAdmin.email) == norm_email)
        .first()
    ):
        raise ConflictError(
            code="ADMIN_EMAIL_EXISTS",
            message=f"Platform admin '{norm_email}' already exists.",
        )

    new_admin = PlatformAdmin(
        email=norm_email,
        display_name=body.display_name.strip(),
        password_hash=hash_password(body.password),
        role=body.role,
        status="active",
    )
    db.add(new_admin)
    db.commit()
    db.refresh(new_admin)
    return JSONResponse(
        status_code=status.HTTP_201_CREATED,
        content=ok_response(_serialize_admin(new_admin), request_id=request_id),
    )


@router.patch("/admins/{admin_id}")
def update_platform_admin(
    admin_id: str,
    body: UpdatePlatformAdminRequest,
    current_admin: PlatformAdmin = Depends(require_super_admin),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    target = db.query(PlatformAdmin).filter(PlatformAdmin.id == admin_id).first()
    if target is None:
        raise NotFoundError(code="ADMIN_NOT_FOUND", message="Platform admin not found.")
    if target.id == current_admin.id and body.status == "locked":
        raise ValidationAppError(
            code="CANNOT_LOCK_SELF",
            message="Không thể tự khóa tài khoản đang đăng nhập.",
        )
    if body.role is not None:
        target.role = body.role
    if body.status is not None:
        target.status = body.status
    if body.display_name is not None:
        target.display_name = body.display_name.strip()
    db.commit()
    db.refresh(target)
    return ok_response(_serialize_admin(target), request_id=request_id)


@router.get("/organizations")
def list_platform_organizations(
    _admin: PlatformAdmin = Depends(require_platform_admin),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    orgs = (
        db.query(Organization)
        .filter(Organization.deleted_at.is_(None))
        .order_by(Organization.created_at.desc())
        .all()
    )
    results: List[Dict[str, Any]] = []
    for o in orgs:
        set_rls_tenant_context(db, o.id)
        owner = (
            db.query(User)
            .filter(User.organization_id == o.id, User.deleted_at.is_(None))
            .order_by(User.created_at.asc())
            .first()
        )
        store_count = (
            db.query(func.count(Store.id))
            .filter(Store.organization_id == o.id, Store.deleted_at.is_(None))
            .scalar()
            or 0
        )
        user_count = (
            db.query(func.count(User.id))
            .filter(User.organization_id == o.id, User.deleted_at.is_(None))
            .scalar()
            or 0
        )
        device_count = (
            db.query(func.count(Device.id))
            .filter(Device.organization_id == o.id, Device.deleted_at.is_(None))
            .scalar()
            or 0
        )
        results.append(
            {
                "id": o.id,
                "code": o.code,
                "name": o.name,
                "status": o.status,
                "default_currency": o.default_currency,
                "timezone": o.timezone,
                "max_stores_limit": o.max_stores_limit,
                "max_devices_limit": o.max_devices_limit,
                "store_count": int(store_count),
                "user_count": int(user_count),
                "device_count": int(device_count),
                "owner_id": owner.id if owner else None,
                "owner_email": owner.email if owner else None,
                "owner_name": owner.display_name if owner else None,
                "owner_phone": owner.phone if owner else None,
                "created_at": o.created_at.isoformat() if o.created_at else None,
            }
        )
    return ok_response(results, request_id=request_id)


@router.post("/organizations", status_code=status.HTTP_201_CREATED)
def provision_platform_organization(
    body: PlatformProvisionOrgRequest,
    _admin: PlatformAdmin = Depends(require_super_admin),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    request_id: str = Depends(get_request_id),
) -> JSONResponse:
    org, owner, store = provision_organization(
        db,
        settings,
        code=body.code,
        name=body.name,
        admin_email=body.admin_email,
        admin_password=body.admin_password,
        admin_display_name=body.admin_display_name,
        initial_store_code=body.initial_store_code,
        initial_store_name=body.initial_store_name,
        status=body.status,
    )
    org.max_stores_limit = body.max_stores_limit
    org.max_devices_limit = body.max_devices_limit
    db.commit()
    return JSONResponse(
        status_code=status.HTTP_201_CREATED,
        content=ok_response(
            {
                "id": org.id,
                "code": org.code,
                "name": org.name,
                "status": org.status,
                "owner_email": owner.email,
                "initial_store": store.code if store else None,
            },
            request_id=request_id,
        ),
    )


@router.patch("/organizations/{org_id}/status")
def update_platform_org_status(
    org_id: str,
    body: UpdateOrgStatusRequest,
    _admin: PlatformAdmin = Depends(require_super_admin),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    org = (
        db.query(Organization)
        .filter(Organization.id == org_id, Organization.deleted_at.is_(None))
        .first()
    )
    if org is None:
        raise NotFoundError(code="ORGANIZATION_NOT_FOUND", message="Organization not found.")
    org.status = body.status
    db.commit()
    db.refresh(org)
    return ok_response({"id": org.id, "status": org.status}, request_id=request_id)


@router.patch("/organizations/{org_id}/limits")
def update_platform_org_limits(
    org_id: str,
    body: UpdateOrgLimitsRequest,
    _admin: PlatformAdmin = Depends(require_super_admin),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    org = (
        db.query(Organization)
        .filter(Organization.id == org_id, Organization.deleted_at.is_(None))
        .first()
    )
    if org is None:
        raise NotFoundError(code="ORGANIZATION_NOT_FOUND", message="Organization not found.")
    org.max_stores_limit = body.max_stores_limit
    org.max_devices_limit = body.max_devices_limit
    db.commit()
    db.refresh(org)
    return ok_response(
        {
            "id": org.id,
            "max_stores_limit": org.max_stores_limit,
            "max_devices_limit": org.max_devices_limit,
        },
        request_id=request_id,
    )


@router.get("/organizations/{org_id}/users")
def list_org_users_for_platform(
    org_id: str,
    _admin: PlatformAdmin = Depends(require_platform_admin),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    org = (
        db.query(Organization)
        .filter(Organization.id == org_id, Organization.deleted_at.is_(None))
        .first()
    )
    if org is None:
        raise NotFoundError(code="ORGANIZATION_NOT_FOUND", message="Organization not found.")

    set_rls_tenant_context(db, org.id)
    users = (
        db.query(User)
        .filter(User.organization_id == org.id, User.deleted_at.is_(None))
        .order_by(User.created_at.asc())
        .all()
    )

    items: List[Dict[str, Any]] = []
    for u in users:
        role_names = [
            r[0]
            for r in db.query(Role.name)
            .join(
                UserRoleAssignment,
                (UserRoleAssignment.role_id == Role.id)
                & (UserRoleAssignment.organization_id == Role.organization_id),
            )
            .filter(
                UserRoleAssignment.organization_id == org.id,
                UserRoleAssignment.user_id == u.id,
            )
            .all()
        ]
        active_sessions = (
            db.query(func.count(AuthSession.id))
            .filter(
                AuthSession.organization_id == org.id,
                AuthSession.user_id == u.id,
                AuthSession.revoked_at.is_(None),
            )
            .scalar()
            or 0
        )
        items.append(
            {
                "id": u.id,
                "email": u.email,
                "phone": u.phone,
                "display_name": u.display_name,
                "status": u.status,
                "roles": role_names,
                "active_sessions": int(active_sessions),
                "last_login_at": u.last_login_at.isoformat() if u.last_login_at else None,
                "created_at": u.created_at.isoformat() if u.created_at else None,
            }
        )
    return ok_response(items, request_id=request_id)


@router.post("/organizations/{org_id}/users/{user_id}/reset-password")
def reset_org_user_password(
    org_id: str,
    user_id: str,
    body: ResetOrgUserPasswordRequest,
    _admin: PlatformAdmin = Depends(require_platform_admin),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    set_rls_tenant_context(db, org_id)
    user = (
        db.query(User)
        .filter(
            User.organization_id == org_id,
            User.id == user_id,
            User.deleted_at.is_(None),
        )
        .first()
    )
    if user is None:
        raise NotFoundError(code="USER_NOT_FOUND", message="User not found in organization.")

    user.password_hash = hash_password(body.new_password)
    revoked_count = 0
    if body.revoke_sessions:
        now = datetime.now(timezone.utc)
        sessions = (
            db.query(AuthSession)
            .filter(
                AuthSession.organization_id == org_id,
                AuthSession.user_id == user.id,
                AuthSession.revoked_at.is_(None),
            )
            .all()
        )
        for s in sessions:
            s.revoked_at = now
            revoked_count += 1
    db.commit()
    return ok_response(
        {"user_id": user.id, "email": user.email, "revoked_sessions": revoked_count},
        request_id=request_id,
    )


@router.patch("/organizations/{org_id}/users/{user_id}/status")
def update_org_user_status(
    org_id: str,
    user_id: str,
    body: UpdateOrgUserStatusRequest,
    _admin: PlatformAdmin = Depends(require_super_admin),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    set_rls_tenant_context(db, org_id)
    user = (
        db.query(User)
        .filter(
            User.organization_id == org_id,
            User.id == user_id,
            User.deleted_at.is_(None),
        )
        .first()
    )
    if user is None:
        raise NotFoundError(code="USER_NOT_FOUND", message="User not found in organization.")

    user.status = body.status
    if body.status == "locked":
        now = datetime.now(timezone.utc)
        sessions = (
            db.query(AuthSession)
            .filter(
                AuthSession.organization_id == org_id,
                AuthSession.user_id == user.id,
                AuthSession.revoked_at.is_(None),
            )
            .all()
        )
        for s in sessions:
            s.revoked_at = now
    db.commit()
    return ok_response({"user_id": user.id, "status": user.status}, request_id=request_id)


@router.post("/organizations/{org_id}/users/{user_id}/revoke-sessions")
def revoke_org_user_sessions(
    org_id: str,
    user_id: str,
    _admin: PlatformAdmin = Depends(require_platform_admin),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    set_rls_tenant_context(db, org_id)
    now = datetime.now(timezone.utc)
    sessions = (
        db.query(AuthSession)
        .filter(
            AuthSession.organization_id == org_id,
            AuthSession.user_id == user_id,
            AuthSession.revoked_at.is_(None),
        )
        .all()
    )
    for s in sessions:
        s.revoked_at = now
    db.commit()
    return ok_response({"user_id": user_id, "revoked_sessions": len(sessions)}, request_id=request_id)

