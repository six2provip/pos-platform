"""Discount codes & vouchers API (`/api/v1/discounts/*`)."""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy.orm import Session

from app.api.deps import (
    Principal,
    UserPrincipal,
    get_current_principal,
    get_db,
    get_request_id,
    require_permission,
)
from app.core.envelope import ok_response
from app.core.exceptions import ConflictError, NotFoundError, ValidationAppError
from app.core.money import format_decimal, to_decimal
from app.infrastructure.models import DiscountCode
from app.modules.audit.service import record_audit_event

router = APIRouter(prefix="/discounts", tags=["Discounts"])


def _ensure_utc(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def serialize_discount_code(dc: DiscountCode) -> Dict[str, Any]:
    return {
        "id": dc.id,
        "organization_id": dc.organization_id,
        "code": dc.code,
        "name": dc.name,
        "description": dc.description,
        "discount_type": dc.discount_type,
        "value": format_decimal(dc.value),
        "max_discount_amount": (
            format_decimal(dc.max_discount_amount)
            if dc.max_discount_amount is not None
            else None
        ),
        "min_order_amount": format_decimal(dc.min_order_amount),
        "usage_limit": dc.usage_limit,
        "used_count": dc.used_count,
        "starts_at": dc.starts_at.isoformat() if dc.starts_at else None,
        "ends_at": dc.ends_at.isoformat() if dc.ends_at else None,
        "store_ids": dc.store_ids_json or [],
        "status": dc.status,
        "created_at": dc.created_at.isoformat(),
        "updated_at": dc.updated_at.isoformat(),
    }


def validate_and_compute_discount(
    db: Session,
    *,
    organization_id: str,
    code: str,
    store_id: str,
    subtotal: Decimal,
) -> tuple[DiscountCode, Decimal]:
    """Validate a discount code against store, schedule, quota, and min subtotal."""
    norm_code = code.strip().upper()
    if not norm_code:
        raise ValidationAppError(
            code="INVALID_DISCOUNT_CODE",
            message="Mã giảm giá không được để trống.",
        )

    dc = (
        db.query(DiscountCode)
        .filter(
            DiscountCode.organization_id == organization_id,
            DiscountCode.code == norm_code,
            DiscountCode.deleted_at.is_(None),
        )
        .first()
    )
    if dc is None:
        raise NotFoundError(
            code="DISCOUNT_CODE_NOT_FOUND",
            message=f"Mã giảm giá '{norm_code}' không tồn tại.",
        )

    if dc.status != "active":
        raise ValidationAppError(
            code="DISCOUNT_CODE_INACTIVE",
            message=f"Mã giảm giá '{norm_code}' hiện đang tạm dừng.",
        )

    now = datetime.now(timezone.utc)
    starts_at = _ensure_utc(dc.starts_at)
    ends_at = _ensure_utc(dc.ends_at)
    if starts_at is not None and now < starts_at:
        raise ValidationAppError(
            code="DISCOUNT_CODE_NOT_STARTED",
            message=f"Mã giảm giá '{norm_code}' chưa đến thời gian áp dụng.",
        )
    if ends_at is not None and now > ends_at:
        raise ValidationAppError(
            code="DISCOUNT_CODE_EXPIRED",
            message=f"Mã giảm giá '{norm_code}' đã hết hạn sử dụng.",
        )

    if dc.usage_limit is not None and dc.used_count >= dc.usage_limit:
        raise ValidationAppError(
            code="DISCOUNT_CODE_EXHAUSTED",
            message=f"Mã giảm giá '{norm_code}' đã hết lượt sử dụng.",
        )

    allowed_stores = dc.store_ids_json or []
    if allowed_stores and store_id not in allowed_stores:
        raise ValidationAppError(
            code="DISCOUNT_CODE_STORE_MISMATCH",
            message=f"Mã giảm giá '{norm_code}' không áp dụng cho chi nhánh này.",
        )

    min_amt = to_decimal(dc.min_order_amount)
    if subtotal < min_amt:
        raise ValidationAppError(
            code="DISCOUNT_MIN_ORDER_NOT_MET",
            message=f"Đơn hàng cần tối thiểu {int(min_amt):,}₫ để áp dụng mã '{norm_code}'.",
        )

    if dc.discount_type == "percentage":
        raw_disc = (subtotal * to_decimal(dc.value)) / Decimal("100")
        if dc.max_discount_amount is not None:
            raw_disc = min(raw_disc, to_decimal(dc.max_discount_amount))
    else:
        raw_disc = to_decimal(dc.value)

    final_disc = to_decimal(min(raw_disc, subtotal))
    if final_disc < Decimal("0.0000"):
        final_disc = Decimal("0.0000")
    return dc, final_disc


class CreateDiscountCodeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str = Field(min_length=2, max_length=60)
    name: str = Field(min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=500)
    discount_type: str = Field(default="percentage", pattern="^(percentage|fixed)$")
    value: Decimal
    max_discount_amount: Optional[Decimal] = None
    min_order_amount: Decimal = Decimal("0")
    usage_limit: Optional[int] = Field(default=None, ge=1)
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    store_ids: List[str] = Field(default_factory=list)
    status: str = Field(default="active", pattern="^(active|inactive)$")

    @field_validator("value")
    @classmethod
    def _val_positive(cls, v: Decimal) -> Decimal:
        if v <= Decimal("0"):
            raise ValueError("value must be > 0")
        return v

    @field_validator("max_discount_amount", "min_order_amount")
    @classmethod
    def _val_non_negative(cls, v: Optional[Decimal]) -> Optional[Decimal]:
        if v is not None and v < Decimal("0"):
            raise ValueError("amount must be >= 0")
        return v


class UpdateDiscountCodeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=500)
    discount_type: Optional[str] = Field(default=None, pattern="^(percentage|fixed)$")
    value: Optional[Decimal] = None
    max_discount_amount: Optional[Decimal] = None
    min_order_amount: Optional[Decimal] = None
    usage_limit: Optional[int] = Field(default=None, ge=1)
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    store_ids: Optional[List[str]] = None
    status: Optional[str] = Field(default=None, pattern="^(active|inactive)$")

    @field_validator("value")
    @classmethod
    def _val_positive(cls, v: Optional[Decimal]) -> Optional[Decimal]:
        if v is not None and v <= Decimal("0"):
            raise ValueError("value must be > 0")
        return v

    @field_validator("max_discount_amount", "min_order_amount")
    @classmethod
    def _val_non_negative(cls, v: Optional[Decimal]) -> Optional[Decimal]:
        if v is not None and v < Decimal("0"):
            raise ValueError("amount must be >= 0")
        return v


class ValidateDiscountCodeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str = Field(min_length=1, max_length=60)
    store_id: str
    subtotal: Decimal

    @field_validator("subtotal")
    @classmethod
    def _val_subtotal(cls, v: Decimal) -> Decimal:
        if v < Decimal("0"):
            raise ValueError("subtotal must be >= 0")
        return v


@router.get("")
def list_discount_codes(
    status_filter: Optional[str] = Query(default=None, alias="status"),
    principal: UserPrincipal = Depends(require_permission("products.read")),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    q = db.query(DiscountCode).filter(
        DiscountCode.organization_id == principal.organization.id,
        DiscountCode.deleted_at.is_(None),
    )
    if status_filter in ("active", "inactive"):
        q = q.filter(DiscountCode.status == status_filter)
    rows = q.order_by(DiscountCode.created_at.desc()).all()
    return ok_response(
        [serialize_discount_code(r) for r in rows],
        request_id=request_id,
    )


@router.post("", status_code=status.HTTP_201_CREATED)
def create_discount_code(
    body: CreateDiscountCodeRequest,
    principal: UserPrincipal = Depends(require_permission("products.update")),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> JSONResponse:
    org_id = principal.organization.id
    norm_code = body.code.strip().upper()
    if body.discount_type == "percentage" and body.value > Decimal("100"):
        raise ValidationAppError(
            code="INVALID_PERCENTAGE",
            message="Phần trăm giảm giá không được vượt quá 100%.",
        )
    if body.starts_at and body.ends_at and _ensure_utc(body.ends_at) < _ensure_utc(body.starts_at):
        raise ValidationAppError(
            code="INVALID_DATE_RANGE",
            message="Ngày kết thúc phải lớn hơn hoặc bằng ngày bắt đầu.",
        )

    dup = (
        db.query(DiscountCode)
        .filter(
            DiscountCode.organization_id == org_id,
            DiscountCode.code == norm_code,
            DiscountCode.deleted_at.is_(None),
        )
        .first()
    )
    if dup is not None:
        raise ConflictError(
            code="DISCOUNT_CODE_EXISTS",
            message=f"Mã giảm giá '{norm_code}' đã tồn tại.",
        )

    dc = DiscountCode(
        organization_id=org_id,
        code=norm_code,
        name=body.name.strip(),
        description=body.description.strip() if body.description else None,
        discount_type=body.discount_type,
        value=to_decimal(body.value),
        max_discount_amount=(
            to_decimal(body.max_discount_amount)
            if body.max_discount_amount is not None
            else None
        ),
        min_order_amount=to_decimal(body.min_order_amount),
        usage_limit=body.usage_limit,
        starts_at=_ensure_utc(body.starts_at),
        ends_at=_ensure_utc(body.ends_at),
        store_ids_json=[s.strip() for s in body.store_ids if s.strip()],
        status=body.status,
    )
    db.add(dc)
    db.flush()

    record_audit_event(
        db,
        action="discount.created",
        entity_type="discount_code",
        actor_type="user",
        actor_id=principal.user.id,
        organization_id=org_id,
        entity_id=dc.id,
        request_id=request_id,
        metadata={"code": dc.code, "discount_type": dc.discount_type},
    )
    db.commit()
    db.refresh(dc)
    return JSONResponse(
        status_code=status.HTTP_201_CREATED,
        content=ok_response(serialize_discount_code(dc), request_id=request_id),
    )


@router.patch("/{discount_id}")
def update_discount_code(
    discount_id: str,
    body: UpdateDiscountCodeRequest,
    principal: UserPrincipal = Depends(require_permission("products.update")),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    org_id = principal.organization.id
    dc = (
        db.query(DiscountCode)
        .filter(
            DiscountCode.organization_id == org_id,
            DiscountCode.id == discount_id,
            DiscountCode.deleted_at.is_(None),
        )
        .first()
    )
    if dc is None:
        raise NotFoundError(
            code="DISCOUNT_CODE_NOT_FOUND",
            message="Không tìm thấy mã giảm giá.",
        )

    if body.name is not None:
        dc.name = body.name.strip()
    if "description" in body.model_fields_set:
        dc.description = body.description.strip() if body.description else None
    if body.discount_type is not None:
        dc.discount_type = body.discount_type
    if body.value is not None:
        dc.value = to_decimal(body.value)
    if dc.discount_type == "percentage" and dc.value > Decimal("100"):
        raise ValidationAppError(
            code="INVALID_PERCENTAGE",
            message="Phần trăm giảm giá không được vượt quá 100%.",
        )
    if "max_discount_amount" in body.model_fields_set:
        dc.max_discount_amount = (
            to_decimal(body.max_discount_amount)
            if body.max_discount_amount is not None
            else None
        )
    if body.min_order_amount is not None:
        dc.min_order_amount = to_decimal(body.min_order_amount)
    if "usage_limit" in body.model_fields_set:
        dc.usage_limit = body.usage_limit
    if "starts_at" in body.model_fields_set:
        dc.starts_at = _ensure_utc(body.starts_at)
    if "ends_at" in body.model_fields_set:
        dc.ends_at = _ensure_utc(body.ends_at)
    if dc.starts_at and dc.ends_at and _ensure_utc(dc.ends_at) < _ensure_utc(dc.starts_at):
        raise ValidationAppError(
            code="INVALID_DATE_RANGE",
            message="Ngày kết thúc phải lớn hơn hoặc bằng ngày bắt đầu.",
        )
    if "store_ids" in body.model_fields_set:
        dc.store_ids_json = [s.strip() for s in (body.store_ids or []) if s.strip()]
    if body.status is not None:
        dc.status = body.status

    record_audit_event(
        db,
        action="discount.updated",
        entity_type="discount_code",
        actor_type="user",
        actor_id=principal.user.id,
        organization_id=org_id,
        entity_id=dc.id,
        request_id=request_id,
        metadata={"code": dc.code, "status": dc.status},
    )
    db.commit()
    db.refresh(dc)
    return ok_response(serialize_discount_code(dc), request_id=request_id)


@router.delete("/{discount_id}")
def delete_discount_code(
    discount_id: str,
    principal: UserPrincipal = Depends(require_permission("products.update")),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    org_id = principal.organization.id
    dc = (
        db.query(DiscountCode)
        .filter(
            DiscountCode.organization_id == org_id,
            DiscountCode.id == discount_id,
            DiscountCode.deleted_at.is_(None),
        )
        .first()
    )
    if dc is None:
        raise NotFoundError(
            code="DISCOUNT_CODE_NOT_FOUND",
            message="Không tìm thấy mã giảm giá.",
        )

    dc.deleted_at = datetime.now(timezone.utc)
    dc.status = "inactive"
    record_audit_event(
        db,
        action="discount.deleted",
        entity_type="discount_code",
        actor_type="user",
        actor_id=principal.user.id,
        organization_id=org_id,
        entity_id=dc.id,
        request_id=request_id,
        metadata={"code": dc.code},
    )
    db.commit()
    return ok_response({"deleted": True, "id": dc.id}, request_id=request_id)


@router.post("/validate")
def validate_discount_endpoint(
    body: ValidateDiscountCodeRequest,
    principal: Principal = Depends(get_current_principal),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    dc, discount_amount = validate_and_compute_discount(
        db,
        organization_id=principal.organization.id,
        code=body.code,
        store_id=body.store_id,
        subtotal=to_decimal(body.subtotal),
    )
    return ok_response(
        {
            "valid": True,
            "discount": serialize_discount_code(dc),
            "discount_amount": format_decimal(discount_amount),
        },
        request_id=request_id,
    )
