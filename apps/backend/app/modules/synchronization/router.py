"""POS bootstrap and offline synchronization (cursor pull & batch outbox push)."""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Header, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import (
    DevicePrincipal,
    Principal,
    UserPrincipal,
    get_current_principal,
    get_db,
    get_request_id,
    verify_store_access,
)
from app.core.envelope import PaginationMeta, ok_response
from app.core.exceptions import (
    AppError,
    ForbiddenError,
    ValidationAppError,
)
from app.core.money import format_decimal, to_decimal
from app.infrastructure.models import (
    CashDrawer,
    CashMovement,
    CashSession,
    CatalogChangeLog,
    Category,
    Device,
    DeviceEvent,
    PaymentMethod,
    Product,
    ProductBarcode,
    ProductVariant,
    Store,
    SyncCheckpoint,
)
from app.modules.sales.router import (
    CreateOrderRequest,
    OrderDiscountInput,
    OrderItemInput,
    OrderPaymentInput,
    _serialize_cash_session,
    create_order_tx,
)

router = APIRouter(tags=["POS Bootstrap & Offline Sync"])


# ============================================================================
# Schemas
# ============================================================================


class OutboxEventInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    event_id: str = Field(..., min_length=1, max_length=60)
    event_type: str = Field(
        ...,
        pattern="^(order\\.created|payment\\.recorded|cash_session\\.opened|cash_movement\\.created|cash_session\\.closed|device\\.event)$",
    )
    idempotency_key: str = Field(..., min_length=1, max_length=160)
    occurred_at: datetime
    cashier_user_id: Optional[str] = None
    payload: Dict[str, Any]


class SyncPushRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    device_id: Optional[str] = None
    store_id: str
    batch_id: str
    events: List[OutboxEventInput] = Field(..., min_length=1, max_length=100)


# ============================================================================
# Helpers
# ============================================================================


def _resolve_store(
    db: Session,
    principal: Principal,
    requested_store_id: Optional[str] = None,
    x_store_id: Optional[str] = None,
) -> Store:
    store = verify_store_access(
        db,
        principal,
        requested_store_id=requested_store_id,
        x_store_id=x_store_id,
        require_store=True,
    )
    assert store is not None
    return store


def _principal_device_id(principal: Principal) -> Optional[str]:
    if isinstance(principal, DevicePrincipal):
        return principal.device.id
    return None


def _principal_user_id(principal: Principal) -> Optional[str]:
    if isinstance(principal, UserPrincipal):
        return principal.user.id
    return None


def _update_checkpoint(
    db: Session,
    organization_id: str,
    device_id: Optional[str],
    stream_name: str,
    cursor_value: str,
) -> None:
    if not device_id:
        return
    now = datetime.now(timezone.utc)
    cp = (
        db.query(SyncCheckpoint)
        .filter(
            SyncCheckpoint.organization_id == organization_id,
            SyncCheckpoint.device_id == device_id,
            SyncCheckpoint.stream_name == stream_name,
        )
        .first()
    )
    if cp is None:
        cp = SyncCheckpoint(
            organization_id=organization_id,
            device_id=device_id,
            stream_name=stream_name,
            cursor_value=cursor_value,
            last_success_at=now,
        )
        db.add(cp)
    else:
        cp.cursor_value = cursor_value
        cp.last_success_at = now
        cp.updated_at = now

    device = (
        db.query(Device)
        .filter(
            Device.organization_id == organization_id,
            Device.id == device_id,
        )
        .first()
    )
    if device is not None:
        device.last_sync_at = now
        device.last_seen_at = now


# ============================================================================
# POS Bootstrap Endpoints
# ============================================================================


