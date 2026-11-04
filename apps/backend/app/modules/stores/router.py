"""Stores API endpoints (`/api/v1/stores/*`).

Reference:
- docs/03-api-specification.md (Section 7.4)
"""

from __future__ import annotations

from typing import Any, Dict, Optional
from fastapi import APIRouter, Depends, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.api.deps import (
    Principal,
    UserPrincipal,
    get_current_principal,
    get_db,
    get_request_id,
    get_settings,
    require_permission,
    verify_store_access,
)
from app.core.config import Settings
from app.core.envelope import PaginationMeta, ok_response
from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError
from app.deployment.profile import enforce_store_limit
from app.infrastructure.models import CatalogChangeLog, Store, StoreSetting
from app.modules.audit.service import record_audit_event
from app.modules.organizations.service import validate_non_secret_settings

router = APIRouter(prefix="/stores", tags=["Stores"])


class CreateStoreRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str = Field(min_length=1, max_length=50)
    name: str = Field(min_length=1, max_length=200)
    address_line: Optional[str] = Field(default=None, max_length=300)
    phone: Optional[str] = Field(default=None, max_length=40)
    timezone: Optional[str] = Field(default=None, max_length=64)
    currency_code: Optional[str] = Field(default=None, min_length=3, max_length=3)


class UpdateStoreRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    address_line: Optional[str] = Field(default=None, max_length=300)
    phone: Optional[str] = Field(default=None, max_length=40)
    timezone: Optional[str] = Field(default=None, max_length=64)


class UpdateStoreSettingsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    settings: Dict[str, Any]


def _serialize_store(store: Store) -> Dict[str, Any]:
    return {
        "id": store.id,
        "organization_id": store.organization_id,
        "code": store.code,
        "name": store.name,
        "address_line": store.address_line,
        "phone": store.phone,
        "timezone": store.timezone,
        "currency_code": store.currency_code,
        "status": store.status,
        "created_at": store.created_at.isoformat(),
        "updated_at": store.updated_at.isoformat(),
    }


