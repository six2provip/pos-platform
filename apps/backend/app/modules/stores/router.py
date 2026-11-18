"""Stores API endpoints (`/api/v1/stores/*`).

Reference:
- docs/03-api-specification.md (Section 7.4)
"""

from __future__ import annotations

import secrets
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional
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
from app.infrastructure.models import (
    CatalogChangeLog,
    Device,
    DeviceToken,
    Product,
    ProductCategory,
    ProductImage,
    ProductVariant,
    Store,
    StoreProductConfig,
    StoreSetting,
)
from app.modules.audit.service import record_audit_event
from app.modules.organizations.service import validate_non_secret_settings

router = APIRouter(prefix="/stores", tags=["Stores"])


class CreateStoreRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: Optional[str] = Field(default=None, max_length=50)
    name: str = Field(min_length=1, max_length=200)
    address_line: Optional[str] = Field(default=None, max_length=300)
    phone: Optional[str] = Field(default=None, max_length=40)
    timezone: Optional[str] = Field(default=None, max_length=64)
    currency_code: Optional[str] = Field(default=None, min_length=3, max_length=3)
    status: str = Field(default="active", pattern="^(active|inactive)$")


class UpdateStoreRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    address_line: Optional[str] = Field(default=None, max_length=300)
    phone: Optional[str] = Field(default=None, max_length=40)
    timezone: Optional[str] = Field(default=None, max_length=64)
    status: Optional[str] = Field(default=None, pattern="^(active|inactive)$")


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

    norm_code = (body.code or "").strip().upper()
    if not norm_code:
        norm_code = f"CN-{secrets.token_hex(3).upper()}"
        while (
            db.query(Store)
            .filter(Store.organization_id == org.id, Store.code == norm_code)
            .first()
            is not None
        ):
            norm_code = f"CN-{secrets.token_hex(3).upper()}"
    else:
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
        status=body.status,
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


