"""User authentication API endpoints (`/api/v1/auth/*`).

Reference:
- docs/03-api-specification.md (Section 4.2, 7.2)
- docs/07-security-and-licensing.md (Section 6.2, 6.5)
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional
from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.api.deps import (
    UserPrincipal,
    get_current_user,
    get_db,
    get_request_id,
    get_settings,
    resolve_user_permissions_and_stores,
)
from app.core.config import Settings
from app.core.database import set_rls_tenant_context
from app.core.envelope import ok_response
from app.core.exceptions import ForbiddenError, UnauthorizedError, ValidationAppError
from app.core.security import (
    create_user_access_token,
    generate_opaque_secret,
    hash_opaque_secret,
    hash_password,
    verify_password,
)
from app.infrastructure.models import (
    AuthSession,
    Organization,
    OrganizationMembership,
    Store,
    User,
)
from app.modules.audit.service import record_audit_event

router = APIRouter(prefix="/auth", tags=["Authentication"])


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    organization_code: Optional[str] = None
    identifier: str = Field(min_length=1, max_length=254)
    password: str = Field(min_length=1, max_length=256)


class RefreshTokenRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    refresh_token: str = Field(min_length=10, max_length=512)


class ChangePasswordRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    current_password: str = Field(min_length=1, max_length=256)
    new_password: str = Field(min_length=8, max_length=256)


def _build_available_stores(
    db: Session, organization_id: str, store_ids: set[str]
) -> list[Dict[str, str]]:
    if not store_ids:
        return []
    rows = (
        db.query(Store)
        .filter(
            Store.organization_id == organization_id,
            Store.id.in_(store_ids),
            Store.status == "active",
            Store.deleted_at.is_(None),
        )
        .order_by(Store.code.asc())
        .all()
    )
    return [{"id": s.id, "code": s.code, "name": s.name} for s in rows]


@router.post("/login")
def login(
    body: LoginRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    # 1. Resolve target Organization according to deployment profile
    if settings.deployment_mode == "private":
        org = (
            db.query(Organization)
            .filter(
                Organization.id == settings.organization_id,
                Organization.deleted_at.is_(None),
            )
            .first()
        )
        if org is None:
            raise UnauthorizedError(
                code="INVALID_CREDENTIALS", message="Invalid login credentials."
            )
        if (
            body.organization_code
            and body.organization_code.strip().upper() != org.code.upper()
        ):
            raise ForbiddenError(
                code="ORGANIZATION_SWITCH_FORBIDDEN",
                message="Private Server is bound to a single Organization and cannot switch tenants.",
            )
    else:
        if not body.organization_code or not body.organization_code.strip():
            raise ValidationAppError(
                code="ORGANIZATION_CODE_REQUIRED",
                message="organization_code is required for Cloud SaaS login.",
            )
        norm_code = body.organization_code.strip().upper()
        org = (
            db.query(Organization)
            .filter(
                Organization.code == norm_code,
                Organization.deleted_at.is_(None),
            )
            .first()
        )
        if org is None:
            raise UnauthorizedError(
                code="INVALID_CREDENTIALS", message="Invalid login credentials."
            )

    if org.status != "active":
        raise ForbiddenError(
            code="ORGANIZATION_SUSPENDED",
            message="Organization is not active.",
        )

    set_rls_tenant_context(db, org.id)

    identifier = body.identifier.strip().lower()
    user = (
        db.query(User)
        .filter(
            User.organization_id == org.id,
            (User.email == identifier) | (User.phone == identifier),
            User.deleted_at.is_(None),
        )
        .first()
    )
    if user is None or not verify_password(body.password, user.password_hash):
        record_audit_event(
            db,
            action="auth.login.failed",
            entity_type="user",
            actor_type="user",
            organization_id=org.id,
            request_id=request_id,
            metadata={"identifier": identifier},
        )
        db.commit()
        raise UnauthorizedError(
            code="INVALID_CREDENTIALS", message="Invalid login credentials."
        )

    if user.status != "active":
        raise ForbiddenError(
            code="USER_ACCOUNT_INACTIVE",
            message=f"User account status is '{user.status}'.",
        )

    membership = (
        db.query(OrganizationMembership)
        .filter(
            OrganizationMembership.organization_id == org.id,
            OrganizationMembership.user_id == user.id,
        )
        .first()
    )
    if membership is None or membership.membership_status != "active":
        raise ForbiddenError(
            code="MEMBERSHIP_INACTIVE",
            message="User does not have an active organization membership.",
        )

    now = datetime.now(timezone.utc)
    raw_refresh_token = generate_opaque_secret(prefix="rt")
    session_row = AuthSession(
        organization_id=org.id,
        user_id=user.id,
        refresh_token_hash=hash_opaque_secret(raw_refresh_token),
        issued_at=now,
        expires_at=now + timedelta(days=settings.refresh_token_expire_days),
    )
    db.add(session_row)
    user.last_login_at = now
    db.flush()

    perms, _, store_ids = resolve_user_permissions_and_stores(db, org.id, user.id)
    access_token = create_user_access_token(
        settings=settings,
        user_id=user.id,
        organization_id=org.id,
        session_id=session_row.id,
        permissions=list(perms),
        now=now,
    )

    record_audit_event(
        db,
        action="auth.login.succeeded",
        entity_type="auth_session",
        actor_type="user",
        actor_id=user.id,
        organization_id=org.id,
        entity_id=session_row.id,
        request_id=request_id,
    )
    db.commit()

    return ok_response(
        {
            "access_token": access_token,
            "token_type": "Bearer",
            "expires_in": settings.access_token_expire_seconds,
            "refresh_token": raw_refresh_token,
            "user": {
                "id": user.id,
                "display_name": user.display_name,
                "email": user.email,
                "status": user.status,
            },
            "organization": {
                "id": org.id,
                "code": org.code,
                "name": org.name,
            },
            "permissions": sorted(perms),
            "available_stores": _build_available_stores(db, org.id, store_ids),
        },
        request_id=request_id,
    )


@router.post("/refresh")
def refresh_token(
    body: RefreshTokenRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    token_hash = hash_opaque_secret(body.refresh_token.strip())
    session_row = (
        db.query(AuthSession)
        .filter(AuthSession.refresh_token_hash == token_hash)
        .first()
    )
    if session_row is None:
        raise UnauthorizedError(
            code="INVALID_REFRESH_TOKEN", message="Refresh token is invalid."
        )

    set_rls_tenant_context(db, session_row.organization_id)
    now = datetime.now(timezone.utc)

    # Detect refresh-token reuse -> revoke entire token family!
    if session_row.consumed_at is not None:
        family_sessions = (
            db.query(AuthSession)
            .filter(
                AuthSession.organization_id == session_row.organization_id,
                AuthSession.token_family_id == session_row.token_family_id,
                AuthSession.revoked_at.is_(None),
            )
            .all()
        )
        for fam_sess in family_sessions:
            fam_sess.revoked_at = now
            fam_sess.revoke_reason = "refresh_token_reuse_detected"

        record_audit_event(
            db,
            action="auth.refresh_token.reuse_detected",
            entity_type="auth_session",
            actor_type="user",
            actor_id=session_row.user_id,
            organization_id=session_row.organization_id,
            entity_id=session_row.id,
            request_id=request_id,
            metadata={"token_family_id": session_row.token_family_id},
        )
        db.commit()
        raise UnauthorizedError(
            code="REFRESH_TOKEN_REUSED",
            message="Refresh token reuse detected; session family has been revoked.",
        )

    if session_row.revoked_at is not None:
        raise UnauthorizedError(
            code="SESSION_REVOKED", message="Session has been revoked."
        )

    expires_utc = (
        session_row.expires_at.replace(tzinfo=timezone.utc)
        if session_row.expires_at.tzinfo is None
        else session_row.expires_at.astimezone(timezone.utc)
    )
    if now >= expires_utc:
        raise UnauthorizedError(
            code="REFRESH_TOKEN_EXPIRED", message="Refresh token has expired."
        )

    user = (
        db.query(User)
        .filter(
            User.organization_id == session_row.organization_id,
            User.id == session_row.user_id,
            User.deleted_at.is_(None),
        )
        .first()
    )
    if user is None or user.status != "active":
        raise UnauthorizedError(
            code="USER_INACTIVE", message="User account is no longer active."
        )

    # Rotate refresh token within the same family
    session_row.consumed_at = now
    new_raw_refresh = generate_opaque_secret(prefix="rt")
    new_session = AuthSession(
        organization_id=session_row.organization_id,
        user_id=user.id,
        token_family_id=session_row.token_family_id,
        refresh_token_hash=hash_opaque_secret(new_raw_refresh),
        issued_at=now,
        expires_at=now + timedelta(days=settings.refresh_token_expire_days),
    )
    db.add(new_session)
    db.flush()

    perms, _, _ = resolve_user_permissions_and_stores(
        db, session_row.organization_id, user.id
    )
    access_token = create_user_access_token(
        settings=settings,
        user_id=user.id,
        organization_id=session_row.organization_id,
        session_id=new_session.id,
        permissions=list(perms),
        now=now,
    )
    db.commit()

    return ok_response(
        {
            "access_token": access_token,
            "token_type": "Bearer",
            "expires_in": settings.access_token_expire_seconds,
            "refresh_token": new_raw_refresh,
        },
        request_id=request_id,
    )


@router.post("/logout")
def logout(
    principal: UserPrincipal = Depends(get_current_user),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    now = datetime.now(timezone.utc)
    if principal.session_id:
        current_sess = (
            db.query(AuthSession)
            .filter(
                AuthSession.organization_id == principal.organization.id,
                AuthSession.id == principal.session_id,
            )
            .first()
        )
        if current_sess is not None:
            family_rows = (
                db.query(AuthSession)
                .filter(
                    AuthSession.organization_id == principal.organization.id,
                    AuthSession.token_family_id == current_sess.token_family_id,
                    AuthSession.revoked_at.is_(None),
                )
                .all()
            )
            for row in family_rows:
                row.revoked_at = now
                row.revoke_reason = "user_logout"

    record_audit_event(
        db,
        action="auth.logout",
        entity_type="user",
        actor_type="user",
        actor_id=principal.user.id,
        organization_id=principal.organization.id,
        entity_id=principal.user.id,
        request_id=request_id,
    )
    db.commit()
    return ok_response({"logged_out": True}, request_id=request_id)


@router.get("/me")
def get_me(
    principal: UserPrincipal = Depends(get_current_user),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    return ok_response(
        {
            "user": {
                "id": principal.user.id,
                "display_name": principal.user.display_name,
                "email": principal.user.email,
                "phone": principal.user.phone,
                "status": principal.user.status,
            },
            "organization": {
                "id": principal.organization.id,
                "code": principal.organization.code,
                "name": principal.organization.name,
            },
            "permissions": sorted(principal.permissions),
            "available_stores": _build_available_stores(
                db, principal.organization.id, principal.authorized_store_ids
            ),
        },
        request_id=request_id,
    )


@router.post("/change-password")
def change_password(
    body: ChangePasswordRequest,
    principal: UserPrincipal = Depends(get_current_user),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    if not verify_password(body.current_password, principal.user.password_hash):
        raise UnauthorizedError(
            code="INVALID_CURRENT_PASSWORD",
            message="Current password is incorrect.",
        )

    principal.user.password_hash = hash_password(body.new_password)
    record_audit_event(
        db,
        action="user.password.changed",
        entity_type="user",
        actor_type="user",
        actor_id=principal.user.id,
        organization_id=principal.organization.id,
        entity_id=principal.user.id,
        request_id=request_id,
    )
    db.commit()
    return ok_response({"password_changed": True}, request_id=request_id)

