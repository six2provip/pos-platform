"""Users, Roles, and Permissions API endpoints (`/api/v1/users/*`, `/api/v1/roles/*`, `/api/v1/permissions`).

Reference:
- docs/03-api-specification.md (Section 7.5)
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.api.deps import (
    UserPrincipal,
    get_db,
    get_request_id,
    require_permission,
)
from app.core.envelope import PaginationMeta, ok_response
from app.core.exceptions import (
    ConflictError,
    ForbiddenError,
    NotFoundError,
    ValidationAppError,
)
from app.core.security import hash_password
from app.infrastructure.models import (
    OrganizationMembership,
    Permission,
    Role,
    RolePermission,
    Store,
    User,
    UserRoleAssignment,
    UserStoreAssignment,
)
from app.modules.audit.service import record_audit_event

router = APIRouter(tags=["Users & RBAC"])


class CreateUserRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: Optional[str] = Field(default=None, max_length=254)
    phone: Optional[str] = Field(default=None, max_length=40)
    display_name: str = Field(min_length=1, max_length=160)
    password: str = Field(min_length=8, max_length=256)
    role_ids: List[str] = Field(default_factory=list)
    store_ids: List[str] = Field(default_factory=list)


class UpdateUserRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    display_name: Optional[str] = Field(default=None, min_length=1, max_length=160)
    phone: Optional[str] = Field(default=None, max_length=40)
    store_ids: Optional[List[str]] = None


class CreateRoleRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str = Field(min_length=1, max_length=60)
    name: str = Field(min_length=1, max_length=120)
    description: Optional[str] = None
    all_stores_access: bool = False
    permission_codes: List[str] = Field(default_factory=list)


class UpdateRoleRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    description: Optional[str] = None
    all_stores_access: Optional[bool] = None


class SetRolePermissionsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    permission_codes: List[str]


class AssignRoleRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role_id: str


def _serialize_user(db: Session, user: User) -> Dict[str, Any]:
    role_rows = (
        db.query(Role)
        .join(
            UserRoleAssignment,
            (UserRoleAssignment.role_id == Role.id)
            & (UserRoleAssignment.organization_id == Role.organization_id),
        )
        .filter(
            UserRoleAssignment.organization_id == user.organization_id,
            UserRoleAssignment.user_id == user.id,
        )
        .all()
    )
    store_rows = (
        db.query(UserStoreAssignment.store_id)
        .filter(
            UserStoreAssignment.organization_id == user.organization_id,
            UserStoreAssignment.user_id == user.id,
        )
        .all()
    )
    return {
        "id": user.id,
        "organization_id": user.organization_id,
        "email": user.email,
        "phone": user.phone,
        "display_name": user.display_name,
        "status": user.status,
        "roles": [{"id": r.id, "code": r.code, "name": r.name} for r in role_rows],
        "store_ids": [r[0] for r in store_rows],
        "created_at": user.created_at.isoformat(),
    }


def _serialize_role(db: Session, role: Role) -> Dict[str, Any]:
    perms = (
        db.query(Permission.code)
        .join(RolePermission, RolePermission.permission_id == Permission.id)
        .filter(RolePermission.role_id == role.id)
        .all()
    )
    return {
        "id": role.id,
        "organization_id": role.organization_id,
        "code": role.code,
        "name": role.name,
        "description": role.description,
        "is_system": role.is_system,
        "all_stores_access": role.all_stores_access,
        "permissions": sorted(r[0] for r in perms),
    }


def _ensure_grantable_permissions(
    principal: UserPrincipal, permission_codes: List[str]
) -> None:
    """Ensure the caller cannot grant permissions they do not possess themselves."""
    missing = set(permission_codes) - principal.permissions
    if missing:
        raise ForbiddenError(
            code="CANNOT_GRANT_UNOWNED_PERMISSION",
            message=f"You cannot grant permissions you do not possess: {sorted(missing)}",
        )


@router.get("/users")
def list_users(
    principal: UserPrincipal = Depends(require_permission("users.read")),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    users = (
        db.query(User)
        .filter(
            User.organization_id == principal.organization.id,
            User.deleted_at.is_(None),
        )
        .order_by(User.created_at.desc())
        .all()
    )
    return ok_response(
        [_serialize_user(db, u) for u in users],
        request_id=request_id,
        meta=PaginationMeta(page_size=50, next_cursor=None, has_more=False),
    )


@router.post("/users", status_code=status.HTTP_201_CREATED)
def create_user(
    body: CreateUserRequest,
    principal: UserPrincipal = Depends(require_permission("users.create")),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> JSONResponse:
    org_id = principal.organization.id
    if not body.email and not body.phone:
        raise ValidationAppError(
            code="LOGIN_IDENTIFIER_REQUIRED",
            message="At least one of email or phone must be provided.",
        )

    norm_email = body.email.strip().lower() if body.email else None
    norm_phone = body.phone.strip() if body.phone else None

    if norm_email:
        exists = (
            db.query(User)
            .filter(User.organization_id == org_id, User.email == norm_email)
            .first()
        )
        if exists:
            raise ConflictError(
                code="USER_EMAIL_EXISTS",
                message=f"User with email '{norm_email}' already exists in this organization.",
            )

    user = User(
        organization_id=org_id,
        email=norm_email,
        phone=norm_phone,
        display_name=body.display_name.strip(),
        password_hash=hash_password(body.password),
        status="active",
        created_by=principal.user.id,
        updated_by=principal.user.id,
    )
    db.add(user)
    db.flush()

    db.add(
        OrganizationMembership(
            organization_id=org_id,
            user_id=user.id,
            membership_status="active",
        )
    )

    for role_id in set(body.role_ids):
        role = (
            db.query(Role)
            .filter(Role.organization_id == org_id, Role.id == role_id)
            .first()
        )
        if role is None:
            raise NotFoundError(
                code="ROLE_NOT_FOUND", message=f"Role '{role_id}' not found."
            )
        role_perms = [
            r[0]
            for r in db.query(Permission.code)
            .join(RolePermission, RolePermission.permission_id == Permission.id)
            .filter(RolePermission.role_id == role.id)
            .all()
        ]
        _ensure_grantable_permissions(principal, role_perms)
        db.add(
            UserRoleAssignment(
                organization_id=org_id,
                user_id=user.id,
                role_id=role.id,
                assigned_by=principal.user.id,
            )
        )

    for store_id in set(body.store_ids):
        store = (
            db.query(Store)
            .filter(Store.organization_id == org_id, Store.id == store_id)
            .first()
        )
        if store is None:
            raise NotFoundError(
                code="STORE_NOT_FOUND", message=f"Store '{store_id}' not found."
            )
        db.add(
            UserStoreAssignment(
                organization_id=org_id,
                user_id=user.id,
                store_id=store.id,
            )
        )

    record_audit_event(
        db,
        action="user.created",
        entity_type="user",
        actor_type="user",
        actor_id=principal.user.id,
        organization_id=org_id,
        entity_id=user.id,
        request_id=request_id,
        metadata={"email": norm_email, "role_ids": body.role_ids},
    )
    db.commit()
    db.refresh(user)
    return JSONResponse(
        status_code=status.HTTP_201_CREATED,
        content=ok_response(_serialize_user(db, user), request_id=request_id),
    )


@router.get("/users/{user_id}")
def get_user(
    user_id: str,
    principal: UserPrincipal = Depends(require_permission("users.read")),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    user = (
        db.query(User)
        .filter(
            User.organization_id == principal.organization.id,
            User.id == user_id,
            User.deleted_at.is_(None),
        )
        .first()
    )
    if user is None:
        raise NotFoundError(code="USER_NOT_FOUND", message="User not found.")
    return ok_response(_serialize_user(db, user), request_id=request_id)


@router.patch("/users/{user_id}")
def update_user(
    user_id: str,
    body: UpdateUserRequest,
    principal: UserPrincipal = Depends(require_permission("users.update")),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    org_id = principal.organization.id
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
        raise NotFoundError(code="USER_NOT_FOUND", message="User not found.")

    if body.display_name is not None:
        user.display_name = body.display_name.strip()
    if body.phone is not None:
        user.phone = body.phone.strip()
    if body.store_ids is not None:
        db.query(UserStoreAssignment).filter(
            UserStoreAssignment.organization_id == org_id,
            UserStoreAssignment.user_id == user.id,
        ).delete()
        for store_id in set(body.store_ids):
            store = (
                db.query(Store)
                .filter(Store.organization_id == org_id, Store.id == store_id)
                .first()
            )
            if store is None:
                raise NotFoundError(
                    code="STORE_NOT_FOUND", message=f"Store '{store_id}' not found."
                )
            db.add(
                UserStoreAssignment(
                    organization_id=org_id,
                    user_id=user.id,
                    store_id=store.id,
                )
            )

    user.updated_by = principal.user.id
    record_audit_event(
        db,
        action="user.updated",
        entity_type="user",
        actor_type="user",
        actor_id=principal.user.id,
        organization_id=org_id,
        entity_id=user.id,
        request_id=request_id,
    )
    db.commit()
    db.refresh(user)
    return ok_response(_serialize_user(db, user), request_id=request_id)


@router.post("/users/{user_id}/disable")
def disable_user(
    user_id: str,
    principal: UserPrincipal = Depends(require_permission("users.disable")),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    if user_id == principal.user.id:
        raise ConflictError(
            code="SELF_DISABLE_FORBIDDEN",
            message="You cannot disable your own active administrator account.",
        )

    org_id = principal.organization.id
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
        raise NotFoundError(code="USER_NOT_FOUND", message="User not found.")

    user.status = "disabled"
    user.updated_by = principal.user.id
    record_audit_event(
        db,
        action="user.disabled",
        entity_type="user",
        actor_type="user",
        actor_id=principal.user.id,
        organization_id=org_id,
        entity_id=user.id,
        request_id=request_id,
    )
    db.commit()
    db.refresh(user)
    return ok_response(_serialize_user(db, user), request_id=request_id)


@router.get("/roles")
def list_roles(
    principal: UserPrincipal = Depends(require_permission("roles.read")),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    roles = (
        db.query(Role)
        .filter(Role.organization_id == principal.organization.id)
        .order_by(Role.code.asc())
        .all()
    )
    return ok_response([_serialize_role(db, r) for r in roles], request_id=request_id)


@router.post("/roles", status_code=status.HTTP_201_CREATED)
def create_role(
    body: CreateRoleRequest,
    principal: UserPrincipal = Depends(require_permission("roles.update")),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> JSONResponse:
    _ensure_grantable_permissions(principal, body.permission_codes)
    org_id = principal.organization.id
    norm_code = body.code.strip().lower()
    if (
        db.query(Role)
        .filter(Role.organization_id == org_id, Role.code == norm_code)
        .first()
    ):
        raise ConflictError(
            code="ROLE_CODE_EXISTS",
            message=f"Role with code '{norm_code}' already exists.",
        )

    role = Role(
        organization_id=org_id,
        code=norm_code,
        name=body.name.strip(),
        description=body.description,
        is_system=False,
        all_stores_access=body.all_stores_access,
    )
    db.add(role)
    db.flush()

    if body.permission_codes:
        perms = (
            db.query(Permission)
            .filter(Permission.code.in_(set(body.permission_codes)))
            .all()
        )
        found_codes = {p.code for p in perms}
        unknown = set(body.permission_codes) - found_codes
        if unknown:
            raise ValidationAppError(
                code="UNKNOWN_PERMISSION_CODE",
                message=f"Unknown permission codes: {sorted(unknown)}",
            )
        for p in perms:
            db.add(RolePermission(role_id=role.id, permission_id=p.id))

    record_audit_event(
        db,
        action="role.created",
        entity_type="role",
        actor_type="user",
        actor_id=principal.user.id,
        organization_id=org_id,
        entity_id=role.id,
        request_id=request_id,
        metadata={"code": role.code},
    )
    db.commit()
    db.refresh(role)
    return JSONResponse(
        status_code=status.HTTP_201_CREATED,
        content=ok_response(_serialize_role(db, role), request_id=request_id),
    )


@router.put("/roles/{role_id}/permissions")
def set_role_permissions(
    role_id: str,
    body: SetRolePermissionsRequest,
    principal: UserPrincipal = Depends(require_permission("roles.update")),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    _ensure_grantable_permissions(principal, body.permission_codes)
    org_id = principal.organization.id
    role = (
        db.query(Role)
        .filter(Role.organization_id == org_id, Role.id == role_id)
        .first()
    )
    if role is None:
        raise NotFoundError(code="ROLE_NOT_FOUND", message="Role not found.")
    if role.is_system and role.code == "org_owner":
        raise ForbiddenError(
            code="SYSTEM_ROLE_PROTECTED",
            message="The system 'org_owner' role permissions cannot be modified.",
        )

    perms = (
        db.query(Permission)
        .filter(Permission.code.in_(set(body.permission_codes)))
        .all()
    )
    if len(perms) != len(set(body.permission_codes)):
        raise ValidationAppError(
            code="UNKNOWN_PERMISSION_CODE",
            message="One or more permission codes are invalid.",
        )

    db.query(RolePermission).filter(RolePermission.role_id == role.id).delete()
    for p in perms:
        db.add(RolePermission(role_id=role.id, permission_id=p.id))

    record_audit_event(
        db,
        action="role.permissions.updated",
        entity_type="role",
        actor_type="user",
        actor_id=principal.user.id,
        organization_id=org_id,
        entity_id=role.id,
        request_id=request_id,
    )
    db.commit()
    return ok_response(_serialize_role(db, role), request_id=request_id)


@router.post("/users/{user_id}/roles")
def assign_role_to_user(
    user_id: str,
    body: AssignRoleRequest,
    principal: UserPrincipal = Depends(require_permission("roles.assign")),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    org_id = principal.organization.id
    user = (
        db.query(User)
        .filter(User.organization_id == org_id, User.id == user_id)
        .first()
    )
    if user is None:
        raise NotFoundError(code="USER_NOT_FOUND", message="User not found.")

    role = (
        db.query(Role)
        .filter(Role.organization_id == org_id, Role.id == body.role_id)
        .first()
    )
    if role is None:
        raise NotFoundError(code="ROLE_NOT_FOUND", message="Role not found.")

    role_perms = [
        r[0]
        for r in db.query(Permission.code)
        .join(RolePermission, RolePermission.permission_id == Permission.id)
        .filter(RolePermission.role_id == role.id)
        .all()
    ]
    _ensure_grantable_permissions(principal, role_perms)

    existing = (
        db.query(UserRoleAssignment)
        .filter(
            UserRoleAssignment.organization_id == org_id,
            UserRoleAssignment.user_id == user.id,
            UserRoleAssignment.role_id == role.id,
        )
        .first()
    )
    if existing is None:
        db.add(
            UserRoleAssignment(
                organization_id=org_id,
                user_id=user.id,
                role_id=role.id,
                assigned_by=principal.user.id,
            )
        )
        record_audit_event(
            db,
            action="user.role.assigned",
            entity_type="user",
            actor_type="user",
            actor_id=principal.user.id,
            organization_id=org_id,
            entity_id=user.id,
            request_id=request_id,
            metadata={"role_id": role.id, "role_code": role.code},
        )
        db.commit()

    return ok_response(_serialize_user(db, user), request_id=request_id)


@router.get("/permissions")
def list_permissions(
    principal: UserPrincipal = Depends(require_permission("roles.read")),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    perms = db.query(Permission).order_by(Permission.code.asc()).all()
    return ok_response(
        [
            {"id": p.id, "code": p.code, "module": p.module, "description": p.description}
            for p in perms
        ],
        request_id=request_id,
    )

