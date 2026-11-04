"""Sales orders, payments, refunds, cash drawers/sessions, and operational reports."""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple, Union

from fastapi import APIRouter, Depends, Header, Query, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import (
    DevicePrincipal,
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
    CashDrawer,
    CashMovement,
    CashSession,
    Inventory,
    Order,
    OrderDiscount,
    OrderItem,
    OrderTaxLine,
    Payment,
    PaymentMethod,
    PriceListItem,
    Product,
    ProductBarcode,
    ProductVariant,
    Refund,
    RefundItem,
    Store,
    StorePriceListAssignment,
)
from app.modules.audit.service import record_audit_event
from app.modules.inventory.router import (
    apply_stock_movement,
    next_store_document_number,
)

router = APIRouter(tags=["Sales, Payments, Cash & Reports"])

DecimalInput = Union[str, int, Decimal]


# ============================================================================
# Schemas
# ============================================================================


class CreateCashDrawerRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    store_id: str
    code: str = Field(..., min_length=1, max_length=60)
    name: str = Field(..., min_length=1, max_length=120)
    status: str = Field(default="active")


class UpdateCashDrawerRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Optional[str] = None
    status: Optional[str] = None


class OpenCashSessionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    store_id: str
    cash_drawer_id: str
    device_id: Optional[str] = None
    opening_amount: DecimalInput
    currency_code: str = Field(default="VND", min_length=3, max_length=3)
    idempotency_key: Optional[str] = None


class CreateCashMovementRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    movement_type: str = Field(..., pattern="^(cash_in|cash_out)$")
    direction: Optional[str] = None
    amount: DecimalInput
    note: Optional[str] = Field(default=None, max_length=300)
    idempotency_key: Optional[str] = None


class CloseCashSessionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    actual_closing_amount: DecimalInput
    note: Optional[str] = None
    idempotency_key: Optional[str] = None


class CreatePaymentMethodRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=120)
    method_type: str = Field(
        ...,
        pattern="^(cash|bank_transfer|card_terminal|online_gateway|other)$",
    )
    supports_offline_recording: bool = False
    requires_external_authorization: bool = False
    status: str = Field(default="active")


class UpdatePaymentMethodRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Optional[str] = None
    supports_offline_recording: Optional[bool] = None
    requires_external_authorization: Optional[bool] = None
    status: Optional[str] = None


class OrderItemInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    product_variant_id: str
    quantity: DecimalInput
    unit_price_override: Optional[DecimalInput] = None
    unit_price: Optional[DecimalInput] = None
    discount_amount: DecimalInput = "0.0000"
    tax_amount: Optional[DecimalInput] = None
    tax_rate: Optional[DecimalInput] = None
    tax_code_snapshot: Optional[str] = None
    tax_name_snapshot: Optional[str] = None
    product_name_snapshot: Optional[str] = None
    variant_name_snapshot: Optional[str] = None


class OrderDiscountInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    discount_type: str = Field(default="fixed", pattern="^(percentage|fixed|manual)$")
    description: str = Field(default="Order discount", max_length=240)
    rate: Optional[DecimalInput] = None
    amount: DecimalInput


class OrderPaymentInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    payment_method_code: Optional[str] = None
    payment_method_id: Optional[str] = None
    amount: DecimalInput
    idempotency_key: Optional[str] = None
    payment_status: Optional[str] = None
    authorization_reference: Optional[str] = None


class CustomerSnapshotInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Optional[str] = None
    phone: Optional[str] = None


class CreateOrderRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    store_id: str
    client_order_id: Optional[str] = None
    order_number: Optional[str] = None
    occurred_at: Optional[datetime] = None
    currency_code: str = Field(default="VND", min_length=3, max_length=3)
    customer: Optional[CustomerSnapshotInput] = None
    items: List[OrderItemInput] = Field(..., min_length=1)
    discounts: List[OrderDiscountInput] = Field(default_factory=list)
    payments: List[OrderPaymentInput] = Field(default_factory=list)
    note: Optional[str] = None
    idempotency_key: Optional[str] = None


class VoidOrderRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reason: str = Field(..., min_length=1, max_length=500)


class RecordOrderPaymentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    payment_method_code: Optional[str] = None
    payment_method_id: Optional[str] = None
    amount: DecimalInput
    authorization_reference: Optional[str] = None
    provider_code: Optional[str] = None
    provider_transaction_id: Optional[str] = None
    idempotency_key: Optional[str] = None


class RefundItemInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    order_item_id: str
    quantity: DecimalInput
    refund_amount: DecimalInput
    restock_quantity: DecimalInput = "0.0000"
    restock_store_id: Optional[str] = None


class CreateRefundRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reason: str = Field(..., min_length=1, max_length=500)
    occurred_at: Optional[datetime] = None
    items: List[RefundItemInput] = Field(..., min_length=1)
    idempotency_key: Optional[str] = None


# ============================================================================
# Helpers
# ============================================================================


def _check_perm_or_device(principal: Principal, perm: str) -> None:
    if isinstance(principal, UserPrincipal) and perm not in principal.permissions:
        raise ForbiddenError(
            code="INSUFFICIENT_PERMISSIONS",
            message=f"Required permission '{perm}' is not granted.",
        )


def _actor_info(principal: Principal) -> Tuple[str, str, Optional[str], Optional[str]]:
    """Return (actor_type, actor_id, user_id_or_none, device_id_or_none)."""
    if isinstance(principal, UserPrincipal):
        return ("user", principal.user.id, principal.user.id, None)
    return ("device", principal.device.id, None, principal.device.id)


def _resolve_effective_variant_price(
    db: Session,
    organization_id: str,
    store_id: str,
    variant: ProductVariant,
) -> Decimal:
    """Resolve effective store price list item if assigned, otherwise default_price."""
    assignment = (
        db.query(StorePriceListAssignment)
        .filter(
            StorePriceListAssignment.organization_id == organization_id,
            StorePriceListAssignment.store_id == store_id,
        )
        .first()
    )
    if assignment is not None:
        pli = (
            db.query(PriceListItem)
            .filter(
                PriceListItem.organization_id == organization_id,
                PriceListItem.price_list_id == assignment.price_list_id,
                PriceListItem.product_variant_id == variant.id,
            )
            .first()
        )
        if pli is not None:
            return to_decimal(pli.unit_price)
    return to_decimal(variant.default_price)