@router.get("")
def list_stores(
    principal: UserPrincipal = Depends(require_permission("stores.read")),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    query = db.query(Store).filter(
        Store.organization_id == principal.organization.id,
        Store.deleted_at.is_(None),
    )
    if not principal.all_stores_access:
        if not principal.authorized_store_ids:
            return ok_response(
                [],
                request_id=request_id,
                meta=PaginationMeta(page_size=50, next_cursor=None, has_more=False),
            )
        query = query.filter(Store.id.in_(principal.authorized_store_ids))

    stores = query.order_by(Store.created_at.desc(), Store.id.desc()).all()
    return ok_response(
        [_serialize_store(s) for s in stores],
        request_id=request_id,
        meta=PaginationMeta(page_size=50, next_cursor=None, has_more=False),
    )


@router.post("", status_code=status.HTTP_201_CREATED)
def create_store(
    body: CreateStoreRequest,
    principal: UserPrincipal = Depends(require_permission("stores.create")),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    request_id: str = Depends(get_request_id),
) -> JSONResponse:
    org = principal.organization
    enforce_store_limit(db, settings, org)

    norm_code = body.code.strip().upper()
    existing = (
        db.query(Store)
        .filter(Store.organization_id == org.id, Store.code == norm_code)
        .first()
    )
    if existing is not None:
        raise ConflictError(
            code="STORE_CODE_EXISTS",
            message=f"Store with code '{norm_code}' already exists in this organization.",
        )

    store = Store(
        organization_id=org.id,
        code=norm_code,
        name=body.name.strip(),
        address_line=body.address_line,
        phone=body.phone,
        timezone=body.timezone or org.timezone,
        currency_code=(body.currency_code or org.default_currency).upper(),
        status="active",
        created_by=principal.user.id,
        updated_by=principal.user.id,
    )
    db.add(store)
    db.flush()

    db.add(
        StoreSetting(
            organization_id=org.id,
            store_id=store.id,
            settings={},
            version=1,
        )
    )
    record_audit_event(
        db,
        action="store.created",
        entity_type="store",
        actor_type="user",
        actor_id=principal.user.id,
        organization_id=org.id,
        store_id=store.id,
        entity_id=store.id,
        request_id=request_id,
        metadata={"code": store.code, "name": store.name},
    )
    db.commit()
    db.refresh(store)
    return JSONResponse(
        status_code=status.HTTP_201_CREATED,
        content=ok_response(_serialize_store(store), request_id=request_id),
    )


@router.get("/{store_id}")
def get_store(
    store_id: str,
    principal: Principal = Depends(get_current_principal),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    if isinstance(principal, UserPrincipal) and "stores.read" not in principal.permissions:
        raise ForbiddenError(
            code="INSUFFICIENT_PERMISSIONS",
            message="Required permission 'stores.read' is not granted.",
        )
    store = verify_store_access(db, principal, requested_store_id=store_id)
    assert store is not None
    return ok_response(_serialize_store(store), request_id=request_id)


@router.patch("/{store_id}")
def update_store(
    store_id: str,
    body: UpdateStoreRequest,
    principal: UserPrincipal = Depends(require_permission("stores.update")),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    store = verify_store_access(db, principal, requested_store_id=store_id)
    assert store is not None
    changes = body.model_dump(exclude_unset=True)
    for k, v in changes.items():
        setattr(store, k, v)
    store.updated_by = principal.user.id

    record_audit_event(
        db,
        action="store.updated",
        entity_type="store",
        actor_type="user",
        actor_id=principal.user.id,
        organization_id=principal.organization.id,
        store_id=store.id,
        entity_id=store.id,
        request_id=request_id,
        metadata={"updated_fields": list(changes.keys())},
    )
    db.commit()
    db.refresh(store)
    return ok_response(_serialize_store(store), request_id=request_id)


@router.post("/{store_id}/deactivate")
def deactivate_store(
    store_id: str,
    principal: UserPrincipal = Depends(require_permission("stores.disable")),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    store = verify_store_access(db, principal, requested_store_id=store_id)
    assert store is not None
    store.status = "inactive"
    store.updated_by = principal.user.id

    record_audit_event(
        db,
        action="store.deactivated",
        entity_type="store",
        actor_type="user",
        actor_id=principal.user.id,
        organization_id=principal.organization.id,
        store_id=store.id,
        entity_id=store.id,
        request_id=request_id,
    )
    db.commit()
    db.refresh(store)
    return ok_response(_serialize_store(store), request_id=request_id)


@router.get("/{store_id}/settings")
def get_store_settings(
    store_id: str,
    principal: Principal = Depends(get_current_principal),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    if isinstance(principal, UserPrincipal) and "stores.read" not in principal.permissions:
        raise ForbiddenError(
            code="INSUFFICIENT_PERMISSIONS",
            message="Required permission 'stores.read' is not granted.",
        )
    store = verify_store_access(db, principal, requested_store_id=store_id)
    assert store is not None
    setting = (
        db.query(StoreSetting)
        .filter(
            StoreSetting.organization_id == principal.organization.id,
            StoreSetting.store_id == store.id,
        )
        .first()
    )
    if setting is None:
        setting = StoreSetting(
            organization_id=principal.organization.id,
            store_id=store.id,
            settings={},
            version=1,
        )
        db.add(setting)
        db.commit()
        db.refresh(setting)

    return ok_response(
        {
            "store_id": store.id,
            "version": setting.version,
            "settings": setting.settings,
            "updated_at": setting.updated_at.isoformat(),
        },
        request_id=request_id,
    )


@router.patch("/{store_id}/settings")
def update_store_settings(
    store_id: str,
    body: UpdateStoreSettingsRequest,
    principal: UserPrincipal = Depends(require_permission("stores.update")),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    validate_non_secret_settings(body.settings)
    store = verify_store_access(db, principal, requested_store_id=store_id)
    assert store is not None
    setting = (
        db.query(StoreSetting)
        .filter(
            StoreSetting.organization_id == principal.organization.id,
            StoreSetting.store_id == store.id,
        )
        .first()
    )
    if setting is None:
        setting = StoreSetting(
            organization_id=principal.organization.id,
            store_id=store.id,
            settings=body.settings,
            version=1,
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
            organization_id=principal.organization.id,
            stream_name="config",
            entity_type="store_settings",
            change_type="upsert",
            entity_id=setting.id,
            version=setting.version,
            payload={
                "store_id": store.id,
                "version": setting.version,
                "settings": setting.settings,
            },
        )
    )
    record_audit_event(
        db,
        action="store.settings.updated",
        entity_type="store_settings",
        actor_type="user",
        actor_id=principal.user.id,
        organization_id=principal.organization.id,
        store_id=store.id,
        entity_id=setting.id,
        request_id=request_id,
        metadata={"version": setting.version},
    )
    db.commit()
    db.refresh(setting)
    return ok_response(
        {
            "store_id": store.id,
            "version": setting.version,
            "settings": setting.settings,
            "updated_at": setting.updated_at.isoformat(),
        },
        request_id=request_id,
    )

