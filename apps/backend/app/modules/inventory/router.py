"""Inventory and Stock Adjustment API endpoints (`/api/v1/inventory/*`).

Reference:
- docs/02-database-schema.md (Section 7.5, 13.2)
- docs/03-api-specification.md (Section 7.8)
"""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, Header, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.api.deps import (
    Principal,
    UserPrincipal,
    check_or_claim_idempotency,
    complete_idempotency_record,
    get_current_principal,
    get_db,
    get_request_id,
    require_permission,
    verify_store_access,
)
from app.core.envelope import PaginationMeta, ok_response
from app.core.exceptions import (
    ConflictError,
    ForbiddenError,
    NotFoundError,
    ValidationAppError,
)
from app.core.money import format_decimal, to_decimal
from app.infrastructure.models import (
    Inventory,
    ProductVariant,
    StockAdjustment,
    StockAdjustmentItem,
    StockMovement,
    StoreCounter,
)
from app.modules.audit.service import record_audit_event

router = APIRouter(prefix="/inventory", tags=["Inventory"])


def next_store_document_number(
    db: Session,
    organization_id: str,
    store_id: str,
    store_code: str,
    counter_type: str,
    prefix: str,
) -> str:
    """Concurrency-safe per-Store document number generator."""
    counter = (
        db.query(StoreCounter)
        .filter(
            StoreCounter.organization_id == organization_id,
            StoreCounter.store_id == store_id,
            StoreCounter.counter_type == counter_type,
        )
        .with_for_update()
        .first()
    )
    if counter is None:
        counter = StoreCounter(
            organization_id=organization_id,
            store_id=store_id,
            counter_type=counter_type,
            current_value=1,
        )
        db.add(counter)
        db.flush()
    else:
        counter.current_value += 1
        db.flush()

    date_part = datetime.now(timezone.utc).strftime("%Y%m%d")
    clean_store = "".join(c for c in store_code.upper() if c.isalnum())
    return f"{prefix}{clean_store}-{date_part}-{counter.current_value:06d}"


def apply_stock_movement(
    db: Session,
    *,
    organization_id: str,
    store_id: str,
    product_variant_id: str,
    movement_type: str,
    quantity_delta: Decimal,
    source_type: str,
    source_id: str,
    idempotency_key: Optional[str] = None,
    created_by: Optional[str] = None,
    allow_negative_stock: bool = True,
    occurred_at: Optional[datetime] = None,
) -> StockMovement:
    """Atomically update `inventories` and append an immutable `stock_movements` row."""
    inv = (
        db.query(Inventory)
        .filter(
            Inventory.organization_id == organization_id,
            Inventory.store_id == store_id,
            Inventory.product_variant_id == product_variant_id,
        )
        .with_for_update()
        .first()
    )
    if inv is None:
        inv = Inventory(
            organization_id=organization_id,
            store_id=store_id,
            product_variant_id=product_variant_id,
            on_hand_quantity=Decimal("0.0000"),
            reserved_quantity=Decimal("0.0000"),
        )
        db.add(inv)
        db.flush()

    new_on_hand = inv.on_hand_quantity + quantity_delta
    available_after = new_on_hand - inv.reserved_quantity
    if quantity_delta < Decimal("0") and not allow_negative_stock and available_after < Decimal("0"):
        raise ConflictError(
            code="ORDER_STOCK_CONFLICT",
            message=f"Insufficient stock for product_variant_id '{product_variant_id}'.",
            details=[
                {
                    "field": "product_variant_id",
                    "reason": "INSUFFICIENT_STOCK",
                }
            ],
        )

    inv.on_hand_quantity = new_on_hand
    now = datetime.now(timezone.utc)
    movement = StockMovement(
        organization_id=organization_id,
        store_id=store_id,
        product_variant_id=product_variant_id,
        movement_type=movement_type,
        quantity_delta=quantity_delta,
        quantity_after=new_on_hand,
        source_type=source_type,
        source_id=source_id,
        idempotency_key=idempotency_key,
        occurred_at=occurred_at or now,
        created_at=now,
        created_by=created_by,
    )
    db.add(movement)
    db.flush()
    return movement


class AdjustmentItemInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    product_variant_id: str
    quantity_delta: str
    note: Optional[str] = Field(default=None, max_length=240)


class CreateStockAdjustmentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    store_id: str
    reason: str = Field(min_length=1, max_length=240)
    occurred_at: Optional[datetime] = None
    items: List[AdjustmentItemInput] = Field(min_length=1)


def _serialize_adjustment(db: Session, adj: StockAdjustment) -> Dict[str, Any]:
    items = (
        db.query(StockAdjustmentItem)
        .filter(
            StockAdjustmentItem.organization_id == adj.organization_id,
            StockAdjustmentItem.adjustment_id == adj.id,
        )
        .all()
    )
    return {
        "id": adj.id,
        "organization_id": adj.organization_id,
        "store_id": adj.store_id,
        "adjustment_number": adj.adjustment_number,
        "status": adj.status,
        "reason": adj.reason,
        "occurred_at": adj.occurred_at.isoformat(),
        "created_at": adj.created_at.isoformat(),
        "created_by": adj.created_by,
        "posted_at": adj.posted_at.isoformat() if adj.posted_at else None,
        "posted_by": adj.posted_by,
        "items": [
            {
                "id": it.id,
                "product_variant_id": it.product_variant_id,
                "quantity_delta": format_decimal(it.quantity_delta),
                "note": it.note,
            }
            for it in items
        ],
    }


@router.get("")
def list_inventory(
    store_id: Optional[str] = None,
    x_store_id: Optional[str] = Header(default=None, alias="X-Store-ID"),
    principal: Principal = Depends(get_current_principal),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    if isinstance(principal, UserPrincipal) and "inventory.read" not in principal.permissions:
        raise ForbiddenError(
            code="INSUFFICIENT_PERMISSIONS",
            message="Required permission 'inventory.read' is not granted.",
        )
    store = verify_store_access(
        db, principal, requested_store_id=store_id, x_store_id=x_store_id
    )
    assert store is not None

    rows = (
        db.query(Inventory)
        .filter(
            Inventory.organization_id == principal.organization.id,
            Inventory.store_id == store.id,
        )
        .all()
    )
    return ok_response(
        [
            {
                "id": r.id,
                "store_id": r.store_id,
                "product_variant_id": r.product_variant_id,
                "on_hand_quantity": format_decimal(r.on_hand_quantity),
                "reserved_quantity": format_decimal(r.reserved_quantity),
                "available_quantity": format_decimal(
                    r.on_hand_quantity - r.reserved_quantity
                ),
                "updated_at": r.updated_at.isoformat(),
            }
            for r in rows
        ],
        request_id=request_id,
        meta=PaginationMeta(page_size=50, next_cursor=None, has_more=False),
    )


@router.get("/movements")
def list_stock_movements(
    store_id: Optional[str] = None,
    product_variant_id: Optional[str] = None,
    x_store_id: Optional[str] = Header(default=None, alias="X-Store-ID"),
    principal: UserPrincipal = Depends(require_permission("inventory.read")),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    store = verify_store_access(
        db, principal, requested_store_id=store_id, x_store_id=x_store_id
    )
    assert store is not None

    query = db.query(StockMovement).filter(
        StockMovement.organization_id == principal.organization.id,
        StockMovement.store_id == store.id,
    )
    if product_variant_id:
        query = query.filter(StockMovement.product_variant_id == product_variant_id)

    movements = query.order_by(StockMovement.occurred_at.desc(), StockMovement.id.desc()).limit(100).all()
    return ok_response(
        [
            {
                "id": m.id,
                "store_id": m.store_id,
                "product_variant_id": m.product_variant_id,
                "movement_type": m.movement_type,
                "quantity_delta": format_decimal(m.quantity_delta),
                "quantity_after": format_decimal(m.quantity_after)
                if m.quantity_after is not None
                else None,
                "source_type": m.source_type,
                "source_id": m.source_id,
                "occurred_at": m.occurred_at.isoformat(),
            }
            for m in movements
        ],
        request_id=request_id,
        meta=PaginationMeta(page_size=100, next_cursor=None, has_more=False),
    )


@router.get("/adjustments")
def list_adjustments(
    store_id: Optional[str] = None,
    x_store_id: Optional[str] = Header(default=None, alias="X-Store-ID"),
    principal: UserPrincipal = Depends(require_permission("inventory.read")),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    store = verify_store_access(
        db, principal, requested_store_id=store_id, x_store_id=x_store_id
    )
    assert store is not None
    adjs = (
        db.query(StockAdjustment)
        .filter(
            StockAdjustment.organization_id == principal.organization.id,
            StockAdjustment.store_id == store.id,
        )
        .order_by(StockAdjustment.created_at.desc())
        .all()
    )
    return ok_response(
        [_serialize_adjustment(db, a) for a in adjs],
        request_id=request_id,
        meta=PaginationMeta(page_size=50, next_cursor=None, has_more=False),
    )


@router.post("/adjustments", status_code=status.HTTP_201_CREATED)
def create_adjustment(
    body: CreateStockAdjustmentRequest,
    principal: UserPrincipal = Depends(require_permission("inventory.adjust")),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> JSONResponse:
    org_id = principal.organization.id
    store = verify_store_access(db, principal, requested_store_id=body.store_id)
    assert store is not None

    adj_number = next_store_document_number(
        db, org_id, store.id, store.code, "stock_adjustment", "ADJ-"
    )
    now = datetime.now(timezone.utc)
    adj = StockAdjustment(
        organization_id=org_id,
        store_id=store.id,
        adjustment_number=adj_number,
        status="draft",
        reason=body.reason.strip(),
        occurred_at=body.occurred_at or now,
        created_by=principal.user.id,
    )
    db.add(adj)
    db.flush()

    for item in body.items:
        variant = (
            db.query(ProductVariant)
            .filter(
                ProductVariant.organization_id == org_id,
                ProductVariant.id == item.product_variant_id,
                ProductVariant.deleted_at.is_(None),
            )
            .first()
        )
        if variant is None:
            raise NotFoundError(
                code="VARIANT_NOT_FOUND",
                message=f"Variant '{item.product_variant_id}' not found.",
            )
        delta = to_decimal(item.quantity_delta, "quantity_delta")
        if delta == Decimal("0"):
            raise ValidationAppError(
                code="ZERO_QUANTITY_DELTA",
                message="quantity_delta must be non-zero.",
            )
        db.add(
            StockAdjustmentItem(
                organization_id=org_id,
                adjustment_id=adj.id,
                product_variant_id=variant.id,
                quantity_delta=delta,
                note=item.note,
            )
        )

    db.flush()
    record_audit_event(
        db,
        action="inventory.adjustment.created",
        entity_type="stock_adjustment",
        actor_type="user",
        actor_id=principal.user.id,
        organization_id=org_id,
        store_id=store.id,
        entity_id=adj.id,
        request_id=request_id,
        metadata={"adjustment_number": adj.adjustment_number},
    )
    db.commit()
    return JSONResponse(
        status_code=status.HTTP_201_CREATED,
        content=ok_response(_serialize_adjustment(db, adj), request_id=request_id),
    )


@router.post("/adjustments/{adjustment_id}/post")
def post_adjustment(
    adjustment_id: str,
    idempotency_key: Optional[str] = Header(default=None, alias="Idempotency-Key"),
    principal: UserPrincipal = Depends(require_permission("inventory.post_adjustment")),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    org_id = principal.organization.id
    replayed, idem_record, _ = check_or_claim_idempotency(
        db,
        organization_id=org_id,
        scope="inventory.adjustments.post",
        idempotency_key=idempotency_key or f"post-adj-{adjustment_id}",
        request_payload={"adjustment_id": adjustment_id},
    )
    if replayed is not None:
        return ok_response(replayed, request_id=request_id)

    adj = (
        db.query(StockAdjustment)
        .filter(
            StockAdjustment.organization_id == org_id,
            StockAdjustment.id == adjustment_id,
        )
        .with_for_update()
        .first()
    )
    if adj is None:
        raise NotFoundError(
            code="ADJUSTMENT_NOT_FOUND", message="Stock adjustment not found."
        )
    verify_store_access(db, principal, requested_store_id=adj.store_id)

    if adj.status != "draft":
        raise ConflictError(
            code="INVALID_ADJUSTMENT_STATE",
            message=f"Stock adjustment is in state '{adj.status}' and cannot be posted.",
        )

    items = (
        db.query(StockAdjustmentItem)
        .filter(
            StockAdjustmentItem.organization_id == org_id,
            StockAdjustmentItem.adjustment_id == adj.id,
        )
        .order_by(StockAdjustmentItem.product_variant_id.asc())
        .all()
    )
    now = datetime.now(timezone.utc)
    for item in items:
        apply_stock_movement(
            db,
            organization_id=org_id,
            store_id=adj.store_id,
            product_variant_id=item.product_variant_id,
            movement_type="adjustment",
            quantity_delta=item.quantity_delta,
            source_type="stock_adjustment",
            source_id=adj.id,
            idempotency_key=f"adj-{adj.id}-{item.id}",
            created_by=principal.user.id,
            allow_negative_stock=True,
            occurred_at=adj.occurred_at,
        )

    adj.status = "posted"
    adj.posted_at = now
    adj.posted_by = principal.user.id
    db.flush()

    serialized = _serialize_adjustment(db, adj)
    complete_idempotency_record(
        idem_record,
        response_status=200,
        response_data=serialized,
        resource_type="stock_adjustment",
        resource_id=adj.id,
    )
    record_audit_event(
        db,
        action="inventory.adjustment.posted",
        entity_type="stock_adjustment",
        actor_type="user",
        actor_id=principal.user.id,
        organization_id=org_id,
        store_id=adj.store_id,
        entity_id=adj.id,
        request_id=request_id,
    )
    db.commit()
    return ok_response(serialized, request_id=request_id)


@router.post("/adjustments/{adjustment_id}/void")
def void_adjustment(
    adjustment_id: str,
    principal: UserPrincipal = Depends(require_permission("inventory.post_adjustment")),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    org_id = principal.organization.id
    adj = (
        db.query(StockAdjustment)
        .filter(
            StockAdjustment.organization_id == org_id,
            StockAdjustment.id == adjustment_id,
        )
        .with_for_update()
        .first()
    )
    if adj is None:
        raise NotFoundError(
            code="ADJUSTMENT_NOT_FOUND", message="Stock adjustment not found."
        )
    verify_store_access(db, principal, requested_store_id=adj.store_id)

    if adj.status == "voided":
        return ok_response(_serialize_adjustment(db, adj), request_id=request_id)

    # If already posted, create compensating movements rather than deleting posted history!
    if adj.status == "posted":
        items = (
            db.query(StockAdjustmentItem)
            .filter(
                StockAdjustmentItem.organization_id == org_id,
                StockAdjustmentItem.adjustment_id == adj.id,
            )
            .order_by(StockAdjustmentItem.product_variant_id.asc())
            .all()
        )
        for item in items:
            apply_stock_movement(
                db,
                organization_id=org_id,
                store_id=adj.store_id,
                product_variant_id=item.product_variant_id,
                movement_type="adjustment",
                quantity_delta=-item.quantity_delta,
                source_type="stock_adjustment_void",
                source_id=adj.id,
                idempotency_key=f"adj-void-{adj.id}-{item.id}",
                created_by=principal.user.id,
                allow_negative_stock=True,
            )

    adj.status = "voided"
    record_audit_event(
        db,
        action="inventory.adjustment.voided",
        entity_type="stock_adjustment",
        actor_type="user",
        actor_id=principal.user.id,
        organization_id=org_id,
        store_id=adj.store_id,
        entity_id=adj.id,
        request_id=request_id,
    )
    db.commit()
    return ok_response(_serialize_adjustment(db, adj), request_id=request_id)


@router.get("/{product_variant_id}")
def get_variant_inventory(
    product_variant_id: str,
    store_id: Optional[str] = None,
    x_store_id: Optional[str] = Header(default=None, alias="X-Store-ID"),
    principal: Principal = Depends(get_current_principal),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    if isinstance(principal, UserPrincipal) and "inventory.read" not in principal.permissions:
        raise ForbiddenError(
            code="INSUFFICIENT_PERMISSIONS",
            message="Required permission 'inventory.read' is not granted.",
        )
    store = verify_store_access(
        db, principal, requested_store_id=store_id, x_store_id=x_store_id
    )
    assert store is not None

    inv = (
        db.query(Inventory)
        .filter(
            Inventory.organization_id == principal.organization.id,
            Inventory.store_id == store.id,
            Inventory.product_variant_id == product_variant_id,
        )
        .first()
    )
    on_hand = inv.on_hand_quantity if inv else Decimal("0.0000")
    reserved = inv.reserved_quantity if inv else Decimal("0.0000")
    return ok_response(
        {
            "store_id": store.id,
            "product_variant_id": product_variant_id,
            "on_hand_quantity": format_decimal(on_hand),
            "reserved_quantity": format_decimal(reserved),
            "available_quantity": format_decimal(on_hand - reserved),
        },
        request_id=request_id,
    )

