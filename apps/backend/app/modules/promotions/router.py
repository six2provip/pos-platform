"""Variant-level product promotions API (`/api/v1/promotions/*`)."""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy.orm import Session, selectinload

from app.api.deps import (
    Principal,
    UserPrincipal,
    get_current_principal,
    get_db,
    get_request_id,
    require_permission,
)
from app.core.envelope import ok_response
from app.core.exceptions import NotFoundError, ValidationAppError
from app.core.money import format_decimal, to_decimal
from app.infrastructure.models import Product, ProductVariant, Promotion, PromotionItem
from app.modules.audit.service import record_audit_event

router = APIRouter(prefix="/promotions", tags=["Promotions"])


def compute_promo_price(
    base_price: Decimal, discount_type: str, discount_value: Decimal
) -> Decimal:
    if discount_type == "percentage":
        pct = min(max(discount_value, Decimal("0")), Decimal("100"))
        discounted = base_price * (Decimal("100") - pct) / Decimal("100")
        return max(Decimal("0.00"), discounted.quantize(Decimal("1")))
    if discount_type == "fixed":
        return max(Decimal("0.00"), base_price - discount_value)
    if discount_type == "override_price":
        return max(Decimal("0.00"), discount_value)
    return base_price


def serialize_promotion(promo: Promotion, db: Session) -> Dict[str, Any]:
    variant_ids = [item.variant_id for item in promo.items]
    product_ids = list({item.product_id for item in promo.items})

    variants_by_id: Dict[str, ProductVariant] = {}
    if variant_ids:
        variants_by_id = {
            v.id: v
            for v in db.query(ProductVariant)
            .filter(ProductVariant.id.in_(variant_ids))
            .all()
        }

    products_by_id: Dict[str, Product] = {}
    if product_ids:
        products_by_id = {
            p.id: p
            for p in db.query(Product).filter(Product.id.in_(product_ids)).all()
        }

    serialized_items: List[Dict[str, Any]] = []
    for item in promo.items:
        prod = products_by_id.get(item.product_id)
        var = variants_by_id.get(item.variant_id)
        base_price = var.default_price if var else Decimal("0.00")
        promo_price = compute_promo_price(
            base_price, item.discount_type, item.discount_value
        )
        serialized_items.append(
            {
                "id": item.id,
                "product_id": item.product_id,
                "variant_id": item.variant_id,
                "product_name": prod.name if prod else "Sản phẩm",
                "variant_name": var.variant_name if var else "Mặc định",
                "image_url": prod.image_url if prod else None,
                "base_price": format_decimal(base_price),
                "discount_type": item.discount_type,
                "discount_value": format_decimal(item.discount_value),
                "promo_price": format_decimal(promo_price),
            }
        )

    return {
        "id": promo.id,
        "organization_id": promo.organization_id,
        "name": promo.name,
        "description": promo.description,
        "starts_at": promo.starts_at.isoformat() if promo.starts_at else None,
        "ends_at": promo.ends_at.isoformat() if promo.ends_at else None,
        "store_ids": promo.store_ids_json or [],
        "status": promo.status,
        "items": serialized_items,
        "created_at": promo.created_at.isoformat(),
        "updated_at": promo.updated_at.isoformat(),
    }


class PromotionItemInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    product_id: str
    variant_id: str
    discount_type: str = Field(
        default="percentage", pattern="^(percentage|fixed|override_price)$"
    )
    discount_value: Decimal = Field(ge=Decimal("0"))

    @field_validator("discount_value")
    @classmethod
    def validate_discount_value(cls, v: Decimal, info: Any) -> Decimal:
        dtype = info.data.get("discount_type")
        if dtype == "percentage" and v > Decimal("100"):
            raise ValueError("Percentage discount cannot exceed 100%")
        return to_decimal(v)


class CreatePromotionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=255)
    description: Optional[str] = None
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    store_ids: List[str] = Field(default_factory=list)
    status: str = Field(default="active", pattern="^(active|inactive)$")
    items: List[PromotionItemInput] = Field(default_factory=list)


class UpdatePromotionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = None
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    store_ids: Optional[List[str]] = None
    status: Optional[str] = Field(default=None, pattern="^(active|inactive)$")
    items: Optional[List[PromotionItemInput]] = None


def _validate_items(
    db: Session, org_id: str, items: List[PromotionItemInput]
) -> List[PromotionItemInput]:
    if not items:
        return []
    variant_ids = [it.variant_id for it in items]
    valid_variants = {
        v.id: v
        for v in db.query(ProductVariant)
        .join(Product, Product.id == ProductVariant.product_id)
        .filter(
            ProductVariant.id.in_(variant_ids),
            Product.organization_id == org_id,
            Product.deleted_at.is_(None),
        )
        .all()
    }
    deduped: Dict[str, PromotionItemInput] = {}
    for it in items:
        var = valid_variants.get(it.variant_id)
        if not var:
            raise ValidationAppError(
                f"Variant '{it.variant_id}' not found in organization"
            )
        deduped[it.variant_id] = PromotionItemInput(
            product_id=var.product_id,
            variant_id=var.id,
            discount_type=it.discount_type,
            discount_value=it.discount_value,
        )
    return list(deduped.values())