def _serialize_order(db: Session, order: Order) -> Dict[str, Any]:
    items = (
        db.query(OrderItem)
        .filter(
            OrderItem.organization_id == order.organization_id,
            OrderItem.order_id == order.id,
        )
        .order_by(OrderItem.created_at.asc())
        .all()
    )
    payments = (
        db.query(Payment)
        .filter(
            Payment.organization_id == order.organization_id,
            Payment.order_id == order.id,
        )
        .order_by(Payment.created_at.asc())
        .all()
    )
    discounts = (
        db.query(OrderDiscount)
        .filter(
            OrderDiscount.organization_id == order.organization_id,
            OrderDiscount.order_id == order.id,
        )
        .all()
    )
    return {
        "id": order.id,
        "organization_id": order.organization_id,
        "store_id": order.store_id,
        "device_id": order.device_id,
        "cashier_user_id": order.cashier_user_id,
        "order_number": order.order_number,
        "client_order_id": order.client_order_id,
        "idempotency_key": order.idempotency_key,
        "order_status": order.order_status,
        "payment_status": order.payment_status,
        "source": order.source,
        "currency_code": order.currency_code,
        "subtotal_amount": format_decimal(order.subtotal_amount),
        "discount_amount": format_decimal(order.discount_amount),
        "tax_amount": format_decimal(order.tax_amount),
        "total_amount": format_decimal(order.total_amount),
        "paid_amount": format_decimal(order.paid_amount),
        "change_amount": format_decimal(order.change_amount),
        "customer": {
            "name": order.customer_name_snapshot,
            "phone": order.customer_phone_snapshot,
        }
        if (order.customer_name_snapshot or order.customer_phone_snapshot)
        else None,
        "note": order.note,
        "occurred_at": order.occurred_at.isoformat(),
        "completed_at": order.completed_at.isoformat() if order.completed_at else None,
        "created_at": order.created_at.isoformat(),
        "items": [
            {
                "id": it.id,
                "product_id": it.product_id,
                "product_variant_id": it.product_variant_id,
                "product_code_snapshot": it.product_code_snapshot,
                "product_name_snapshot": it.product_name_snapshot,
                "variant_name_snapshot": it.variant_name_snapshot,
                "barcode_snapshot": it.barcode_snapshot,
                "unit_name_snapshot": it.unit_name_snapshot,
                "quantity": format_decimal(it.quantity),
                "unit_price": format_decimal(it.unit_price),
                "discount_amount": format_decimal(it.discount_amount),
                "tax_amount": format_decimal(it.tax_amount),
                "line_total": format_decimal(it.line_total),
            }
            for it in items
        ],
        "discounts": [
            {
                "id": d.id,
                "discount_type": d.discount_type,
                "description": d.description,
                "rate": format_decimal(d.rate) if d.rate is not None else None,
                "amount": format_decimal(d.amount),
            }
            for d in discounts
        ],
        "payments": [
            {
                "id": p.id,
                "payment_method_id": p.payment_method_id,
                "payment_number": p.payment_number,
                "idempotency_key": p.idempotency_key,
                "amount": format_decimal(p.amount),
                "currency_code": p.currency_code,
                "payment_status": p.payment_status,
                "authorization_reference": p.authorization_reference,
                "recorded_at": p.recorded_at.isoformat(),
            }
            for p in payments
        ],
    }


def _serialize_cash_session(session: CashSession) -> Dict[str, Any]:
    return {
        "id": session.id,
        "organization_id": session.organization_id,
        "store_id": session.store_id,
        "cash_drawer_id": session.cash_drawer_id,
        "device_id": session.device_id,
        "opened_by": session.opened_by,
        "closed_by": session.closed_by,
        "status": session.status,
        "currency_code": session.currency_code,
        "opening_amount": format_decimal(session.opening_amount),
        "expected_closing_amount": (
            format_decimal(session.expected_closing_amount)
            if session.expected_closing_amount is not None
            else None
        ),
        "actual_closing_amount": (
            format_decimal(session.actual_closing_amount)
            if session.actual_closing_amount is not None
            else None
        ),
        "difference_amount": (
            format_decimal(session.difference_amount)
            if session.difference_amount is not None
            else None
        ),
        "opened_at": session.opened_at.isoformat(),
        "closed_at": session.closed_at.isoformat() if session.closed_at else None,
    }