@router.get("/pos/bootstrap")
def pos_bootstrap(
    store_id: Optional[str] = Query(default=None),
    x_store_id: Optional[str] = Header(default=None, alias="X-Store-ID"),
    principal: Principal = Depends(get_current_principal),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    store = _resolve_store(db, principal, store_id, x_store_id)
    org = principal.organization

    payment_methods = (
        db.query(PaymentMethod)
        .filter(
            PaymentMethod.organization_id == org.id,
            PaymentMethod.status == "active",
        )
        .all()
    )
    categories = (
        db.query(Category)
        .filter(
            Category.organization_id == org.id,
            Category.deleted_at.is_(None),
        )
        .all()
    )
    products = (
        db.query(Product)
        .filter(
            Product.organization_id == org.id,
            Product.deleted_at.is_(None),
        )
        .all()
    )
    variants = (
        db.query(ProductVariant)
        .filter(
            ProductVariant.organization_id == org.id,
            ProductVariant.deleted_at.is_(None),
        )
        .all()
    )
    barcodes = (
        db.query(ProductBarcode)
        .filter(ProductBarcode.organization_id == org.id)
        .all()
    )
    drawers = (
        db.query(CashDrawer)
        .filter(
            CashDrawer.organization_id == org.id,
            CashDrawer.store_id == store.id,
            CashDrawer.status == "active",
        )
        .all()
    )
    open_session = (
        db.query(CashSession)
        .filter(
            CashSession.organization_id == org.id,
            CashSession.store_id == store.id,
            CashSession.status == "open",
        )
        .order_by(CashSession.opened_at.desc())
        .first()
    )

    max_seq = (
        db.query(func.max(CatalogChangeLog.seq))
        .filter(CatalogChangeLog.organization_id == org.id)
        .scalar()
        or 0
    )
    initial_cursor = f"cat_seq_{max_seq:09d}"
    _update_checkpoint(
        db,
        organization_id=org.id,
        device_id=_principal_device_id(principal),
        stream_name="catalog",
        cursor_value=initial_cursor,
    )
    db.commit()

    return ok_response(
        {
            "organization": {
                "id": org.id,
                "code": org.code,
                "name": org.name,
                "default_currency": org.default_currency,
                "timezone": org.timezone,
            },
            "store": {
                "id": store.id,
                "code": store.code,
                "name": store.name,
                "timezone": store.timezone,
                "currency_code": store.currency_code,
            },
            "payment_methods": [
                {
                    "id": pm.id,
                    "code": pm.code,
                    "name": pm.name,
                    "method_type": pm.method_type,
                    "supports_offline_recording": pm.supports_offline_recording,
                    "requires_external_authorization": pm.requires_external_authorization,
                }
                for pm in payment_methods
            ],
            "categories": [
                {
                    "id": c.id,
                    "parent_category_id": c.parent_category_id,
                    "code": c.code,
                    "name": c.name,
                    "sort_order": c.sort_order,
                }
                for c in categories
            ],
            "products": [
                {
                    "id": p.id,
                    "category_id": p.category_id,
                    "product_code": p.product_code,
                    "name": p.name,
                    "product_type": p.product_type,
                    "track_inventory": p.track_inventory,
                    "status": p.status,
                }
                for p in products
            ],
            "variants": [
                {
                    "id": v.id,
                    "product_id": v.product_id,
                    "variant_code": v.variant_code,
                    "variant_name": v.variant_name,
                    "sku": v.sku,
                    "unit_name": v.unit_name,
                    "default_price": format_decimal(v.default_price),
                    "currency_code": v.currency_code,
                    "status": v.status,
                }
                for v in variants
            ],
            "barcodes": [
                {
                    "id": b.id,
                    "product_variant_id": b.product_variant_id,
                    "barcode": b.barcode,
                    "is_primary": b.is_primary,
                }
                for b in barcodes
            ],
            "cash_drawers": [
                {"id": d.id, "code": d.code, "name": d.name, "status": d.status}
                for d in drawers
            ],
            "current_cash_session": (
                _serialize_cash_session(open_session) if open_session else None
            ),
            "catalog_cursor": initial_cursor,
            "server_time": datetime.now(timezone.utc).isoformat(),
        },
        request_id=request_id,
    )


@router.get("/pos/config")
@router.get("/sync/config")
def get_pos_config(
    store_id: Optional[str] = Query(default=None),
    x_store_id: Optional[str] = Header(default=None, alias="X-Store-ID"),
    principal: Principal = Depends(get_current_principal),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    store = _resolve_store(db, principal, store_id, x_store_id)
    org = principal.organization
    return ok_response(
        {
            "organization_id": org.id,
            "organization_name": org.name,
            "store_id": store.id,
            "store_code": store.code,
            "store_name": store.name,
            "currency_code": store.currency_code,
            "timezone": store.timezone,
            "server_time": datetime.now(timezone.utc).isoformat(),
        },
        request_id=request_id,
    )


@router.get("/pos/payment-methods")
@router.get("/sync/payment-methods")
def get_pos_payment_methods(
    principal: Principal = Depends(get_current_principal),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    rows = (
        db.query(PaymentMethod)
        .filter(
            PaymentMethod.organization_id == principal.organization.id,
            PaymentMethod.status == "active",
        )
        .all()
    )
    items = [
        {
            "id": pm.id,
            "code": pm.code,
            "name": pm.name,
            "method_type": pm.method_type,
            "supports_offline_recording": pm.supports_offline_recording,
            "requires_external_authorization": pm.requires_external_authorization,
        }
        for pm in rows
    ]
    return ok_response(
        items,
        request_id=request_id,
        meta=PaginationMeta(page_size=50, next_cursor=None, has_more=False),
    )


@router.get("/pos/cash-session/current")
def get_pos_current_cash_session(
    store_id: Optional[str] = Query(default=None),
    x_store_id: Optional[str] = Header(default=None, alias="X-Store-ID"),
    principal: Principal = Depends(get_current_principal),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    store = _resolve_store(db, principal, store_id, x_store_id)
    open_session = (
        db.query(CashSession)
        .filter(
            CashSession.organization_id == principal.organization.id,
            CashSession.store_id == store.id,
            CashSession.status == "open",
        )
        .order_by(CashSession.opened_at.desc())
        .first()
    )
    return ok_response(
        {
            "cash_session": (
                _serialize_cash_session(open_session) if open_session else None
            )
        },
        request_id=request_id,
    )


# ============================================================================
# Cursor-Based Pull Sync (/api/v1/sync/catalog)
# ============================================================================


def _parse_catalog_cursor(cursor: Optional[str]) -> int:
    if not cursor:
        return 0
    if cursor.startswith("cat_seq_"):
        try:
            return int(cursor.replace("cat_seq_", ""))
        except ValueError:
            pass
    try:
        return int(cursor)
    except ValueError as exc:
        raise ValidationAppError(
            code="INVALID_CURSOR",
            message=f"Invalid catalog sync cursor '{cursor}'.",
        ) from exc


@router.get("/sync/catalog")
def pull_catalog_sync(
    store_id: Optional[str] = Query(default=None),
    cursor: Optional[str] = Query(default=None),
    limit: int = Query(default=200, ge=1, le=500),
    x_store_id: Optional[str] = Header(default=None, alias="X-Store-ID"),
    principal: Principal = Depends(get_current_principal),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    _resolve_store(db, principal, store_id, x_store_id)
    org_id = principal.organization.id
    last_seq = _parse_catalog_cursor(cursor)

    rows = (
        db.query(CatalogChangeLog)
        .filter(
            CatalogChangeLog.organization_id == org_id,
            CatalogChangeLog.seq > last_seq,
        )
        .order_by(CatalogChangeLog.seq.asc())
        .limit(limit + 1)
        .all()
    )

    has_more = len(rows) > limit
    page_rows = rows[:limit]
    next_seq = page_rows[-1].seq if page_rows else last_seq
    next_cursor = f"cat_seq_{next_seq:09d}"

    _update_checkpoint(
        db,
        organization_id=org_id,
        device_id=_principal_device_id(principal),
        stream_name="catalog",
        cursor_value=next_cursor,
    )
    db.commit()

    changes = [
        {
            "entity_type": row.entity_type,
            "change_type": row.change_type,
            "entity_id": row.entity_id,
            "version": row.version,
            "updated_at": row.created_at.isoformat(),
            "payload": row.payload if row.change_type == "upsert" else None,
        }
        for row in page_rows
    ]

    return ok_response(
        {
            "cursor_status": "ok",
            "changes": changes,
            "next_cursor": next_cursor,
            "has_more": has_more,
            "server_time": datetime.now(timezone.utc).isoformat(),
        },
        request_id=request_id,
    )


# ============================================================================
# Batch Outbox Push (/api/v1/sync/push)
# ============================================================================


def _process_single_outbox_event(
    db: Session,
    principal: Principal,
    store_id: str,
    device_id: Optional[str],
    ev: OutboxEventInput,
    request_id: str,
) -> Dict[str, Any]:
    """Process one outbox event inside a savepoint and return per-event result."""
    org_id = principal.organization.id
    user_id = _principal_user_id(principal)
    actor_id = user_id or device_id or org_id
    try:
        with db.begin_nested():
            if ev.event_type == "order.created":
                p = ev.payload
                raw_items = p.get("items", [])
                items = [
                    OrderItemInput(
                        product_variant_id=it["product_variant_id"],
                        quantity=str(it["quantity"]),
                        unit_price=(
                            str(it["unit_price"])
                            if "unit_price" in it and it["unit_price"] is not None
                            else None
                        ),
                        unit_price_override=(
                            str(it["unit_price_override"])
                            if "unit_price_override" in it
                            and it["unit_price_override"] is not None
                            else None
                        ),
                        discount_amount=str(it.get("discount_amount", "0.0000")),
                        tax_amount=(
                            str(it["tax_amount"])
                            if "tax_amount" in it and it["tax_amount"] is not None
                            else None
                        ),
                        product_name_snapshot=it.get("product_name_snapshot"),
                        variant_name_snapshot=it.get("variant_name_snapshot"),
                    )
                    for it in raw_items
                ]
                discounts = [
                    OrderDiscountInput(
                        discount_type=d.get("discount_type", "fixed"),
                        description=d.get("description", "POS Offline Discount"),
                        rate=str(d["rate"]) if d.get("rate") is not None else None,
                        amount=str(d["amount"]),
                    )
                    for d in p.get("discounts", [])
                ]
                payments = [
                    OrderPaymentInput(
                        payment_method_code=pay.get("payment_method_code"),
                        payment_method_id=pay.get("payment_method_id"),
                        amount=str(pay["amount"]),
                        idempotency_key=pay.get("idempotency_key")
                        or f"{ev.idempotency_key}:pay:{idx}",
                        payment_status=pay.get("payment_status", "recorded_locally"),
                        authorization_reference=pay.get("authorization_reference"),
                    )
                    for idx, pay in enumerate(p.get("payments", []))
                ]
                order_req = CreateOrderRequest(
                    store_id=store_id,
                    client_order_id=p.get("client_order_id"),
                    order_number=p.get("order_number"),
                    occurred_at=ev.occurred_at,
                    currency_code=p.get("currency_code", "VND"),
                    items=items,
                    discounts=discounts,
                    payments=payments,
                    note=p.get("note"),
                    idempotency_key=ev.idempotency_key,
                )
                order_data, _ = create_order_tx(
                    db=db,
                    principal=principal,
                    body=order_req,
                    idempotency_key=ev.idempotency_key,
                    source="pos_offline_sync",
                    cashier_user_id=ev.cashier_user_id or user_id,
                    device_id=device_id,
                    request_id=request_id,
                )
                return {
                    "event_id": ev.event_id,
                    "idempotency_key": ev.idempotency_key,
                    "status": "accepted",
                    "server_resource_type": "order",
                    "server_resource_id": order_data["id"],
                    "warnings": [],
                }

            elif ev.event_type == "cash_session.opened":
                p = ev.payload
                drawer_id = p.get("cash_drawer_id")
                opening_amt = to_decimal(p.get("opening_amount", "0.0000"))
                session = CashSession(
                    organization_id=org_id,
                    store_id=store_id,
                    cash_drawer_id=drawer_id,
                    device_id=device_id,
                    opened_by=ev.cashier_user_id or actor_id,
                    status="open",
                    currency_code=p.get("currency_code", "VND"),
                    opening_amount=opening_amt,
                    opened_at=ev.occurred_at,
                )
                db.add(session)
                db.flush()
                return {
                    "event_id": ev.event_id,
                    "idempotency_key": ev.idempotency_key,
                    "status": "accepted",
                    "server_resource_type": "cash_session",
                    "server_resource_id": session.id,
                    "warnings": [],
                }

            elif ev.event_type == "cash_movement.created":
                p = ev.payload
                session_id = p.get("cash_session_id")
                amt = to_decimal(p["amount"])
                mtype = p.get("movement_type", "cash_in")
                direction = p.get(
                    "direction", "in" if mtype == "cash_in" else "out"
                )
                mv = CashMovement(
                    organization_id=org_id,
                    store_id=store_id,
                    cash_session_id=session_id,
                    movement_type=mtype,
                    amount=amt,
                    direction=direction,
                    note=p.get("note"),
                    created_by=ev.cashier_user_id or actor_id,
                )
                db.add(mv)
                db.flush()
                return {
                    "event_id": ev.event_id,
                    "idempotency_key": ev.idempotency_key,
                    "status": "accepted",
                    "server_resource_type": "cash_movement",
                    "server_resource_id": mv.id,
                    "warnings": [],
                }

            elif ev.event_type == "cash_session.closed":
                p = ev.payload
                session_id = p.get("cash_session_id")
                session = (
                    db.query(CashSession)
                    .filter(
                        CashSession.organization_id == org_id,
                        CashSession.id == session_id,
                    )
                    .first()
                )
                if session is None:
                    raise AppError(
                        status_code=404,
                        code="CASH_SESSION_NOT_FOUND",
                        message="Cash session not found.",
                    )
                actual = to_decimal(p.get("actual_closing_amount", "0.0000"))
                session.status = "closed"
                session.actual_closing_amount = actual
                session.closed_by = ev.cashier_user_id or actor_id
                session.closed_at = ev.occurred_at
                db.flush()
                return {
                    "event_id": ev.event_id,
                    "idempotency_key": ev.idempotency_key,
                    "status": "accepted",
                    "server_resource_type": "cash_session",
                    "server_resource_id": session.id,
                    "warnings": [],
                }

            elif ev.event_type == "device.event":
                p = ev.payload
                eff_device_id = device_id or _principal_device_id(principal)
                if not eff_device_id:
                    raise ValidationAppError(
                        code="DEVICE_ID_REQUIRED",
                        message="device_id is required for device.event.",
                    )
                de = DeviceEvent(
                    organization_id=org_id,
                    device_id=eff_device_id,
                    event_type=p.get("type", "heartbeat"),
                    occurred_at=ev.occurred_at,
                    event_metadata=p.get("metadata", {}),
                )
                db.add(de)
                db.flush()
                return {
                    "event_id": ev.event_id,
                    "idempotency_key": ev.idempotency_key,
                    "status": "accepted",
                    "server_resource_type": "device_event",
                    "server_resource_id": de.id,
                    "warnings": [],
                }

            else:
                return {
                    "event_id": ev.event_id,
                    "idempotency_key": ev.idempotency_key,
                    "status": "rejected",
                    "error": {
                        "code": "UNSUPPORTED_EVENT_TYPE",
                        "message": f"Unsupported event type '{ev.event_type}'.",
                    },
                }

    except AppError as exc:
        status_label = "conflict" if exc.status_code == 409 else "rejected"
        return {
            "event_id": ev.event_id,
            "idempotency_key": ev.idempotency_key,
            "status": status_label,
            "error": {
                "code": exc.code,
                "message": exc.message,
            },
        }
    except Exception as exc:
        return {
            "event_id": ev.event_id,
            "idempotency_key": ev.idempotency_key,
            "status": "rejected",
            "error": {
                "code": "EVENT_PROCESSING_ERROR",
                "message": str(exc),
            },
        }


@router.post("/sync/push")
def push_outbox_events(
    body: SyncPushRequest,
    idempotency_key_header: Optional[str] = Header(
        default=None, alias="Idempotency-Key"
    ),
    principal: Principal = Depends(get_current_principal),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    store = _resolve_store(db, principal, body.store_id)
    effective_device_id = _principal_device_id(principal) or body.device_id

    if (
        isinstance(principal, DevicePrincipal)
        and body.device_id
        and body.device_id != principal.device.id
    ):
        raise ForbiddenError(
            code="DEVICE_IDENTITY_MISMATCH",
            message="Device token cannot push events on behalf of a different device_id.",
        )

    results: List[Dict[str, Any]] = []
    for ev in body.events:
        res = _process_single_outbox_event(
            db=db,
            principal=principal,
            store_id=store.id,
            device_id=effective_device_id,
            ev=ev,
            request_id=request_id,
        )
        results.append(res)

    _update_checkpoint(
        db,
        organization_id=principal.organization.id,
        device_id=effective_device_id,
        stream_name="outbox_push",
        cursor_value=body.batch_id,
    )
    db.commit()

    return ok_response(
        {
            "batch_id": body.batch_id,
            "processed_at": datetime.now(timezone.utc).isoformat(),
            "results": results,
        },
        request_id=request_id,
    )


@router.get("/sync/status")
def get_sync_status(
    device_id: Optional[str] = Query(default=None),
    principal: Principal = Depends(get_current_principal),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    org_id = principal.organization.id
    eff_device_id = _principal_device_id(principal) or device_id
    query = db.query(SyncCheckpoint).filter(
        SyncCheckpoint.organization_id == org_id
    )
    if eff_device_id:
        query = query.filter(SyncCheckpoint.device_id == eff_device_id)
    rows = query.order_by(SyncCheckpoint.updated_at.desc()).all()
    max_seq = (
        db.query(func.max(CatalogChangeLog.seq))
        .filter(CatalogChangeLog.organization_id == org_id)
        .scalar()
        or 0
    )
    return ok_response(
        {
            "latest_catalog_cursor": f"cat_seq_{max_seq:09d}",
            "server_time": datetime.now(timezone.utc).isoformat(),
            "checkpoints": [
                {
                    "device_id": cp.device_id,
                    "stream_name": cp.stream_name,
                    "cursor_value": cp.cursor_value,
                    "last_success_at": (
                        cp.last_success_at.isoformat() if cp.last_success_at else None
                    ),
                    "updated_at": cp.updated_at.isoformat(),
                }
                for cp in rows
            ],
        },
        request_id=request_id,
    )
