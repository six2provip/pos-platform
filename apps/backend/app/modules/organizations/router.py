"""Organization API endpoints (`/api/v1/organization/*`).

Reference:
- docs/03-api-specification.md (Section 7.3)
"""

from __future__ import annotations

from typing import Any, Dict, Optional
from fastapi import APIRouter, Depends, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.api.deps import UserPrincipal, get_db, get_request_id, get_settings, require_permission
from app.core.config import Settings
from app.core.envelope import ok_response
from app.core.exceptions import NotFoundError
from app.infrastructure.models import CatalogChangeLog, Organization, OrganizationSetting, User
from app.modules.audit.service import record_audit_event
from app.modules.organizations.service import (
    provision_organization,
    validate_non_secret_settings,
)

router = APIRouter(prefix="/organization", tags=["Organization"])


class ProvisionOrganizationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    organization_id: Optional[str] = None
    code: str = Field(..., min_length=2, max_length=60)
    name: str = Field(..., min_length=2, max_length=200)
    admin_email: str = Field(..., min_length=3, max_length=254)
    admin_password: str = Field(..., min_length=8, max_length=128)
    admin_display_name: str = Field(default="Organization Owner", max_length=160)
    initial_store_code: str = Field(default="MAIN-01", max_length=60)
    initial_store_name: str = Field(default="Main Store", max_length=160)
    default_currency: str = Field(default="VND", min_length=3, max_length=3)
    timezone_name: str = Field(default="Asia/Ho_Chi_Minh", max_length=64)
    status: Optional[str] = Field(default="active", pattern="^(active|pending_approval)$")


class UpdateOrganizationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    legal_name: Optional[str] = Field(default=None, max_length=250)
    tax_identifier: Optional[str] = Field(default=None, max_length=80)
    timezone: Optional[str] = Field(default=None, max_length=64)


class UpdateSettingsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    settings: Dict[str, Any]


def _serialize_org(org) -> Dict[str, Any]:
    return {
        "id": org.id,
        "code": org.code,
        "name": org.name,
        "legal_name": org.legal_name,
        "tax_identifier": org.tax_identifier,
        "default_currency": org.default_currency,
        "timezone": org.timezone,
        "status": org.status,
        "created_at": org.created_at.isoformat(),
        "updated_at": org.updated_at.isoformat(),
    }


@router.post("/provision", status_code=status.HTTP_201_CREATED)
def bootstrap_new_organization(
    body: ProvisionOrganizationRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    request_id: str = Depends(get_request_id),
) -> JSONResponse:
    """Provision a new Organization, default roles, Owner user, and initial Store."""
    org, owner, store = provision_organization(
        db,
        settings,
        organization_id=body.organization_id,
        code=body.code,
        name=body.name,
        admin_email=body.admin_email,
        admin_password=body.admin_password,
        admin_display_name=body.admin_display_name,
        initial_store_code=body.initial_store_code,
        initial_store_name=body.initial_store_name,
        default_currency=body.default_currency,
        timezone_name=body.timezone_name,
        status=body.status or "active",
    )
    db.commit()
    return JSONResponse(
        status_code=status.HTTP_201_CREATED,
        content=ok_response(
            {
                "organization": _serialize_org(org),
                "owner_user": {
                    "id": owner.id,
                    "email": owner.email,
                    "display_name": owner.display_name,
                },
                "initial_store": (
                    {
                        "id": store.id,
                        "code": store.code,
                        "name": store.name,
                    }
                    if store
                    else None
                ),
            },
            request_id=request_id,
        ),
    )


class UpdateOrganizationStatusRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: str = Field(..., pattern="^(active|pending_approval|suspended)$")