def create_order_tx(
    db: Session,
    principal: Principal,
    body: CreateOrderRequest,
    idempotency_key: str,
    source: str = "pos",
    cashier_user_id: Optional[str] = None,
    device_id: Optional[str] = None,
    request_id: str = "req_sync",
) -> Tuple[Dict[str, Any], bool]:
    """
    Create an Order with items, taxes, discounts, payments, and stock deductions.
    Returns (order_dict, is_replayed).
    """
    org_id = principal.organization.id
    store = verify_store_access(db, principal, requested_store_id=body.store_id)
    assert store is not None

    payload_dict = body.model_dump(mode="json")
    replayed, idem_record, _ = check_or_claim_idempotency(
        db,
        organization_id=org_id,
        scope="orders.create",
        idempotency_key=idempotency_key,
        request_payload=payload_dict,
    )
    if replayed is not None:
        return replayed, True

    existing_order = (
        db.query(Order)
        .filter(
            Order.organization_id == org_id,
            Order.idempotency_key == idempotency_key,
        )
        .first()
    )
    if existing_order is not None:
        serialized = _serialize_order(db, existing_order)
        complete_idempotency_record(
            idem_record,
            response_status=200,
            response_data=serialized,
            resource_type="order",
            resource_id=existing_order.id,
        )
        db.commit()
        return serialized, True

    now = datetime.now(timezone.utc)
    occurred_at = body.occurred_at or now
    actor_type, actor_id, default_user_id, default_device_id = _actor_info(principal)
    effective_device_id = device_id or default_device_id
    effective_cashier_id = cashier_user_id or default_user_id

    if body.order_number:
        order_number = body.order_number
    else:
        order_number = next_store_document_number(
            db, org_id, store.id, store.code, "order", "ORD-"
        )

    order = Order(
        organization_id=org_id,
        store_id=store.id,
        device_id=effective_device_id,
        cashier_user_id=effective_cashier_id,
        order_number=order_number,
        client_order_id=body.client_order_id,
        idempotency_key=idempotency_key,
        order_status="completed",
        payment_status="unpaid",
        source=source,
        currency_code=body.currency_code.upper(),
        subtotal_amount=Decimal("0.0000"),
        discount_amount=Decimal("0.0000"),
        tax_amount=Decimal("0.0000"),
        total_amount=Decimal("0.0000"),
        paid_amount=Decimal("0.0000"),
        change_amount=Decimal("0.0000"),
        customer_name_snapshot=body.customer.name if body.customer else None,
        customer_phone_snapshot=body.customer.phone if body.customer else None,
        note=body.note,
        occurred_at=occurred_at,
        completed_at=now,
        created_by=effective_cashier_id,
    )
    db.add(order)
    db.flush()

    subtotal_acc = Decimal("0.0000")
    item_discount_acc = Decimal("0.0000")
    tax_acc = Decimal("0.0000")

    for item_in in body.items:
        qty = to_decimal(item_in.quantity, "quantity")
        if qty <= Decimal("0.0000"):
            raise ValidationAppError(
                code="INVALID_QUANTITY",
                message="Order item quantity must be greater than zero.",
            )

        variant = (
            db.query(ProductVariant)
            .filter(
                ProductVariant.organization_id == org_id,
                ProductVariant.id == item_in.product_variant_id,
            )
            .first()
        )
        if variant is None:
            raise NotFoundError(
                code="VARIANT_NOT_FOUND",
                message=f"Product variant '{item_in.product_variant_id}' not found.",
            )

        product = (
            db.query(Product)
            .filter(
                Product.organization_id == org_id,
                Product.id == variant.product_id,
            )
            .first()
        )
        if product is None:
            raise NotFoundError(
                code="PRODUCT_NOT_FOUND",
                message="Product not found for variant.",
            )

        primary_bc = (
            db.query(ProductBarcode)
            .filter(
                ProductBarcode.organization_id == org_id,
                ProductBarcode.product_variant_id == variant.id,
            )
            .order_by(ProductBarcode.is_primary.desc())
            .first()
        )

        if item_in.unit_price_override is not None:
            unit_price = to_decimal(item_in.unit_price_override, "unit_price_override")
        elif item_in.unit_price is not None:
            unit_price = to_decimal(item_in.unit_price, "unit_price")
        else:
            unit_price = _resolve_effective_variant_price(
                db, org_id, store.id, variant
            )

        line_gross = to_decimal(qty * unit_price)
        item_disc = to_decimal(item_in.discount_amount, "discount_amount")
        taxable_amount = max(Decimal("0.0000"), to_decimal(line_gross - item_disc))

        line_tax = Decimal("0.0000")
        if item_in.tax_amount is not None:
            line_tax = to_decimal(item_in.tax_amount, "tax_amount")
        elif item_in.tax_rate is not None:
            rate_dec = to_decimal(item_in.tax_rate, "tax_rate")
            line_tax = to_decimal(taxable_amount * rate_dec)

        line_total = to_decimal(taxable_amount + line_tax)

        order_item = OrderItem(
            organization_id=org_id,
            order_id=order.id,
            product_id=product.id,
            product_variant_id=variant.id,
            product_code_snapshot=product.product_code,
            product_name_snapshot=item_in.product_name_snapshot or product.name,
            variant_name_snapshot=item_in.variant_name_snapshot or variant.variant_name,
            barcode_snapshot=primary_bc.barcode if primary_bc else variant.sku,
            unit_name_snapshot=variant.unit_name,
            quantity=qty,
            unit_price=unit_price,
            discount_amount=item_disc,
            tax_amount=line_tax,
            line_total=line_total,
        )
        db.add(order_item)
        db.flush()

        if line_tax > Decimal("0.0000"):
            db.add(
                OrderTaxLine(
                    organization_id=org_id,
                    order_id=order.id,
                    order_item_id=order_item.id,
                    tax_code_snapshot=item_in.tax_code_snapshot or "VAT",
                    tax_name_snapshot=item_in.tax_name_snapshot or "VAT",
                    tax_rate=(
                        to_decimal(item_in.tax_rate)
                        if item_in.tax_rate is not None
                        else Decimal("0.1000")
                    ),
                    taxable_amount=taxable_amount,
                    tax_amount=line_tax,
                )
            )

        # Deduct stock if product tracks inventory
        if product.track_inventory and product.product_type == "stocked":
            apply_stock_movement(
                db,
                organization_id=org_id,
                store_id=store.id,
                product_variant_id=variant.id,
                movement_type="sale",
                quantity_delta=-qty,
                source_type="order",
                source_id=order.id,
                idempotency_key=f"sale:{order.id}:{order_item.id}",
                created_by=effective_cashier_id,
                allow_negative_stock=True,
                occurred_at=occurred_at,
            )

        subtotal_acc = to_decimal(subtotal_acc + line_gross)
        item_discount_acc = to_decimal(item_discount_acc + item_disc)
        tax_acc = to_decimal(tax_acc + line_tax)

    order_level_discount_acc = Decimal("0.0000")
    for disc_in in body.discounts:
        disc_amt = to_decimal(disc_in.amount, "amount")
        order_level_discount_acc = to_decimal(order_level_discount_acc + disc_amt)
        db.add(
            OrderDiscount(
                organization_id=org_id,
                order_id=order.id,
                discount_type=disc_in.discount_type,
                description=disc_in.description,
                rate=to_decimal(disc_in.rate) if disc_in.rate is not None else None,
                amount=disc_amt,
                approved_by=effective_cashier_id,
            )
        )

    total_discount = to_decimal(item_discount_acc + order_level_discount_acc)
    total_amount = max(
        Decimal("0.0000"),
        to_decimal(subtotal_acc - total_discount + tax_acc),
    )

    paid_acc = Decimal("0.0000")
    for idx, pay_in in enumerate(body.payments):
        pm: Optional[PaymentMethod] = None
        if pay_in.payment_method_id:
            pm = (
                db.query(PaymentMethod)
                .filter(
                    PaymentMethod.organization_id == org_id,
                    PaymentMethod.id == pay_in.payment_method_id,
                )
                .first()
            )
        elif pay_in.payment_method_code:
            pm = (
                db.query(PaymentMethod)
                .filter(
                    PaymentMethod.organization_id == org_id,
                    PaymentMethod.code == pay_in.payment_method_code.upper(),
                )
                .first()
            )
        if pm is None:
            raise NotFoundError(
                code="PAYMENT_METHOD_NOT_FOUND",
                message="Payment method not found in this organization.",
            )

        pay_amt = to_decimal(pay_in.amount, "amount")
        pay_idem = pay_in.idempotency_key or f"{idempotency_key}:pay:{idx}"
        pay_status = pay_in.payment_status or (
            "recorded_locally" if source == "pos_offline_sync" else "captured"
        )
        payment = Payment(
            organization_id=org_id,
            store_id=store.id,
            order_id=order.id,
            payment_method_id=pm.id,
            payment_number=f"{order.order_number}-P{idx + 1}",
            idempotency_key=pay_idem,
            amount=pay_amt,
            currency_code=order.currency_code,
            payment_status=pay_status,
            authorization_reference=pay_in.authorization_reference,
            recorded_at=occurred_at,
            captured_at=now if pay_status == "captured" else None,
            created_by=effective_cashier_id,
        )
        db.add(payment)
        paid_acc = to_decimal(paid_acc + pay_amt)

        if pm.method_type == "cash":
            open_session = (
                db.query(CashSession)
                .filter(
                    CashSession.organization_id == org_id,
                    CashSession.store_id == store.id,
                    CashSession.status == "open",
                )
                .order_by(CashSession.opened_at.desc())
                .first()
            )
            if open_session is not None:
                net_cash = min(pay_amt, total_amount)
                if net_cash > Decimal("0.0000"):
                    db.add(
                        CashMovement(
                            organization_id=org_id,
                            store_id=store.id,
                            cash_session_id=open_session.id,
                            movement_type="sale_cash",
                            amount=net_cash,
                            direction="in",
                            reference_type="order",
                            reference_id=order.id,
                            note=f"Cash sale {order.order_number}",
                            created_by=effective_cashier_id,
                        )
                    )

    change_amount = max(Decimal("0.0000"), to_decimal(paid_acc - total_amount))
    if paid_acc >= total_amount:
        payment_status = "paid"
    elif paid_acc > Decimal("0.0000"):
        payment_status = "partially_paid"
    else:
        payment_status = "unpaid"

    order.subtotal_amount = subtotal_acc
    order.discount_amount = total_discount
    order.tax_amount = tax_acc
    order.total_amount = total_amount
    order.paid_amount = paid_acc
    order.change_amount = change_amount
    order.payment_status = payment_status
    db.flush()

    serialized = _serialize_order(db, order)
    complete_idempotency_record(
        idem_record,
        response_status=201,
        response_data=serialized,
        resource_type="order",
        resource_id=order.id,
    )
    record_audit_event(
        db,
        action="sales.order_created",
        entity_type="order",
        actor_type=actor_type,
        actor_id=actor_id,
        organization_id=org_id,
        store_id=store.id,
        entity_id=order.id,
        request_id=request_id,
        metadata={
            "order_number": order.order_number,
            "total_amount": format_decimal(order.total_amount),
            "source": source,
        },
    )
    db.commit()
    return serialized, False


# ============================================================================
# Cash Drawers & Sessions Endpoints
# ============================================================================