@router.get("")
def list_promotions(
    status_filter: Optional[str] = Query(default=None, alias="status"),
    principal: Principal = Depends(get_current_principal),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> JSONResponse:
    query = (
        db.query(Promotion)
        .options(selectinload(Promotion.items))
        .filter(
            Promotion.organization_id == principal.organization_id,
            Promotion.deleted_at.is_(None),
        )
    )
    if status_filter in ("active", "inactive"):
        query = query.filter(Promotion.status == status_filter)
    rows = query.order_by(Promotion.created_at.desc()).all()
    return ok_response(
        [serialize_promotion(r, db) for r in rows], request_id=request_id
    )


@router.post("", status_code=status.HTTP_201_CREATED)
def create_promotion(
    payload: CreatePromotionRequest,
    principal: UserPrincipal = Depends(require_permission("catalog:write")),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> JSONResponse:
    if payload.starts_at and payload.ends_at and payload.ends_at < payload.starts_at:
        raise ValidationAppError("End date must be after start date")

    clean_items = _validate_items(db, principal.organization_id, payload.items)

    promo = Promotion(
        organization_id=principal.organization_id,
        name=payload.name.strip(),
        description=payload.description.strip() if payload.description else None,
        starts_at=payload.starts_at,
        ends_at=payload.ends_at,
        store_ids_json=payload.store_ids,
        status=payload.status,
    )
    for it in clean_items:
        promo.items.append(
            PromotionItem(
                product_id=it.product_id,
                variant_id=it.variant_id,
                discount_type=it.discount_type,
                discount_value=it.discount_value,
            )
        )
    db.add(promo)
    db.flush()

    record_audit_event(
        db,
        organization_id=principal.organization_id,
        actor_type="user",
        actor_id=principal.user_id,
        action="promotion.create",
        resource_type="promotion",
        resource_id=promo.id,
        payload={"name": promo.name, "variant_count": len(clean_items)},
    )
    db.commit()
    db.refresh(promo)
    return ok_response(
        serialize_promotion(promo, db),
        request_id=request_id,
        status_code=status.HTTP_201_CREATED,
    )


@router.patch("/{promotion_id}")
def update_promotion(
    promotion_id: str,
    payload: UpdatePromotionRequest,
    principal: UserPrincipal = Depends(require_permission("catalog:write")),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> JSONResponse:
    promo = (
        db.query(Promotion)
        .options(selectinload(Promotion.items))
        .filter(
            Promotion.id == promotion_id,
            Promotion.organization_id == principal.organization_id,
            Promotion.deleted_at.is_(None),
        )
        .first()
    )
    if not promo:
        raise NotFoundError("Promotion not found")

    if payload.name is not None:
        promo.name = payload.name.strip()
    if "description" in payload.model_fields_set:
        promo.description = (
            payload.description.strip() if payload.description else None
        )
    if "starts_at" in payload.model_fields_set:
        promo.starts_at = payload.starts_at
    if "ends_at" in payload.model_fields_set:
        promo.ends_at = payload.ends_at
    if promo.starts_at and promo.ends_at and promo.ends_at < promo.starts_at:
        raise ValidationAppError("End date must be after start date")
    if payload.store_ids is not None:
        promo.store_ids_json = payload.store_ids
    if payload.status is not None:
        promo.status = payload.status

    if payload.items is not None:
        clean_items = _validate_items(db, principal.organization_id, payload.items)
        promo.items.clear()
        db.flush()
        for it in clean_items:
            promo.items.append(
                PromotionItem(
                    product_id=it.product_id,
                    variant_id=it.variant_id,
                    discount_type=it.discount_type,
                    discount_value=it.discount_value,
                )
            )

    record_audit_event(
        db,
        organization_id=principal.organization_id,
        actor_type="user",
        actor_id=principal.user_id,
        action="promotion.update",
        resource_type="promotion",
        resource_id=promo.id,
        payload={"name": promo.name, "status": promo.status},
    )
    db.commit()
    db.refresh(promo)
    return ok_response(serialize_promotion(promo, db), request_id=request_id)


@router.delete("/{promotion_id}")
def delete_promotion(
    promotion_id: str,
    principal: UserPrincipal = Depends(require_permission("catalog:write")),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> JSONResponse:
    promo = (
        db.query(Promotion)
        .filter(
            Promotion.id == promotion_id,
            Promotion.organization_id == principal.organization_id,
            Promotion.deleted_at.is_(None),
        )
        .first()
    )
    if not promo:
        raise NotFoundError("Promotion not found")

    promo.deleted_at = datetime.now(timezone.utc)
    record_audit_event(
        db,
        organization_id=principal.organization_id,
        actor_type="user",
        actor_id=principal.user_id,
        action="promotion.delete",
        resource_type="promotion",
        resource_id=promo.id,
        payload={"name": promo.name},
    )
    db.commit()
    return ok_response({"deleted": True, "id": promo.id}, request_id=request_id)
