"""Catalog, Categories, Products, Variants, Barcodes, and Pricing API endpoints.

Reference:
- docs/02-database-schema.md (Section 7.4)
- docs/03-api-specification.md (Section 7.6, 7.7)
"""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.api.deps import (
    DevicePrincipal,
    Principal,
    UserPrincipal,
    get_current_device,
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
    CatalogChangeLog,
    Category,
    PriceList,
    PriceListItem,
    Product,
    ProductBarcode,
    ProductVariant,
    StorePriceListAssignment,
)
from app.modules.audit.service import record_audit_event

router = APIRouter(tags=["Catalog & Pricing"])


def normalize_barcode(raw: str) -> str:
    """Deterministic barcode normalization shared across Web, API, and APK."""
    return "".join(raw.strip().split()).upper()


def _check_catalog_read(principal: Principal) -> None:
    if isinstance(principal, UserPrincipal) and "products.read" not in principal.permissions:
        raise ForbiddenError(
            code="INSUFFICIENT_PERMISSIONS",
            message="Required permission 'products.read' is not granted.",
        )


class CreateCategoryRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    parent_category_id: Optional[str] = None
    code: Optional[str] = Field(default=None, max_length=60)
    name: str = Field(min_length=1, max_length=160)
    sort_order: int = 0


class UpdateCategoryRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Optional[str] = Field(default=None, min_length=1, max_length=160)
    sort_order: Optional[int] = None


class BarcodeInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    barcode: str = Field(min_length=1, max_length=100)
    barcode_type: Optional[str] = Field(default="EAN13", max_length=30)
    is_primary: bool = False


class VariantInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    variant_code: str = Field(min_length=1, max_length=80)
    variant_name: str = Field(min_length=1, max_length=160)
    sku: Optional[str] = Field(default=None, max_length=100)
    unit_name: str = Field(default="piece", min_length=1, max_length=40)
    default_cost: Optional[str] = None
    default_price: str
    currency_code: str = Field(default="VND", min_length=3, max_length=3)
    is_default: bool = True
    barcodes: List[BarcodeInput] = Field(default_factory=list)


class CreateProductRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    category_id: Optional[str] = None
    product_code: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=240)
    description: Optional[str] = None
    product_type: str = Field(default="stocked")
    track_inventory: bool = True
    variants: List[VariantInput] = Field(min_length=1)


class UpdateProductRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    category_id: Optional[str] = None
    name: Optional[str] = Field(default=None, min_length=1, max_length=240)
    description: Optional[str] = None
    track_inventory: Optional[bool] = None


class UpdateVariantRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    variant_name: Optional[str] = Field(default=None, min_length=1, max_length=160)
    sku: Optional[str] = Field(default=None, max_length=100)
    unit_name: Optional[str] = Field(default=None, min_length=1, max_length=40)
    default_price: Optional[str] = None
    status: Optional[str] = None


class CreatePriceListRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str = Field(min_length=1, max_length=60)
    name: str = Field(min_length=1, max_length=160)
    currency_code: str = Field(default="VND", min_length=3, max_length=3)
    is_default: bool = False


class PriceListItemInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    product_variant_id: str
    unit_price: str


class SetPriceListItemsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: List[PriceListItemInput]


class AssignStorePriceListRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    price_list_id: str


def _serialize_category(cat: Category) -> Dict[str, Any]:
    return {
        "id": cat.id,
        "organization_id": cat.organization_id,
        "parent_category_id": cat.parent_category_id,
        "code": cat.code,
        "name": cat.name,
        "sort_order": cat.sort_order,
        "status": cat.status,
    }


def _serialize_variant(db: Session, v: ProductVariant) -> Dict[str, Any]:
    barcodes = (
        db.query(ProductBarcode)
        .filter(
            ProductBarcode.organization_id == v.organization_id,
            ProductBarcode.product_variant_id == v.id,
        )
        .all()
    )
    return {
        "id": v.id,
        "product_id": v.product_id,
        "variant_code": v.variant_code,
        "variant_name": v.variant_name,
        "sku": v.sku,
        "unit_name": v.unit_name,
        "default_cost": format_decimal(v.default_cost) if v.default_cost is not None else None,
        "default_price": format_decimal(v.default_price),
        "currency_code": v.currency_code,
        "is_default": v.is_default,
        "status": v.status,
        "version": v.version,
        "barcodes": [
            {
                "id": b.id,
                "barcode": b.barcode,
                "barcode_type": b.barcode_type,
                "is_primary": b.is_primary,
            }
            for b in barcodes
        ],
    }