@router.delete("/{store_id}")
def delete_store(
    store_id: str,
    principal: UserPrincipal = Depends(require_permission("stores.disable")),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    """Delete (archive) a store only if it has no active POS/Kiosk devices."""
    store = verify_store_access(db, principal, requested_store_id=store_id)
    assert store is not None

    active_devices_count = (
        db.query(Device)
        .filter(
            Device.organization_id == principal.organization.id,
            Device.store_id == store.id,
            Device.deleted_at.is_(None),
            Device.status == "active",
        )
        .count()
    )
    if active_devices_count > 0:
        raise ConflictError(
            code="STORE_HAS_ACTIVE_DEVICES",
            message=(
                f"Chi nhánh đang có {active_devices_count} thiết bị hoạt động. "
                "Vui lòng tắt hoặc xóa toàn bộ thiết bị trước khi xóa chi nhánh."
            ),
        )

    now = datetime.now(timezone.utc)
    # Soft-delete any remaining inactive/pending devices of this store
    remaining_devices = (
        db.query(Device)
        .filter(
            Device.organization_id == principal.organization.id,
            Device.store_id == store.id,
            Device.deleted_at.is_(None),
        )
        .all()
    )
    for dev in remaining_devices:
        dev.deleted_at = now
        dev.status = "revoked"
        tokens = (
            db.query(DeviceToken)
            .filter(
                DeviceToken.organization_id == principal.organization.id,
                DeviceToken.device_id == dev.id,
                DeviceToken.revoked_at.is_(None),
            )
            .all()
        )
        for tok in tokens:
            tok.revoked_at = now
            tok.revoke_reason = "store_deleted"

    store.status = "archived"
    store.deleted_at = now
    store.updated_by = principal.user.id

    record_audit_event(
        db,
        action="store.deleted",
        entity_type="store",
        actor_type="user",
        actor_id=principal.user.id,
        organization_id=principal.organization.id,
        store_id=store.id,
        entity_id=store.id,
        request_id=request_id,
        metadata={"code": store.code, "name": store.name},
    )
    db.commit()
    return ok_response({"id": store.id, "deleted": True}, request_id=request_id)


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


class StoreMenuItemConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    product_id: str
    is_available: bool = True
    price_override: Optional[Decimal] = Field(default=None, ge=Decimal("0"))


class UpdateStoreMenuRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: List[StoreMenuItemConfig]


@router.get("/{store_id}/menu")
def get_store_menu(
    store_id: str,
    principal: UserPrincipal = Depends(require_permission("stores.read")),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    """Return all org products with store-specific availability and price overrides."""
    store = verify_store_access(db, principal, requested_store_id=store_id)
    assert store is not None
    org_id = principal.organization.id

    products = (
        db.query(Product)
        .filter(Product.organization_id == org_id, Product.deleted_at.is_(None))
        .order_by(Product.name.asc())
        .all()
    )
    variants = (
        db.query(ProductVariant)
        .filter(ProductVariant.organization_id == org_id, ProductVariant.deleted_at.is_(None))
        .all()
    )
    prod_cats = (
        db.query(ProductCategory)
        .filter(ProductCategory.organization_id == org_id)
        .all()
    )
    prod_imgs = (
        db.query(ProductImage)
        .filter(ProductImage.organization_id == org_id)
        .order_by(ProductImage.is_primary.desc(), ProductImage.sort_order.asc())
        .all()
    )
    configs = (
        db.query(StoreProductConfig)
        .filter(
            StoreProductConfig.organization_id == org_id,
            StoreProductConfig.store_id == store.id,
        )
        .all()
    )

    cfg_map = {c.product_id: c for c in configs}
    cat_map: Dict[str, List[str]] = {}
    for link in prod_cats:
        cat_map.setdefault(link.product_id, []).append(link.category_id)
    img_map: Dict[str, str] = {}
    for im in prod_imgs:
        if im.product_id not in img_map or im.is_primary:
            img_map[im.product_id] = im.image_url

    var_price_map: Dict[str, List[Decimal]] = {}
    for v in variants:
        var_price_map.setdefault(v.product_id, []).append(v.default_price)

    items = []
    for p in products:
        cfg = cfg_map.get(p.id)
        prices = var_price_map.get(p.id, [])
        base_price = min(prices) if prices else Decimal("0")
        items.append(
            {
                "product_id": p.id,
                "code": p.product_code,
                "name": p.name,
                "status": p.status,
                "image_url": img_map.get(p.id),
                "category_ids": cat_map.get(p.id, []),
                "base_price": str(base_price),
                "variant_count": len(prices),
                "is_available": cfg.is_available if cfg is not None else True,
                "price_override": (
                    str(cfg.price_override)
                    if (cfg is not None and cfg.price_override is not None)
                    else None
                ),
            }
        )

    return ok_response(
        {"store_id": store.id, "items": items},
        request_id=request_id,
    )


@router.put("/{store_id}/menu")
def update_store_menu(
    store_id: str,
    body: UpdateStoreMenuRequest,
    principal: UserPrincipal = Depends(require_permission("stores.update")),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    """Bulk update store-level product availability and optional price override."""
    store = verify_store_access(db, principal, requested_store_id=store_id)
    assert store is not None
    org_id = principal.organization.id

    existing_rows = (
        db.query(StoreProductConfig)
        .filter(
            StoreProductConfig.organization_id == org_id,
            StoreProductConfig.store_id == store.id,
        )
        .all()
    )
    existing_map = {r.product_id: r for r in existing_rows}

    valid_prod_ids = {
        p.id
        for p in db.query(Product.id)
        .filter(Product.organization_id == org_id, Product.deleted_at.is_(None))
        .all()
    }

    updated_count = 0
    for item in body.items:
        if item.product_id not in valid_prod_ids:
            continue
        row = existing_map.get(item.product_id)
        if row is None:
            row = StoreProductConfig(
                organization_id=org_id,
                store_id=store.id,
                product_id=item.product_id,
                is_available=item.is_available,
                price_override=item.price_override,
            )
            db.add(row)
        else:
            row.is_available = item.is_available
            row.price_override = item.price_override
        updated_count += 1

    db.flush()
    record_audit_event(
        db,
        action="store.menu.updated",
        entity_type="store",
        actor_type="user",
        actor_id=principal.user.id,
        organization_id=org_id,
        store_id=store.id,
        entity_id=store.id,
        request_id=request_id,
        metadata={"updated_count": updated_count},
    )
    db.commit()
    return ok_response(
        {"store_id": store.id, "updated_count": updated_count},
        request_id=request_id,
    )