@router.get("/cash-drawers")
def list_cash_drawers(
    store_id: Optional[str] = Query(default=None),
    x_store_id: Optional[str] = Header(default=None, alias="X-Store-ID"),
    principal: Principal = Depends(get_current_principal),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    _check_perm_or_device(principal, "cash_session.read")
    org_id = principal.organization.id
    store = verify_store_access(
        db,
        principal,
        requested_store_id=store_id,
        x_store_id=x_store_id,
        require_store=False,
    )
    query = db.query(CashDrawer).filter(CashDrawer.organization_id == org_id)
    if store is not None:
        query = query.filter(CashDrawer.store_id == store.id)
    rows = query.order_by(CashDrawer.code.asc()).all()
    items = [
        {
            "id": d.id,
            "organization_id": d.organization_id,
            "store_id": d.store_id,
            "code": d.code,
            "name": d.name,
            "status": d.status,
        }
        for d in rows
    ]
    return ok_response(
        items,
        request_id=request_id,
        meta=PaginationMeta(page_size=50, next_cursor=None, has_more=False),
    )


@router.post("/cash-drawers", status_code=status.HTTP_201_CREATED)
def create_cash_drawer(
    body: CreateCashDrawerRequest,
    principal: UserPrincipal = Depends(require_permission("cash_drawer.manage")),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> JSONResponse:
    org_id = principal.organization.id
    store = verify_store_access(db, principal, requested_store_id=body.store_id)
    assert store is not None
    drawer = CashDrawer(
        organization_id=org_id,
        store_id=store.id,
        code=body.code.strip().upper(),
        name=body.name.strip(),
        status=body.status,
    )
    db.add(drawer)
    db.commit()
    db.refresh(drawer)
    return JSONResponse(
        status_code=status.HTTP_201_CREATED,
        content=ok_response(
            {
                "id": drawer.id,
                "organization_id": drawer.organization_id,
                "store_id": drawer.store_id,
                "code": drawer.code,
                "name": drawer.name,
                "status": drawer.status,
            },
            request_id=request_id,
        ),
    )


@router.patch("/cash-drawers/{drawer_id}")
def update_cash_drawer(
    drawer_id: str,
    body: UpdateCashDrawerRequest,
    principal: UserPrincipal = Depends(require_permission("cash_drawer.manage")),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    org_id = principal.organization.id
    drawer = (
        db.query(CashDrawer)
        .filter(
            CashDrawer.organization_id == org_id,
            CashDrawer.id == drawer_id,
        )
        .first()
    )
    if drawer is None:
        raise NotFoundError(
            code="CASH_DRAWER_NOT_FOUND",
            message="Cash drawer not found.",
        )
    verify_store_access(db, principal, requested_store_id=drawer.store_id)
    if body.name is not None:
        drawer.name = body.name.strip()
    if body.status is not None:
        drawer.status = body.status
    db.commit()
    db.refresh(drawer)
    return ok_response(
        {
            "id": drawer.id,
            "organization_id": drawer.organization_id,
            "store_id": drawer.store_id,
            "code": drawer.code,
            "name": drawer.name,
            "status": drawer.status,
        },
        request_id=request_id,
    )


@router.get("/cash-sessions")
def list_cash_sessions(
    store_id: Optional[str] = Query(default=None),
    session_status: Optional[str] = Query(default=None, alias="status"),
    x_store_id: Optional[str] = Header(default=None, alias="X-Store-ID"),
    principal: Principal = Depends(get_current_principal),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    _check_perm_or_device(principal, "cash_session.read")
    org_id = principal.organization.id
    store = verify_store_access(
        db,
        principal,
        requested_store_id=store_id,
        x_store_id=x_store_id,
        require_store=False,
    )
    query = db.query(CashSession).filter(CashSession.organization_id == org_id)
    if store is not None:
        query = query.filter(CashSession.store_id == store.id)
    if session_status:
        query = query.filter(CashSession.status == session_status)
    rows = query.order_by(CashSession.opened_at.desc()).all()
    return ok_response(
        [_serialize_cash_session(s) for s in rows],
        request_id=request_id,
        meta=PaginationMeta(page_size=50, next_cursor=None, has_more=False),
    )


@router.post("/cash-sessions/open", status_code=status.HTTP_201_CREATED)
def open_cash_session(
    body: OpenCashSessionRequest,
    principal: Principal = Depends(get_current_principal),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> JSONResponse:
    _check_perm_or_device(principal, "cash_session.open")
    org_id = principal.organization.id
    store = verify_store_access(db, principal, requested_store_id=body.store_id)
    assert store is not None

    drawer = (
        db.query(CashDrawer)
        .filter(
            CashDrawer.organization_id == org_id,
            CashDrawer.id == body.cash_drawer_id,
            CashDrawer.store_id == store.id,
        )
        .first()
    )
    if drawer is None:
        raise NotFoundError(
            code="CASH_DRAWER_NOT_FOUND",
            message="Cash drawer not found in this store.",
        )

    existing_open = (
        db.query(CashSession)
        .filter(
            CashSession.organization_id == org_id,
            CashSession.cash_drawer_id == drawer.id,
            CashSession.status == "open",
        )
        .first()
    )
    if existing_open is not None:
        raise ConflictError(
            code="CASH_SESSION_ALREADY_OPEN",
            message="Cash drawer already has an open cash session.",
        )

    opening_amt = to_decimal(body.opening_amount, "opening_amount")
    _, actor_id, user_id, device_id = _actor_info(principal)
    opened_by = user_id or actor_id

    session = CashSession(
        organization_id=org_id,
        store_id=store.id,
        cash_drawer_id=drawer.id,
        device_id=body.device_id or device_id,
        opened_by=opened_by,
        status="open",
        currency_code=body.currency_code.upper(),
        opening_amount=opening_amt,
    )
    db.add(session)
    db.flush()

    if opening_amt > Decimal("0.0000"):
        db.add(
            CashMovement(
                organization_id=org_id,
                store_id=store.id,
                cash_session_id=session.id,
                movement_type="opening",
                amount=opening_amt,
                direction="in",
                note="Opening float",
                created_by=opened_by,
            )
        )

    db.commit()
    db.refresh(session)
    return JSONResponse(
        status_code=status.HTTP_201_CREATED,
        content=ok_response(_serialize_cash_session(session), request_id=request_id),
    )


@router.get("/cash-sessions/{session_id}")
def get_cash_session(
    session_id: str,
    principal: Principal = Depends(get_current_principal),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    _check_perm_or_device(principal, "cash_session.read")
    org_id = principal.organization.id
    session = (
        db.query(CashSession)
        .filter(
            CashSession.organization_id == org_id,
            CashSession.id == session_id,
        )
        .first()
    )
    if session is None:
        raise NotFoundError(
            code="CASH_SESSION_NOT_FOUND",
            message="Cash session not found.",
        )
    verify_store_access(db, principal, requested_store_id=session.store_id)
    movements = (
        db.query(CashMovement)
        .filter(
            CashMovement.organization_id == org_id,
            CashMovement.cash_session_id == session.id,
        )
        .order_by(CashMovement.created_at.asc())
        .all()
    )
    data = _serialize_cash_session(session)
    data["movements"] = [
        {
            "id": m.id,
            "movement_type": m.movement_type,
            "direction": m.direction,
            "amount": format_decimal(m.amount),
            "reference_type": m.reference_type,
            "reference_id": m.reference_id,
            "note": m.note,
            "created_at": m.created_at.isoformat(),
        }
        for m in movements
    ]
    return ok_response(data, request_id=request_id)


@router.post(
    "/cash-sessions/{session_id}/movements", status_code=status.HTTP_201_CREATED
)
def create_cash_movement(
    session_id: str,
    body: CreateCashMovementRequest,
    principal: Principal = Depends(get_current_principal),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> JSONResponse:
    _check_perm_or_device(principal, "cash_movement.create")
    org_id = principal.organization.id
    session = (
        db.query(CashSession)
        .filter(
            CashSession.organization_id == org_id,
            CashSession.id == session_id,
        )
        .first()
    )
    if session is None:
        raise NotFoundError(
            code="CASH_SESSION_NOT_FOUND",
            message="Cash session not found.",
        )
    verify_store_access(db, principal, requested_store_id=session.store_id)
    if session.status != "open":
        raise ConflictError(
            code="CASH_SESSION_CLOSED",
            message="Cannot record cash movements on a closed cash session.",
        )

    amt = to_decimal(body.amount, "amount")
    if amt <= Decimal("0.0000"):
        raise ValidationAppError(
            code="INVALID_AMOUNT",
            message="Movement amount must be greater than zero.",
        )

    direction = body.direction or ("in" if body.movement_type == "cash_in" else "out")
    _, actor_id, user_id, _ = _actor_info(principal)
    movement = CashMovement(
        organization_id=org_id,
        store_id=session.store_id,
        cash_session_id=session.id,
        movement_type=body.movement_type,
        amount=amt,
        direction=direction,
        note=body.note,
        created_by=user_id or actor_id,
    )
    db.add(movement)
    db.commit()
    db.refresh(movement)
    return JSONResponse(
        status_code=status.HTTP_201_CREATED,
        content=ok_response(
            {
                "id": movement.id,
                "cash_session_id": movement.cash_session_id,
                "movement_type": movement.movement_type,
                "direction": movement.direction,
                "amount": format_decimal(movement.amount),
                "note": movement.note,
                "created_at": movement.created_at.isoformat(),
            },
            request_id=request_id,
        ),
    )


@router.post("/cash-sessions/{session_id}/close")
def close_cash_session(
    session_id: str,
    body: CloseCashSessionRequest,
    principal: Principal = Depends(get_current_principal),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    _check_perm_or_device(principal, "cash_session.close")
    org_id = principal.organization.id
    session = (
        db.query(CashSession)
        .filter(
            CashSession.organization_id == org_id,
            CashSession.id == session_id,
        )
        .first()
    )
    if session is None:
        raise NotFoundError(
            code="CASH_SESSION_NOT_FOUND",
            message="Cash session not found.",
        )
    verify_store_access(db, principal, requested_store_id=session.store_id)
    if session.status != "open":
        raise ConflictError(
            code="CASH_SESSION_ALREADY_CLOSED",
            message="Cash session is already closed.",
        )

    movements = (
        db.query(CashMovement)
        .filter(
            CashMovement.organization_id == org_id,
            CashMovement.cash_session_id == session.id,
        )
        .all()
    )

    expected = Decimal("0.0000")
    for m in movements:
        if m.direction == "in":
            expected = to_decimal(expected + to_decimal(m.amount))
        else:
            expected = to_decimal(expected - to_decimal(m.amount))

    actual = to_decimal(body.actual_closing_amount, "actual_closing_amount")
    diff = to_decimal(actual - expected)
    _, actor_id, user_id, _ = _actor_info(principal)

    session.status = "closed"
    session.closed_by = user_id or actor_id
    session.expected_closing_amount = expected
    session.actual_closing_amount = actual
    session.difference_amount = diff
    session.closed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(session)
    return ok_response(_serialize_cash_session(session), request_id=request_id)


@router.post("/cash-sessions/{session_id}/review")
def review_cash_session(
    session_id: str,
    principal: UserPrincipal = Depends(require_permission("cash_session.review")),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    org_id = principal.organization.id
    session = (
        db.query(CashSession)
        .filter(
            CashSession.organization_id == org_id,
            CashSession.id == session_id,
        )
        .first()
    )
    if session is None:
        raise NotFoundError(
            code="CASH_SESSION_NOT_FOUND",
            message="Cash session not found.",
        )
    verify_store_access(db, principal, requested_store_id=session.store_id)
    session.status = "reviewed"
    db.commit()
    db.refresh(session)
    return ok_response(_serialize_cash_session(session), request_id=request_id)


# ============================================================================
# Payment Methods Endpoints
# ============================================================================


@router.get("/payment-methods")
def list_payment_methods(
    principal: Principal = Depends(get_current_principal),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    org_id = principal.organization.id
    rows = (
        db.query(PaymentMethod)
        .filter(PaymentMethod.organization_id == org_id)
        .order_by(PaymentMethod.code.asc())
        .all()
    )
    items = [
        {
            "id": pm.id,
            "organization_id": pm.organization_id,
            "code": pm.code,
            "name": pm.name,
            "method_type": pm.method_type,
            "supports_offline_recording": pm.supports_offline_recording,
            "requires_external_authorization": pm.requires_external_authorization,
            "status": pm.status,
        }
        for pm in rows
    ]
    return ok_response(
        items,
        request_id=request_id,
        meta=PaginationMeta(page_size=50, next_cursor=None, has_more=False),
    )


@router.post("/payment-methods", status_code=status.HTTP_201_CREATED)
def create_payment_method(
    body: CreatePaymentMethodRequest,
    principal: UserPrincipal = Depends(require_permission("payments.methods.manage")),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> JSONResponse:
    org_id = principal.organization.id
    code = body.code.strip().upper()
    existing = (
        db.query(PaymentMethod)
        .filter(
            PaymentMethod.organization_id == org_id,
            PaymentMethod.code == code,
        )
        .first()
    )
    if existing is not None:
        raise ConflictError(
            code="PAYMENT_METHOD_CODE_CONFLICT",
            message=f"Payment method '{code}' already exists.",
        )
    pm = PaymentMethod(
        organization_id=org_id,
        code=code,
        name=body.name.strip(),
        method_type=body.method_type,
        supports_offline_recording=body.supports_offline_recording,
        requires_external_authorization=body.requires_external_authorization,
        status=body.status,
    )
    db.add(pm)
    db.commit()
    db.refresh(pm)
    return JSONResponse(
        status_code=status.HTTP_201_CREATED,
        content=ok_response(
            {
                "id": pm.id,
                "organization_id": pm.organization_id,
                "code": pm.code,
                "name": pm.name,
                "method_type": pm.method_type,
                "supports_offline_recording": pm.supports_offline_recording,
                "requires_external_authorization": pm.requires_external_authorization,
                "status": pm.status,
            },
            request_id=request_id,
        ),
    )


@router.patch("/payment-methods/{method_id}")
def update_payment_method(
    method_id: str,
    body: UpdatePaymentMethodRequest,
    principal: UserPrincipal = Depends(require_permission("payments.methods.manage")),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    org_id = principal.organization.id
    pm = (
        db.query(PaymentMethod)
        .filter(
            PaymentMethod.organization_id == org_id,
            PaymentMethod.id == method_id,
        )
        .first()
    )
    if pm is None:
        raise NotFoundError(
            code="PAYMENT_METHOD_NOT_FOUND",
            message="Payment method not found.",
        )
    if body.name is not None:
        pm.name = body.name.strip()
    if body.supports_offline_recording is not None:
        pm.supports_offline_recording = body.supports_offline_recording
    if body.requires_external_authorization is not None:
        pm.requires_external_authorization = body.requires_external_authorization
    if body.status is not None:
        pm.status = body.status
    db.commit()
    db.refresh(pm)
    return ok_response(
        {
            "id": pm.id,
            "organization_id": pm.organization_id,
            "code": pm.code,
            "name": pm.name,
            "method_type": pm.method_type,
            "supports_offline_recording": pm.supports_offline_recording,
            "requires_external_authorization": pm.requires_external_authorization,
            "status": pm.status,
        },
        request_id=request_id,
    )


# ============================================================================
# Orders Endpoints
# ============================================================================


@router.get("/orders")
def list_orders(
    store_id: Optional[str] = Query(default=None),
    order_status: Optional[str] = Query(default=None),
    x_store_id: Optional[str] = Header(default=None, alias="X-Store-ID"),
    principal: Principal = Depends(get_current_principal),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    _check_perm_or_device(principal, "sales.order.read")
    org_id = principal.organization.id
    store = verify_store_access(
        db,
        principal,
        requested_store_id=store_id,
        x_store_id=x_store_id,
        require_store=False,
    )
    query = db.query(Order).filter(Order.organization_id == org_id)
    if store is not None:
        query = query.filter(Order.store_id == store.id)
    if order_status:
        query = query.filter(Order.order_status == order_status)
    rows = query.order_by(Order.created_at.desc()).all()
    return ok_response(
        [_serialize_order(db, o) for o in rows],
        request_id=request_id,
        meta=PaginationMeta(page_size=50, next_cursor=None, has_more=False),
    )


@router.post("/orders", status_code=status.HTTP_201_CREATED)
def create_order_endpoint(
    body: CreateOrderRequest,
    idempotency_key_header: Optional[str] = Header(
        default=None, alias="Idempotency-Key"
    ),
    principal: Principal = Depends(get_current_principal),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> JSONResponse:
    _check_perm_or_device(principal, "sales.order.create")
    idem_key = idempotency_key_header or body.idempotency_key
    if not idem_key:
        raise ValidationAppError(
            code="IDEMPOTENCY_KEY_REQUIRED",
            message="Idempotency-Key header or idempotency_key field is required for order creation.",
        )

    order_data, is_replayed = create_order_tx(
        db=db,
        principal=principal,
        body=body,
        idempotency_key=idem_key,
        source="pos" if isinstance(principal, DevicePrincipal) else "web_admin",
        request_id=request_id,
    )
    status_code = status.HTTP_200_OK if is_replayed else status.HTTP_201_CREATED
    return JSONResponse(
        status_code=status_code,
        content=ok_response(order_data, request_id=request_id),
    )


@router.get("/orders/{order_id}")
def get_order(
    order_id: str,
    principal: Principal = Depends(get_current_principal),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    _check_perm_or_device(principal, "sales.order.read")
    org_id = principal.organization.id
    order = (
        db.query(Order)
        .filter(
            Order.organization_id == org_id,
            Order.id == order_id,
        )
        .first()
    )
    if order is None:
        raise NotFoundError(
            code="ORDER_NOT_FOUND",
            message="Order not found in this organization.",
        )
    verify_store_access(db, principal, requested_store_id=order.store_id)
    return ok_response(_serialize_order(db, order), request_id=request_id)


@router.post("/orders/{order_id}/void")
def void_order(
    order_id: str,
    body: VoidOrderRequest,
    principal: Principal = Depends(get_current_principal),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    _check_perm_or_device(principal, "sales.order.void")
    org_id = principal.organization.id
    order = (
        db.query(Order)
        .filter(
            Order.organization_id == org_id,
            Order.id == order_id,
        )
        .first()
    )
    if order is None:
        raise NotFoundError(
            code="ORDER_NOT_FOUND",
            message="Order not found in this organization.",
        )
    verify_store_access(db, principal, requested_store_id=order.store_id)
    if order.order_status == "cancelled":
        return ok_response(_serialize_order(db, order), request_id=request_id)

    order.order_status = "cancelled"
    order.note = f"{order.note or ''} [VOID: {body.reason}]".strip()
    actor_type, actor_id, user_id, _ = _actor_info(principal)

    items = (
        db.query(OrderItem)
        .filter(
            OrderItem.organization_id == org_id,
            OrderItem.order_id == order.id,
        )
        .all()
    )
    for it in items:
        if it.product_variant_id and it.product_id:
            product = (
                db.query(Product)
                .filter(
                    Product.organization_id == org_id,
                    Product.id == it.product_id,
                )
                .first()
            )
            if product and product.track_inventory and product.product_type == "stocked":
                apply_stock_movement(
                    db,
                    organization_id=org_id,
                    store_id=order.store_id,
                    product_variant_id=it.product_variant_id,
                    movement_type="refund",
                    quantity_delta=to_decimal(it.quantity),
                    source_type="order_void",
                    source_id=order.id,
                    idempotency_key=f"void:{order.id}:{it.id}",
                    created_by=user_id,
                )

    record_audit_event(
        db,
        action="sales.order_voided",
        entity_type="order",
        actor_type=actor_type,
        actor_id=actor_id,
        organization_id=org_id,
        store_id=order.store_id,
        entity_id=order.id,
        request_id=request_id,
        metadata={"reason": body.reason},
    )
    db.commit()
    db.refresh(order)
    return ok_response(_serialize_order(db, order), request_id=request_id)


@router.post("/orders/{order_id}/payments", status_code=status.HTTP_201_CREATED)
def record_order_payment(
    order_id: str,
    body: RecordOrderPaymentRequest,
    idempotency_key_header: Optional[str] = Header(
        default=None, alias="Idempotency-Key"
    ),
    principal: Principal = Depends(get_current_principal),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> JSONResponse:
    _check_perm_or_device(principal, "sales.payment.record")
    org_id = principal.organization.id
    order = (
        db.query(Order)
        .filter(
            Order.organization_id == org_id,
            Order.id == order_id,
        )
        .first()
    )
    if order is None:
        raise NotFoundError(
            code="ORDER_NOT_FOUND",
            message="Order not found.",
        )
    verify_store_access(db, principal, requested_store_id=order.store_id)

    idem_key = idempotency_key_header or body.idempotency_key
    if not idem_key:
        raise ValidationAppError(
            code="IDEMPOTENCY_KEY_REQUIRED",
            message="Idempotency-Key is required for payment recording.",
        )

    existing_payment = (
        db.query(Payment)
        .filter(
            Payment.organization_id == org_id,
            Payment.idempotency_key == idem_key,
        )
        .first()
    )
    if existing_payment is not None:
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=ok_response(_serialize_order(db, order), request_id=request_id),
        )

    pm: Optional[PaymentMethod] = None
    if body.payment_method_id:
        pm = (
            db.query(PaymentMethod)
            .filter(
                PaymentMethod.organization_id == org_id,
                PaymentMethod.id == body.payment_method_id,
            )
            .first()
        )
    elif body.payment_method_code:
        pm = (
            db.query(PaymentMethod)
            .filter(
                PaymentMethod.organization_id == org_id,
                PaymentMethod.code == body.payment_method_code.upper(),
            )
            .first()
        )
    if pm is None:
        raise NotFoundError(
            code="PAYMENT_METHOD_NOT_FOUND",
            message="Payment method not found.",
        )

    amt = to_decimal(body.amount, "amount")
    now = datetime.now(timezone.utc)
    _, actor_id, user_id, _ = _actor_info(principal)
    payment = Payment(
        organization_id=org_id,
        store_id=order.store_id,
        order_id=order.id,
        payment_method_id=pm.id,
        idempotency_key=idem_key,
        amount=amt,
        currency_code=order.currency_code,
        payment_status="captured",
        authorization_reference=body.authorization_reference,
        provider_code=body.provider_code,
        provider_transaction_id=body.provider_transaction_id,
        recorded_at=now,
        captured_at=now,
        created_by=user_id or actor_id,
    )
    db.add(payment)

    new_paid = to_decimal(to_decimal(order.paid_amount) + amt)
    order.paid_amount = new_paid
    order.change_amount = max(
        Decimal("0.0000"),
        to_decimal(new_paid - to_decimal(order.total_amount)),
    )
    order.payment_status = (
        "paid" if new_paid >= to_decimal(order.total_amount) else "partially_paid"
    )
    db.commit()
    db.refresh(order)
    return JSONResponse(
        status_code=status.HTTP_201_CREATED,
        content=ok_response(_serialize_order(db, order), request_id=request_id),
    )


@router.get("/orders/{order_id}/payments")
def list_order_payments(
    order_id: str,
    principal: Principal = Depends(get_current_principal),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    _check_perm_or_device(principal, "sales.order.read")
    org_id = principal.organization.id
    order = (
        db.query(Order)
        .filter(
            Order.organization_id == org_id,
            Order.id == order_id,
        )
        .first()
    )
    if order is None:
        raise NotFoundError(
            code="ORDER_NOT_FOUND",
            message="Order not found.",
        )
    verify_store_access(db, principal, requested_store_id=order.store_id)
    payments = (
        db.query(Payment)
        .filter(
            Payment.organization_id == org_id,
            Payment.order_id == order.id,
        )
        .order_by(Payment.created_at.asc())
        .all()
    )
    return ok_response(
        [
            {
                "id": p.id,
                "order_id": p.order_id,
                "payment_method_id": p.payment_method_id,
                "payment_number": p.payment_number,
                "idempotency_key": p.idempotency_key,
                "amount": format_decimal(p.amount),
                "currency_code": p.currency_code,
                "payment_status": p.payment_status,
                "recorded_at": p.recorded_at.isoformat(),
            }
            for p in payments
        ],
        request_id=request_id,
        meta=PaginationMeta(page_size=50, next_cursor=None, has_more=False),
    )


# ============================================================================
# Refunds Endpoints
# ============================================================================


@router.post("/orders/{order_id}/refunds", status_code=status.HTTP_201_CREATED)
def create_refund(
    order_id: str,
    body: CreateRefundRequest,
    principal: Principal = Depends(get_current_principal),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> JSONResponse:
    _check_perm_or_device(principal, "sales.refund.create")
    org_id = principal.organization.id
    order = (
        db.query(Order)
        .filter(
            Order.organization_id == org_id,
            Order.id == order_id,
        )
        .first()
    )
    if order is None:
        raise NotFoundError(
            code="ORDER_NOT_FOUND",
            message="Order not found.",
        )
    store = verify_store_access(db, principal, requested_store_id=order.store_id)
    assert store is not None

    now = datetime.now(timezone.utc)
    occurred_at = body.occurred_at or now
    actor_type, actor_id, user_id, _ = _actor_info(principal)
    actor_user_id = user_id or actor_id

    refund_number = next_store_document_number(
        db, org_id, store.id, store.code, "refund", "RFD-"
    )

    refund_total = Decimal("0.0000")
    for item_in in body.items:
        refund_total = to_decimal(
            refund_total + to_decimal(item_in.refund_amount, "refund_amount")
        )

    refund = Refund(
        organization_id=org_id,
        store_id=order.store_id,
        order_id=order.id,
        refund_number=refund_number,
        status="completed",
        reason=body.reason,
        currency_code=order.currency_code,
        refund_total=refund_total,
        occurred_at=occurred_at,
        created_by=actor_user_id,
        completed_at=now,
        completed_by=actor_user_id,
    )
    db.add(refund)
    db.flush()

    serialized_items: List[Dict[str, Any]] = []
    for item_in in body.items:
        order_item = (
            db.query(OrderItem)
            .filter(
                OrderItem.organization_id == org_id,
                OrderItem.order_id == order.id,
                OrderItem.id == item_in.order_item_id,
            )
            .first()
        )
        if order_item is None:
            raise NotFoundError(
                code="ORDER_ITEM_NOT_FOUND",
                message=f"Order item '{item_in.order_item_id}' not found on this order.",
            )

        qty = to_decimal(item_in.quantity, "quantity")
        restock_qty = to_decimal(item_in.restock_quantity, "restock_quantity")
        if restock_qty > qty:
            raise ValidationAppError(
                code="INVALID_RESTOCK_QUANTITY",
                message="restock_quantity cannot exceed refunded quantity.",
            )

        restock_store_id = item_in.restock_store_id or order.store_id
        ri = RefundItem(
            organization_id=org_id,
            refund_id=refund.id,
            order_item_id=order_item.id,
            quantity=qty,
            refund_amount=to_decimal(item_in.refund_amount, "refund_amount"),
            restock_quantity=restock_qty,
            restock_store_id=restock_store_id,
        )
        db.add(ri)
        db.flush()

        if (
            restock_qty > Decimal("0.0000")
            and order_item.product_variant_id
            and order_item.product_id
        ):
            product = (
                db.query(Product)
                .filter(
                    Product.organization_id == org_id,
                    Product.id == order_item.product_id,
                )
                .first()
            )
            if product and product.track_inventory and product.product_type == "stocked":
                apply_stock_movement(
                    db,
                    organization_id=org_id,
                    store_id=restock_store_id,
                    product_variant_id=order_item.product_variant_id,
                    movement_type="refund",
                    quantity_delta=restock_qty,
                    source_type="refund",
                    source_id=refund.id,
                    idempotency_key=f"refund:{refund.id}:{ri.id}",
                    created_by=actor_user_id,
                    occurred_at=occurred_at,
                )

        serialized_items.append(
            {
                "id": ri.id,
                "order_item_id": ri.order_item_id,
                "quantity": format_decimal(ri.quantity),
                "refund_amount": format_decimal(ri.refund_amount),
                "restock_quantity": format_decimal(ri.restock_quantity),
                "restock_store_id": ri.restock_store_id,
            }
        )

    if refund_total >= to_decimal(order.total_amount):
        order.order_status = "refunded"
        order.payment_status = "refunded"
    else:
        order.order_status = "partially_refunded"
        order.payment_status = "partially_refunded"

    record_audit_event(
        db,
        action="sales.refund_created",
        entity_type="refund",
        actor_type=actor_type,
        actor_id=actor_id,
        organization_id=org_id,
        store_id=order.store_id,
        entity_id=refund.id,
        request_id=request_id,
        metadata={
            "order_id": order.id,
            "refund_number": refund.refund_number,
            "refund_total": format_decimal(refund.refund_total),
        },
    )
    db.commit()
    return JSONResponse(
        status_code=status.HTTP_201_CREATED,
        content=ok_response(
            {
                "id": refund.id,
                "organization_id": refund.organization_id,
                "store_id": refund.store_id,
                "order_id": refund.order_id,
                "refund_number": refund.refund_number,
                "status": refund.status,
                "reason": refund.reason,
                "currency_code": refund.currency_code,
                "refund_total": format_decimal(refund.refund_total),
                "occurred_at": refund.occurred_at.isoformat(),
                "items": serialized_items,
            },
            request_id=request_id,
        ),
    )


@router.get("/refunds")
def list_refunds(
    store_id: Optional[str] = Query(default=None),
    x_store_id: Optional[str] = Header(default=None, alias="X-Store-ID"),
    principal: Principal = Depends(get_current_principal),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    _check_perm_or_device(principal, "sales.refund.read")
    org_id = principal.organization.id
    store = verify_store_access(
        db,
        principal,
        requested_store_id=store_id,
        x_store_id=x_store_id,
        require_store=False,
    )
    query = db.query(Refund).filter(Refund.organization_id == org_id)
    if store is not None:
        query = query.filter(Refund.store_id == store.id)
    rows = query.order_by(Refund.created_at.desc()).all()
    items = [
        {
            "id": r.id,
            "organization_id": r.organization_id,
            "store_id": r.store_id,
            "order_id": r.order_id,
            "refund_number": r.refund_number,
            "status": r.status,
            "reason": r.reason,
            "currency_code": r.currency_code,
            "refund_total": format_decimal(r.refund_total),
            "occurred_at": r.occurred_at.isoformat(),
        }
        for r in rows
    ]
    return ok_response(
        items,
        request_id=request_id,
        meta=PaginationMeta(page_size=50, next_cursor=None, has_more=False),
    )


@router.get("/refunds/{refund_id}")
def get_refund(
    refund_id: str,
    principal: Principal = Depends(get_current_principal),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    _check_perm_or_device(principal, "sales.refund.read")
    org_id = principal.organization.id
    r = (
        db.query(Refund)
        .filter(
            Refund.organization_id == org_id,
            Refund.id == refund_id,
        )
        .first()
    )
    if r is None:
        raise NotFoundError(
            code="REFUND_NOT_FOUND",
            message="Refund not found.",
        )
    verify_store_access(db, principal, requested_store_id=r.store_id)
    items = (
        db.query(RefundItem)
        .filter(
            RefundItem.organization_id == org_id,
            RefundItem.refund_id == r.id,
        )
        .all()
    )
    return ok_response(
        {
            "id": r.id,
            "organization_id": r.organization_id,
            "store_id": r.store_id,
            "order_id": r.order_id,
            "refund_number": r.refund_number,
            "status": r.status,
            "reason": r.reason,
            "currency_code": r.currency_code,
            "refund_total": format_decimal(r.refund_total),
            "occurred_at": r.occurred_at.isoformat(),
            "items": [
                {
                    "id": i.id,
                    "order_item_id": i.order_item_id,
                    "quantity": format_decimal(i.quantity),
                    "refund_amount": format_decimal(i.refund_amount),
                    "restock_quantity": format_decimal(i.restock_quantity),
                    "restock_store_id": i.restock_store_id,
                }
                for i in items
            ],
        },
        request_id=request_id,
    )


# ============================================================================
# Operational Reports Endpoints
# ============================================================================


@router.get("/reports/sales/summary")
def get_sales_summary_report(
    store_id: Optional[str] = Query(default=None),
    x_store_id: Optional[str] = Header(default=None, alias="X-Store-ID"),
    principal: UserPrincipal = Depends(require_permission("reports.read")),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    org_id = principal.organization.id
    store = verify_store_access(
        db,
        principal,
        requested_store_id=store_id,
        x_store_id=x_store_id,
        require_store=False,
    )
    query = db.query(Order).filter(
        Order.organization_id == org_id,
        Order.order_status != "cancelled",
    )
    if store is not None:
        query = query.filter(Order.store_id == store.id)
    orders = query.all()

    gross_sales = Decimal("0.0000")
    total_discounts = Decimal("0.0000")
    total_tax = Decimal("0.0000")
    net_sales = Decimal("0.0000")
    for o in orders:
        gross_sales = to_decimal(gross_sales + to_decimal(o.subtotal_amount))
        total_discounts = to_decimal(total_discounts + to_decimal(o.discount_amount))
        total_tax = to_decimal(total_tax + to_decimal(o.tax_amount))
        net_sales = to_decimal(net_sales + to_decimal(o.total_amount))

    return ok_response(
        {
            "order_count": len(orders),
            "gross_sales_amount": format_decimal(gross_sales),
            "discount_amount": format_decimal(total_discounts),
            "tax_amount": format_decimal(total_tax),
            "net_sales_amount": format_decimal(net_sales),
        },
        request_id=request_id,
    )


@router.get("/reports/payments/summary")
def get_payments_summary_report(
    store_id: Optional[str] = Query(default=None),
    x_store_id: Optional[str] = Header(default=None, alias="X-Store-ID"),
    principal: UserPrincipal = Depends(require_permission("reports.read")),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    org_id = principal.organization.id
    store = verify_store_access(
        db,
        principal,
        requested_store_id=store_id,
        x_store_id=x_store_id,
        require_store=False,
    )
    query = db.query(Payment).filter(Payment.organization_id == org_id)
    if store is not None:
        query = query.filter(Payment.store_id == store.id)
    payments = query.all()

    total_collected = Decimal("0.0000")
    by_method: Dict[str, Decimal] = {}
    for p in payments:
        amt = to_decimal(p.amount)
        total_collected = to_decimal(total_collected + amt)
        by_method[p.payment_method_id] = to_decimal(
            by_method.get(p.payment_method_id, Decimal("0.0000")) + amt
        )

    return ok_response(
        {
            "payment_count": len(payments),
            "total_collected_amount": format_decimal(total_collected),
            "by_payment_method_id": {
                k: format_decimal(v) for k, v in by_method.items()
            },
        },
        request_id=request_id,
    )


@router.get("/reports/inventory/summary")
def get_inventory_summary_report(
    store_id: Optional[str] = Query(default=None),
    x_store_id: Optional[str] = Header(default=None, alias="X-Store-ID"),
    principal: UserPrincipal = Depends(require_permission("reports.read")),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    org_id = principal.organization.id
    store = verify_store_access(
        db,
        principal,
        requested_store_id=store_id,
        x_store_id=x_store_id,
        require_store=False,
    )
    query = db.query(Inventory).filter(Inventory.organization_id == org_id)
    if store is not None:
        query = query.filter(Inventory.store_id == store.id)
    balances = query.all()

    total_on_hand = Decimal("0.0000")
    low_stock_count = 0
    for b in balances:
        on_hand = to_decimal(b.on_hand_quantity)
        total_on_hand = to_decimal(total_on_hand + on_hand)
        if on_hand <= Decimal("0.0000"):
            low_stock_count += 1

    return ok_response(
        {
            "tracked_sku_store_pairs": len(balances),
            "total_on_hand_quantity": format_decimal(total_on_hand),
            "low_stock_count": low_stock_count,
        },
        request_id=request_id,
    )