def _serialize_product(db: Session, p: Product) -> Dict[str, Any]:
    variants = (
        db.query(ProductVariant)
        .filter(
            ProductVariant.organization_id == p.organization_id,
            ProductVariant.product_id == p.id,
            ProductVariant.deleted_at.is_(None),
        )
        .order_by(ProductVariant.is_default.desc(), ProductVariant.variant_code.asc())
        .all()
    )
    return {
        "id": p.id,
        "organization_id": p.organization_id,
        "category_id": p.category_id,
        "product_code": p.product_code,
        "name": p.name,
        "description": p.description,
        "product_type": p.product_type,
        "track_inventory": p.track_inventory,
        "status": p.status,
        "version": p.version,
        "variants": [_serialize_variant(db, v) for v in variants],
        "created_at": p.created_at.isoformat(),
        "updated_at": p.updated_at.isoformat(),
    }


@router.get("/categories")
def list_categories(
    principal: Principal = Depends(get_current_principal),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    _check_catalog_read(principal)
    cats = (
        db.query(Category)
        .filter(
            Category.organization_id == principal.organization.id,
            Category.deleted_at.is_(None),
        )
        .order_by(Category.sort_order.asc(), Category.name.asc())
        .all()
    )
    return ok_response(
        [_serialize_category(c) for c in cats],
        request_id=request_id,
        meta=PaginationMeta(page_size=50, next_cursor=None, has_more=False),
    )


@router.post("/categories", status_code=status.HTTP_201_CREATED)
def create_category(
    body: CreateCategoryRequest,
    principal: UserPrincipal = Depends(require_permission("products.create")),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> JSONResponse:
    org_id = principal.organization.id
    if body.parent_category_id:
        parent = (
            db.query(Category)
            .filter(
                Category.organization_id == org_id,
                Category.id == body.parent_category_id,
                Category.deleted_at.is_(None),
            )
            .first()
        )
        if parent is None:
            raise NotFoundError(
                code="PARENT_CATEGORY_NOT_FOUND",
                message="Parent category not found in this organization.",
            )

    norm_code = body.code.strip().upper() if body.code else None
    if norm_code:
        if (
            db.query(Category)
            .filter(Category.organization_id == org_id, Category.code == norm_code)
            .first()
        ):
            raise ConflictError(
                code="CATEGORY_CODE_EXISTS",
                message=f"Category code '{norm_code}' already exists.",
            )

    cat = Category(
        organization_id=org_id,
        parent_category_id=body.parent_category_id,
        code=norm_code,
        name=body.name.strip(),
        sort_order=body.sort_order,
        status="active",
    )
    db.add(cat)
    db.flush()

    serialized = _serialize_category(cat)
    db.add(
        CatalogChangeLog(
            organization_id=org_id,
            stream_name="catalog",
            entity_type="category",
            change_type="upsert",
            entity_id=cat.id,
            version=1,
            payload=serialized,
        )
    )
    db.commit()
    return JSONResponse(
        status_code=status.HTTP_201_CREATED,
        content=ok_response(serialized, request_id=request_id),
    )


@router.post("/categories/{category_id}/deactivate")
def deactivate_category(
    category_id: str,
    principal: UserPrincipal = Depends(require_permission("products.archive")),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    org_id = principal.organization.id
    cat = (
        db.query(Category)
        .filter(
            Category.organization_id == org_id,
            Category.id == category_id,
            Category.deleted_at.is_(None),
        )
        .first()
    )
    if cat is None:
        raise NotFoundError(code="CATEGORY_NOT_FOUND", message="Category not found.")

    cat.status = "inactive"
    serialized = _serialize_category(cat)
    db.add(
        CatalogChangeLog(
            organization_id=org_id,
            stream_name="catalog",
            entity_type="category",
            change_type="tombstone",
            entity_id=cat.id,
            version=2,
            payload=serialized,
        )
    )
    db.commit()
    return ok_response(serialized, request_id=request_id)


@router.get("/products")
def list_products(
    status_filter: Optional[str] = Query(default=None, alias="status"),
    category_id: Optional[str] = None,
    principal: Principal = Depends(get_current_principal),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    _check_catalog_read(principal)
    query = db.query(Product).filter(
        Product.organization_id == principal.organization.id,
        Product.deleted_at.is_(None),
    )
    if status_filter:
        query = query.filter(Product.status == status_filter)
    if category_id:
        query = query.filter(Product.category_id == category_id)

    products = query.order_by(Product.created_at.desc(), Product.id.desc()).all()
    return ok_response(
        [_serialize_product(db, p) for p in products],
        request_id=request_id,
        meta=PaginationMeta(page_size=50, next_cursor=None, has_more=False),
    )


@router.post("/products", status_code=status.HTTP_201_CREATED)
def create_product(
    body: CreateProductRequest,
    principal: UserPrincipal = Depends(require_permission("products.create")),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> JSONResponse:
    org_id = principal.organization.id
    if body.category_id:
        cat = (
            db.query(Category)
            .filter(
                Category.organization_id == org_id,
                Category.id == body.category_id,
                Category.deleted_at.is_(None),
            )
            .first()
        )
        if cat is None:
            raise NotFoundError(
                code="CATEGORY_NOT_FOUND",
                message="Category not found in this organization.",
            )

    norm_pcode = body.product_code.strip().upper()
    if (
        db.query(Product)
        .filter(Product.organization_id == org_id, Product.product_code == norm_pcode)
        .first()
    ):
        raise ConflictError(
            code="PRODUCT_CODE_EXISTS",
            message=f"Product code '{norm_pcode}' already exists.",
        )

    default_count = sum(1 for v in body.variants if v.is_default)
    if default_count > 1:
        raise ValidationAppError(
            code="MULTIPLE_DEFAULT_VARIANTS",
            message="At most one variant may be marked as is_default=true.",
        )
    if default_count == 0 and body.variants:
        body.variants[0].is_default = True

    product = Product(
        organization_id=org_id,
        category_id=body.category_id,
        product_code=norm_pcode,
        name=body.name.strip(),
        description=body.description,
        product_type=body.product_type,
        track_inventory=body.track_inventory,
        status="active",
        version=1,
        created_by=principal.user.id,
        updated_by=principal.user.id,
    )
    db.add(product)
    db.flush()

    created_variants: List[ProductVariant] = []
    for v_in in body.variants:
        norm_vcode = v_in.variant_code.strip().upper()
        if (
            db.query(ProductVariant)
            .filter(
                ProductVariant.organization_id == org_id,
                ProductVariant.variant_code == norm_vcode,
            )
            .first()
        ):
            raise ConflictError(
                code="VARIANT_CODE_EXISTS",
                message=f"Variant code '{norm_vcode}' already exists.",
            )

        norm_sku = v_in.sku.strip().upper() if v_in.sku else None
        if norm_sku:
            if (
                db.query(ProductVariant)
                .filter(
                    ProductVariant.organization_id == org_id,
                    ProductVariant.sku == norm_sku,
                )
                .first()
            ):
                raise ConflictError(
                    code="SKU_EXISTS",
                    message=f"SKU '{norm_sku}' already exists.",
                )

        price_dec = to_decimal(v_in.default_price, "default_price")
        cost_dec = (
            to_decimal(v_in.default_cost, "default_cost")
            if v_in.default_cost is not None
            else None
        )
        if price_dec < Decimal("0"):
            raise ValidationAppError(
                code="NEGATIVE_PRICE", message="default_price must be non-negative."
            )

        variant = ProductVariant(
            organization_id=org_id,
            product_id=product.id,
            variant_code=norm_vcode,
            variant_name=v_in.variant_name.strip(),
            sku=norm_sku,
            unit_name=v_in.unit_name.strip(),
            default_cost=cost_dec,
            default_price=price_dec,
            currency_code=v_in.currency_code.upper(),
            is_default=v_in.is_default,
            status="active",
            version=1,
        )
        db.add(variant)
        db.flush()

        for b_in in v_in.barcodes:
            norm_bc = normalize_barcode(b_in.barcode)
            if (
                db.query(ProductBarcode)
                .filter(
                    ProductBarcode.organization_id == org_id,
                    ProductBarcode.barcode == norm_bc,
                )
                .first()
            ):
                raise ConflictError(
                    code="BARCODE_EXISTS",
                    message=f"Barcode '{norm_bc}' is already assigned in this organization.",
                )
            bc_row = ProductBarcode(
                organization_id=org_id,
                product_variant_id=variant.id,
                barcode=norm_bc,
                barcode_type=b_in.barcode_type,
                is_primary=b_in.is_primary,
            )
            db.add(bc_row)

        db.flush()
        created_variants.append(variant)

    serialized_product = _serialize_product(db, product)
    db.add(
        CatalogChangeLog(
            organization_id=org_id,
            stream_name="catalog",
            entity_type="product",
            change_type="upsert",
            entity_id=product.id,
            version=product.version,
            payload=serialized_product,
        )
    )
    for v in created_variants:
        db.add(
            CatalogChangeLog(
                organization_id=org_id,
                stream_name="catalog",
                entity_type="product_variant",
                change_type="upsert",
                entity_id=v.id,
                version=v.version,
                payload=_serialize_variant(db, v),
            )
        )

    record_audit_event(
        db,
        action="product.created",
        entity_type="product",
        actor_type="user",
        actor_id=principal.user.id,
        organization_id=org_id,
        entity_id=product.id,
        request_id=request_id,
        metadata={"product_code": product.product_code},
    )
    db.commit()
    return JSONResponse(
        status_code=status.HTTP_201_CREATED,
        content=ok_response(serialized_product, request_id=request_id),
    )


@router.get("/products/search")
def search_products(
    q: str = Query(min_length=1),
    principal: Principal = Depends(get_current_principal),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    _check_catalog_read(principal)
    term = f"%{q.strip()}%"
    products = (
        db.query(Product)
        .filter(
            Product.organization_id == principal.organization.id,
            Product.status == "active",
            Product.deleted_at.is_(None),
            (Product.name.ilike(term)) | (Product.product_code.ilike(term)),
        )
        .limit(50)
        .all()
    )
    return ok_response(
        [_serialize_product(db, p) for p in products], request_id=request_id
    )


@router.get("/products/barcode/{barcode}")
def lookup_product_by_barcode(
    barcode: str,
    principal: Principal = Depends(get_current_principal),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    _check_catalog_read(principal)
    norm_bc = normalize_barcode(barcode)
    org_id = principal.organization.id

    bc_row = (
        db.query(ProductBarcode)
        .filter(
            ProductBarcode.organization_id == org_id,
            ProductBarcode.barcode == norm_bc,
        )
        .first()
    )
    if bc_row is None:
        raise NotFoundError(
            code="BARCODE_NOT_FOUND",
            message=f"No product variant found for barcode '{norm_bc}'.",
        )

    variant = (
        db.query(ProductVariant)
        .filter(
            ProductVariant.organization_id == org_id,
            ProductVariant.id == bc_row.product_variant_id,
            ProductVariant.deleted_at.is_(None),
        )
        .first()
    )
    if variant is None:
        raise NotFoundError(code="VARIANT_NOT_FOUND", message="Variant not found.")

    product = (
        db.query(Product)
        .filter(
            Product.organization_id == org_id,
            Product.id == variant.product_id,
            Product.deleted_at.is_(None),
        )
        .first()
    )
    if product is None:
        raise NotFoundError(code="PRODUCT_NOT_FOUND", message="Product not found.")

    return ok_response(
        {
            "barcode": norm_bc,
            "product": _serialize_product(db, product),
            "matched_variant": _serialize_variant(db, variant),
        },
        request_id=request_id,
    )


@router.get("/products/{product_id}")
def get_product(
    product_id: str,
    principal: Principal = Depends(get_current_principal),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    _check_catalog_read(principal)
    product = (
        db.query(Product)
        .filter(
            Product.organization_id == principal.organization.id,
            Product.id == product_id,
            Product.deleted_at.is_(None),
        )
        .first()
    )
    if product is None:
        raise NotFoundError(code="PRODUCT_NOT_FOUND", message="Product not found.")
    return ok_response(_serialize_product(db, product), request_id=request_id)


@router.patch("/products/{product_id}")
def update_product(
    product_id: str,
    body: UpdateProductRequest,
    principal: UserPrincipal = Depends(require_permission("products.update")),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    org_id = principal.organization.id
    product = (
        db.query(Product)
        .filter(
            Product.organization_id == org_id,
            Product.id == product_id,
            Product.deleted_at.is_(None),
        )
        .first()
    )
    if product is None:
        raise NotFoundError(code="PRODUCT_NOT_FOUND", message="Product not found.")

    changes = body.model_dump(exclude_unset=True)
    for k, v in changes.items():
        setattr(product, k, v)
    product.version += 1
    product.updated_by = principal.user.id
    db.flush()

    serialized = _serialize_product(db, product)
    db.add(
        CatalogChangeLog(
            organization_id=org_id,
            stream_name="catalog",
            entity_type="product",
            change_type="upsert",
            entity_id=product.id,
            version=product.version,
            payload=serialized,
        )
    )
    db.commit()
    return ok_response(serialized, request_id=request_id)


@router.patch("/products/{product_id}/variants/{variant_id}")
def update_variant(
    product_id: str,
    variant_id: str,
    body: UpdateVariantRequest,
    principal: UserPrincipal = Depends(require_permission("products.update")),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    org_id = principal.organization.id
    variant = (
        db.query(ProductVariant)
        .filter(
            ProductVariant.organization_id == org_id,
            ProductVariant.product_id == product_id,
            ProductVariant.id == variant_id,
            ProductVariant.deleted_at.is_(None),
        )
        .first()
    )
    if variant is None:
        raise NotFoundError(code="VARIANT_NOT_FOUND", message="Variant not found.")

    if body.variant_name is not None:
        variant.variant_name = body.variant_name.strip()
    if body.sku is not None:
        variant.sku = body.sku.strip().upper()
    if body.unit_name is not None:
        variant.unit_name = body.unit_name.strip()
    if body.default_price is not None:
        variant.default_price = to_decimal(body.default_price, "default_price")
    if body.status is not None:
        variant.status = body.status

    variant.version += 1
    db.flush()

    serialized = _serialize_variant(db, variant)
    db.add(
        CatalogChangeLog(
            organization_id=org_id,
            stream_name="catalog",
            entity_type="product_variant",
            change_type="upsert" if variant.status == "active" else "tombstone",
            entity_id=variant.id,
            version=variant.version,
            payload=serialized,
        )
    )
    db.commit()
    return ok_response(serialized, request_id=request_id)


@router.post("/products/{product_id}/archive")
def archive_product(
    product_id: str,
    principal: UserPrincipal = Depends(require_permission("products.archive")),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    org_id = principal.organization.id
    product = (
        db.query(Product)
        .filter(
            Product.organization_id == org_id,
            Product.id == product_id,
            Product.deleted_at.is_(None),
        )
        .first()
    )
    if product is None:
        raise NotFoundError(code="PRODUCT_NOT_FOUND", message="Product not found.")

    product.status = "archived"
    product.version += 1
    db.flush()

    serialized = _serialize_product(db, product)
    db.add(
        CatalogChangeLog(
            organization_id=org_id,
            stream_name="catalog",
            entity_type="product",
            change_type="tombstone",
            entity_id=product.id,
            version=product.version,
            payload=serialized,
        )
    )
    db.commit()
    return ok_response(serialized, request_id=request_id)


@router.get("/price-lists")
def list_price_lists(
    principal: UserPrincipal = Depends(require_permission("pricing.read")),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    lists = (
        db.query(PriceList)
        .filter(PriceList.organization_id == principal.organization.id)
        .order_by(PriceList.is_default.desc(), PriceList.code.asc())
        .all()
    )
    return ok_response(
        [
            {
                "id": pl.id,
                "code": pl.code,
                "name": pl.name,
                "currency_code": pl.currency_code,
                "is_default": pl.is_default,
                "status": pl.status,
                "version": pl.version,
            }
            for pl in lists
        ],
        request_id=request_id,
    )


@router.post("/price-lists", status_code=status.HTTP_201_CREATED)
def create_price_list(
    body: CreatePriceListRequest,
    principal: UserPrincipal = Depends(require_permission("pricing.update")),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> JSONResponse:
    org_id = principal.organization.id
    norm_code = body.code.strip().upper()
    if (
        db.query(PriceList)
        .filter(PriceList.organization_id == org_id, PriceList.code == norm_code)
        .first()
    ):
        raise ConflictError(
            code="PRICE_LIST_CODE_EXISTS",
            message=f"Price list code '{norm_code}' already exists.",
        )

    pl = PriceList(
        organization_id=org_id,
        code=norm_code,
        name=body.name.strip(),
        currency_code=body.currency_code.upper(),
        is_default=body.is_default,
        status="active",
        version=1,
    )
    db.add(pl)
    db.commit()
    db.refresh(pl)
    return JSONResponse(
        status_code=status.HTTP_201_CREATED,
        content=ok_response(
            {
                "id": pl.id,
                "code": pl.code,
                "name": pl.name,
                "currency_code": pl.currency_code,
                "is_default": pl.is_default,
                "status": pl.status,
                "version": pl.version,
            },
            request_id=request_id,
        ),
    )


@router.put("/price-lists/{price_list_id}/items")
def set_price_list_items(
    price_list_id: str,
    body: SetPriceListItemsRequest,
    principal: UserPrincipal = Depends(require_permission("pricing.update")),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    org_id = principal.organization.id
    pl = (
        db.query(PriceList)
        .filter(PriceList.organization_id == org_id, PriceList.id == price_list_id)
        .first()
    )
    if pl is None:
        raise NotFoundError(code="PRICE_LIST_NOT_FOUND", message="Price list not found.")

    db.query(PriceListItem).filter(
        PriceListItem.organization_id == org_id,
        PriceListItem.price_list_id == pl.id,
    ).delete()

    out_items = []
    for item in body.items:
        variant = (
            db.query(ProductVariant)
            .filter(
                ProductVariant.organization_id == org_id,
                ProductVariant.id == item.product_variant_id,
            )
            .first()
        )
        if variant is None:
            raise NotFoundError(
                code="VARIANT_NOT_FOUND",
                message=f"Variant '{item.product_variant_id}' not found.",
            )
        u_price = to_decimal(item.unit_price, "unit_price")
        pli = PriceListItem(
            organization_id=org_id,
            price_list_id=pl.id,
            product_variant_id=variant.id,
            unit_price=u_price,
        )
        db.add(pli)
        out_items.append(
            {
                "product_variant_id": variant.id,
                "unit_price": format_decimal(u_price),
            }
        )

    pl.version += 1
    db.commit()
    return ok_response(
        {
            "price_list_id": pl.id,
            "version": pl.version,
            "currency_code": pl.currency_code,
            "items": out_items,
        },
        request_id=request_id,
    )


@router.put("/stores/{store_id}/price-list")
def assign_store_price_list(
    store_id: str,
    body: AssignStorePriceListRequest,
    principal: UserPrincipal = Depends(require_permission("pricing.update")),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    org_id = principal.organization.id
    store = verify_store_access(db, principal, requested_store_id=store_id)
    assert store is not None
    pl = (
        db.query(PriceList)
        .filter(
            PriceList.organization_id == org_id,
            PriceList.id == body.price_list_id,
        )
        .first()
    )
    if pl is None:
        raise NotFoundError(code="PRICE_LIST_NOT_FOUND", message="Price list not found.")

    assignment = (
        db.query(StorePriceListAssignment)
        .filter(
            StorePriceListAssignment.organization_id == org_id,
            StorePriceListAssignment.store_id == store.id,
        )
        .first()
    )
    if assignment is None:
        assignment = StorePriceListAssignment(
            organization_id=org_id,
            store_id=store.id,
            price_list_id=pl.id,
        )
        db.add(assignment)
    else:
        assignment.price_list_id = pl.id

    db.commit()
    return ok_response(
        {"store_id": store.id, "price_list_id": pl.id, "code": pl.code},
        request_id=request_id,
    )


@router.get("/pos/pricing")
def get_pos_pricing(
    principal: DevicePrincipal = Depends(get_current_device),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    org_id = principal.organization.id
    store_id = principal.store.id

    assignment = (
        db.query(StorePriceListAssignment)
        .filter(
            StorePriceListAssignment.organization_id == org_id,
            StorePriceListAssignment.store_id == store_id,
        )
        .first()
    )
    pl = None
    if assignment is not None:
        pl = (
            db.query(PriceList)
            .filter(
                PriceList.organization_id == org_id,
                PriceList.id == assignment.price_list_id,
            )
            .first()
        )
    if pl is None:
        pl = (
            db.query(PriceList)
            .filter(
                PriceList.organization_id == org_id,
                PriceList.is_default.is_(True),
            )
            .first()
        )

    overrides: Dict[str, str] = {}
    if pl is not None:
        items = (
            db.query(PriceListItem)
            .filter(
                PriceListItem.organization_id == org_id,
                PriceListItem.price_list_id == pl.id,
            )
            .all()
        )
        for item in items:
            overrides[item.product_variant_id] = format_decimal(item.unit_price)

    return ok_response(
        {
            "store_id": store_id,
            "price_list_id": pl.id if pl else None,
            "version": pl.version if pl else 1,
            "currency_code": pl.currency_code if pl else principal.store.currency_code,
            "effective_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "variant_prices": overrides,
        },
        request_id=request_id,
    )