@router.patch("/{org_id}/status")
def set_organization_status(
    org_id: str,
    body: UpdateOrganizationStatusRequest,
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    """Admin route to approve or suspend an organization."""
    org = db.query(Organization).filter(Organization.id == org_id, Organization.deleted_at.is_(None)).first()
    if org is None:
        raise NotFoundError(code="ORGANIZATION_NOT_FOUND", message="Organization not found")
    org.status = body.status
    db.commit()
    db.refresh(org)
    return ok_response(_serialize_org(org), request_id=request_id)


@router.get("/list-all")
def list_all_organizations(
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    """List organizations for Super Admin review with owner details."""
    orgs = db.query(Organization).filter(Organization.deleted_at.is_(None)).order_by(Organization.created_at.desc()).all()
    results = []
    for o in orgs:
        data = _serialize_org(o)
        owner = db.query(User).filter(User.organization_id == o.id, User.deleted_at.is_(None)).order_by(User.created_at.asc()).first()
        if owner:
            data["owner_email"] = owner.email
            data["owner_name"] = owner.display_name
            data["owner_phone"] = owner.phone
        results.append(data)
    return ok_response(results, request_id=request_id)


@router.get("")
def get_organization(
    principal: UserPrincipal = Depends(require_permission("organization.read")),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    return ok_response(_serialize_org(principal.organization), request_id=request_id)


@router.patch("")
def update_organization(
    body: UpdateOrganizationRequest,
    principal: UserPrincipal = Depends(require_permission("organization.update")),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    org = principal.organization
    changes = body.model_dump(exclude_unset=True)
    for field_name, val in changes.items():
        setattr(org, field_name, val)

    record_audit_event(
        db,
        action="organization.updated",
        entity_type="organization",
        actor_type="user",
        actor_id=principal.user.id,
        organization_id=org.id,
        entity_id=org.id,
        request_id=request_id,
        metadata={"updated_fields": list(changes.keys())},
    )
    db.commit()
    db.refresh(org)
    return ok_response(_serialize_org(org), request_id=request_id)


@router.get("/settings")
def get_organization_settings(
    principal: UserPrincipal = Depends(require_permission("organization.read")),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    org = principal.organization
    setting = (
        db.query(OrganizationSetting)
        .filter(OrganizationSetting.organization_id == org.id)
        .first()
    )
    if setting is None:
        setting = OrganizationSetting(organization_id=org.id, settings={}, version=1)
        db.add(setting)
        db.commit()
        db.refresh(setting)

    return ok_response(
        {
            "organization_id": org.id,
            "version": setting.version,
            "settings": setting.settings,
            "updated_at": setting.updated_at.isoformat(),
        },
        request_id=request_id,
    )


@router.patch("/settings")
def update_organization_settings(
    body: UpdateSettingsRequest,
    principal: UserPrincipal = Depends(require_permission("organization.update")),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    validate_non_secret_settings(body.settings)
    org = principal.organization
    setting = (
        db.query(OrganizationSetting)
        .filter(OrganizationSetting.organization_id == org.id)
        .first()
    )
    if setting is None:
        setting = OrganizationSetting(
            organization_id=org.id, settings=body.settings, version=1
        )
        db.add(setting)
    else:
        merged = dict(setting.settings or {})
        merged.update(body.settings)
        setting.settings = merged
        setting.version += 1

    db.flush()
    db.add(
        CatalogChangeLog(
            organization_id=org.id,
            stream_name="config",
            entity_type="organization_settings",
            change_type="upsert",
            entity_id=setting.id,
            version=setting.version,
            payload={"version": setting.version, "settings": setting.settings},
        )
    )
    record_audit_event(
        db,
        action="organization.settings.updated",
        entity_type="organization_settings",
        actor_type="user",
        actor_id=principal.user.id,
        organization_id=org.id,
        entity_id=setting.id,
        request_id=request_id,
        metadata={"version": setting.version},
    )
    db.commit()
    db.refresh(setting)
    return ok_response(
        {
            "organization_id": org.id,
            "version": setting.version,
            "settings": setting.settings,
            "updated_at": setting.updated_at.isoformat(),
        },
        request_id=request_id,
    )
