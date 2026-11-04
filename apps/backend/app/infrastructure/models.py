"""Complete Business Data Plane SQLAlchemy 2.x ORM models.

Reference:
- docs/02-database-schema.md (Section 7, 10, 11, 12, 13)
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Dict, Optional

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    JSON,
    Numeric,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def new_uuid() -> str:
    return str(uuid.uuid4())


# ============================================================================
# 7.1 Organization and Store
# ============================================================================


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    code: Mapped[str] = mapped_column(String(50), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    legal_name: Mapped[Optional[str]] = mapped_column(String(250), nullable=True)
    tax_identifier: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    default_currency: Mapped[str] = mapped_column(String(3), nullable=False, default="VND")
    timezone: Mapped[str] = mapped_column(
        String(64), nullable=False, default="Asia/Ho_Chi_Minh"
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    max_stores_limit: Mapped[int] = mapped_column(Integer, nullable=False, default=10)
    max_devices_limit: Mapped[int] = mapped_column(Integer, nullable=False, default=50)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )
    deleted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    __table_args__ = (
        UniqueConstraint("code", name="uq_organizations_code"),
        CheckConstraint(
            "status IN ('active', 'pending_approval', 'suspended', 'archived')",
            name="ck_organizations_status",
        ),
    )


class OrganizationSetting(Base):
    __tablename__ = "organization_settings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    organization_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("organizations.id"), nullable=False
    )
    settings: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )

    __table_args__ = (
        UniqueConstraint("organization_id", name="uq_org_settings_organization_id"),
    )


class Store(Base):
    __tablename__ = "stores"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    organization_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("organizations.id"), nullable=False
    )
    code: Mapped[str] = mapped_column(String(50), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    address_line: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    timezone: Mapped[str] = mapped_column(
        String(64), nullable=False, default="Asia/Ho_Chi_Minh"
    )
    currency_code: Mapped[str] = mapped_column(String(3), nullable=False, default="VND")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    created_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )
    updated_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    __table_args__ = (
        UniqueConstraint("organization_id", "code", name="uq_stores_org_code"),
        UniqueConstraint("organization_id", "id", name="uq_stores_org_id"),
        CheckConstraint(
            "status IN ('active', 'inactive', 'archived')",
            name="ck_stores_status",
        ),
        Index("ix_stores_org_status", "organization_id", "status"),
    )


class StoreSetting(Base):
    __tablename__ = "store_settings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    organization_id: Mapped[str] = mapped_column(String(36), nullable=False)
    store_id: Mapped[str] = mapped_column(String(36), nullable=False)
    settings: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )

    __table_args__ = (
        ForeignKeyConstraint(
            ["organization_id", "store_id"],
            ["stores.organization_id", "stores.id"],
            name="fk_store_settings_store_same_org",
        ),
        UniqueConstraint(
            "organization_id", "store_id", name="uq_store_settings_org_store"
        ),
    )


class StoreCounter(Base):
    """Per-Store atomic counter for concurrency-safe order/adjustment/refund numbers."""

    __tablename__ = "store_counters"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    organization_id: Mapped[str] = mapped_column(String(36), nullable=False)
    store_id: Mapped[str] = mapped_column(String(36), nullable=False)
    counter_type: Mapped[str] = mapped_column(String(40), nullable=False)
    current_value: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )

    __table_args__ = (
        UniqueConstraint(
            "organization_id",
            "store_id",
            "counter_type",
            name="uq_store_counters_org_store_type",
        ),
    )


# ============================================================================
# 7.2 Identity, Users, Roles, Permissions, and Sessions
# ============================================================================


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    organization_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("organizations.id"), nullable=False
    )
    email: Mapped[Optional[str]] = mapped_column(String(254), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    display_name: Mapped[str] = mapped_column(String(160), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    last_login_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    created_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )
    updated_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    __table_args__ = (
        UniqueConstraint("organization_id", "id", name="uq_users_org_id"),
        UniqueConstraint("organization_id", "email", name="uq_users_org_email"),
        CheckConstraint(
            "status IN ('invited', 'active', 'locked', 'disabled')",
            name="ck_users_status",
        ),
    )


class OrganizationMembership(Base):
    __tablename__ = "organization_memberships"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    organization_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("organizations.id"), nullable=False
    )
    user_id: Mapped[str] = mapped_column(String(36), nullable=False)
    membership_status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="active"
    )
    joined_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True, default=utc_now
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )

    __table_args__ = (
        ForeignKeyConstraint(
            ["organization_id", "user_id"],
            ["users.organization_id", "users.id"],
            name="fk_memberships_user_same_org",
        ),
        UniqueConstraint(
            "organization_id", "user_id", name="uq_memberships_org_user"
        ),
        CheckConstraint(
            "membership_status IN ('invited', 'active', 'suspended', 'revoked')",
            name="ck_memberships_status",
        ),
    )


class Role(Base):
    __tablename__ = "roles"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    organization_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("organizations.id"), nullable=False
    )
    code: Mapped[str] = mapped_column(String(60), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_system: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    all_stores_access: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )

    __table_args__ = (
        UniqueConstraint("organization_id", "code", name="uq_roles_org_code"),
        UniqueConstraint("organization_id", "id", name="uq_roles_org_id"),
    )


class Permission(Base):
    """Global immutable permission catalogue shipped with the product."""

    __tablename__ = "permissions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    code: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    module: Mapped[str] = mapped_column(String(60), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class RolePermission(Base):
    __tablename__ = "role_permissions"

    role_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True
    )
    permission_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("permissions.id", ondelete="CASCADE"), primary_key=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )


class UserRoleAssignment(Base):
    __tablename__ = "user_role_assignments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    organization_id: Mapped[str] = mapped_column(String(36), nullable=False)
    user_id: Mapped[str] = mapped_column(String(36), nullable=False)
    role_id: Mapped[str] = mapped_column(String(36), nullable=False)
    assigned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    assigned_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)

    __table_args__ = (
        ForeignKeyConstraint(
            ["organization_id", "user_id"],
            ["users.organization_id", "users.id"],
            name="fk_user_roles_user_same_org",
        ),
        ForeignKeyConstraint(
            ["organization_id", "role_id"],
            ["roles.organization_id", "roles.id"],
            name="fk_user_roles_role_same_org",
        ),
        UniqueConstraint(
            "organization_id", "user_id", "role_id", name="uq_user_roles_org_user_role"
        ),
    )


class UserStoreAssignment(Base):
    __tablename__ = "user_store_assignments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    organization_id: Mapped[str] = mapped_column(String(36), nullable=False)
    user_id: Mapped[str] = mapped_column(String(36), nullable=False)
    store_id: Mapped[str] = mapped_column(String(36), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )

    __table_args__ = (
        ForeignKeyConstraint(
            ["organization_id", "user_id"],
            ["users.organization_id", "users.id"],
            name="fk_user_stores_user_same_org",
        ),
        ForeignKeyConstraint(
            ["organization_id", "store_id"],
            ["stores.organization_id", "stores.id"],
            name="fk_user_stores_store_same_org",
        ),
        UniqueConstraint(
            "organization_id",
            "user_id",
            "store_id",
            name="uq_user_stores_org_user_store",
        ),
    )


class AuthSession(Base):
    """Durable user session and refresh-token family tracking."""

    __tablename__ = "auth_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    organization_id: Mapped[str] = mapped_column(String(36), nullable=False)
    user_id: Mapped[str] = mapped_column(String(36), nullable=False)
    token_family_id: Mapped[str] = mapped_column(
        String(36), nullable=False, default=new_uuid
    )
    refresh_token_hash: Mapped[str] = mapped_column(
        String(255), nullable=False, unique=True
    )
    issued_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    consumed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    revoked_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    revoke_reason: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)

    __table_args__ = (
        ForeignKeyConstraint(
            ["organization_id", "user_id"],
            ["users.organization_id", "users.id"],
            name="fk_auth_sessions_user_same_org",
        ),
        Index("ix_auth_sessions_family", "organization_id", "token_family_id"),
    )


# ============================================================================
# 7.3 POS Devices and Activation
# ============================================================================


class Device(Base):
    __tablename__ = "devices"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    organization_id: Mapped[str] = mapped_column(String(36), nullable=False)
    store_id: Mapped[str] = mapped_column(String(36), nullable=False)
    device_code: Mapped[str] = mapped_column(String(80), nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    device_type: Mapped[str] = mapped_column(
        String(30), nullable=False, default="android_pos"
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    platform: Mapped[str] = mapped_column(
        String(30), nullable=False, default="android"
    )
    app_version: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    last_seen_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_sync_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    created_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )
    deleted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    __table_args__ = (
        ForeignKeyConstraint(
            ["organization_id", "store_id"],
            ["stores.organization_id", "stores.id"],
            name="fk_devices_store_same_org",
        ),
        UniqueConstraint("organization_id", "device_code", name="uq_devices_org_code"),
        UniqueConstraint("organization_id", "id", name="uq_devices_org_id"),
        CheckConstraint(
            "status IN ('pending', 'active', 'disabled', 'revoked')",
            name="ck_devices_status",
        ),
        Index("ix_devices_org_store_status", "organization_id", "store_id", "status"),
    )


class DeviceActivation(Base):
    __tablename__ = "device_activations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    organization_id: Mapped[str] = mapped_column(String(36), nullable=False)
    store_id: Mapped[str] = mapped_column(String(36), nullable=False)
    device_id: Mapped[str] = mapped_column(String(36), nullable=False)
    activation_code_hash: Mapped[str] = mapped_column(
        String(255), nullable=False, unique=True
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    consumed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    created_by: Mapped[str] = mapped_column(String(36), nullable=False)

    __table_args__ = (
        ForeignKeyConstraint(
            ["organization_id", "device_id"],
            ["devices.organization_id", "devices.id"],
            name="fk_device_activations_device_same_org",
        ),
        Index(
            "ix_device_activations_hash_exp", "activation_code_hash", "expires_at"
        ),
    )


class DeviceToken(Base):
    __tablename__ = "device_tokens"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    organization_id: Mapped[str] = mapped_column(String(36), nullable=False)
    device_id: Mapped[str] = mapped_column(String(36), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    token_family_id: Mapped[str] = mapped_column(
        String(36), nullable=False, default=new_uuid
    )
    issued_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    last_used_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    revoked_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    revoke_reason: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)

    __table_args__ = (
        ForeignKeyConstraint(
            ["organization_id", "device_id"],
            ["devices.organization_id", "devices.id"],
            name="fk_device_tokens_device_same_org",
        ),
        Index("ix_device_tokens_family", "organization_id", "token_family_id"),
    )


class DeviceEvent(Base):
    __tablename__ = "device_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    organization_id: Mapped[str] = mapped_column(String(36), nullable=False)
    device_id: Mapped[str] = mapped_column(String(36), nullable=False)
    event_type: Mapped[str] = mapped_column(String(60), nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    event_metadata: Mapped[Dict[str, Any]] = mapped_column(
        "metadata", JSON, nullable=False, default=dict
    )

    __table_args__ = (
        ForeignKeyConstraint(
            ["organization_id", "device_id"],
            ["devices.organization_id", "devices.id"],
            name="fk_device_events_device_same_org",
        ),
    )


# ============================================================================
# 7.4 Product Catalog and Pricing
# ============================================================================


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    organization_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("organizations.id"), nullable=False
    )
    parent_category_id: Mapped[Optional[str]] = mapped_column(
        String(36), nullable=True
    )
    code: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )
    deleted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    __table_args__ = (
        UniqueConstraint("organization_id", "id", name="uq_categories_org_id"),
        UniqueConstraint("organization_id", "code", name="uq_categories_org_code"),
        CheckConstraint(
            "status IN ('active', 'inactive')", name="ck_categories_status"
        ),
        CheckConstraint(
            "parent_category_id IS NULL OR parent_category_id != id",
            name="ck_categories_not_self_parent",
        ),
    )


class Product(Base):
    __tablename__ = "products"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    organization_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("organizations.id"), nullable=False
    )
    category_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    product_code: Mapped[str] = mapped_column(String(80), nullable=False)
    name: Mapped[str] = mapped_column(String(240), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    image_key: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    product_type: Mapped[str] = mapped_column(
        String(30), nullable=False, default="stocked"
    )
    track_inventory: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    created_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )
    updated_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    __table_args__ = (
        UniqueConstraint("organization_id", "id", name="uq_products_org_id"),
        UniqueConstraint(
            "organization_id", "product_code", name="uq_products_org_code"
        ),
        CheckConstraint(
            "product_type IN ('stocked', 'non_stocked', 'service')",
            name="ck_products_type",
        ),
        CheckConstraint(
            "status IN ('active', 'inactive', 'archived')",
            name="ck_products_status",
        ),
        Index("ix_products_org_status_name", "organization_id", "status", "name"),
    )


class ProductVariant(Base):
    __tablename__ = "product_variants"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    organization_id: Mapped[str] = mapped_column(String(36), nullable=False)
    product_id: Mapped[str] = mapped_column(String(36), nullable=False)
    variant_code: Mapped[str] = mapped_column(String(80), nullable=False)
    variant_name: Mapped[str] = mapped_column(String(160), nullable=False)
    sku: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    unit_name: Mapped[str] = mapped_column(String(40), nullable=False, default="piece")
    default_cost: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(19, 4), nullable=True
    )
    default_price: Mapped[Decimal] = mapped_column(Numeric(19, 4), nullable=False)
    currency_code: Mapped[str] = mapped_column(String(3), nullable=False, default="VND")
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )
    deleted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    __table_args__ = (
        ForeignKeyConstraint(
            ["organization_id", "product_id"],
            ["products.organization_id", "products.id"],
            name="fk_variants_product_same_org",
        ),
        UniqueConstraint("organization_id", "id", name="uq_variants_org_id"),
        UniqueConstraint(
            "organization_id", "variant_code", name="uq_variants_org_code"
        ),
        CheckConstraint("default_price >= 0", name="ck_variants_price"),
        CheckConstraint(
            "default_cost IS NULL OR default_cost >= 0", name="ck_variants_cost"
        ),
        CheckConstraint(
            "status IN ('active', 'inactive')", name="ck_variants_status"
        ),
    )


class ProductBarcode(Base):
    __tablename__ = "product_barcodes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    organization_id: Mapped[str] = mapped_column(String(36), nullable=False)
    product_variant_id: Mapped[str] = mapped_column(String(36), nullable=False)
    barcode: Mapped[str] = mapped_column(String(100), nullable=False)
    barcode_type: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    is_primary: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )

    __table_args__ = (
        ForeignKeyConstraint(
            ["organization_id", "product_variant_id"],
            ["product_variants.organization_id", "product_variants.id"],
            name="fk_barcodes_variant_same_org",
        ),
        UniqueConstraint("organization_id", "barcode", name="uq_barcodes_org_barcode"),
    )


class PriceList(Base):
    __tablename__ = "price_lists"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    organization_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("organizations.id"), nullable=False
    )
    code: Mapped[str] = mapped_column(String(60), nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    currency_code: Mapped[str] = mapped_column(String(3), nullable=False, default="VND")
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )

    __table_args__ = (
        UniqueConstraint("organization_id", "id", name="uq_price_lists_org_id"),
        UniqueConstraint("organization_id", "code", name="uq_price_lists_org_code"),
    )


class PriceListItem(Base):
    __tablename__ = "price_list_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    organization_id: Mapped[str] = mapped_column(String(36), nullable=False)
    price_list_id: Mapped[str] = mapped_column(String(36), nullable=False)
    product_variant_id: Mapped[str] = mapped_column(String(36), nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(19, 4), nullable=False)
    valid_from: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    valid_until: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    __table_args__ = (
        ForeignKeyConstraint(
            ["organization_id", "price_list_id"],
            ["price_lists.organization_id", "price_lists.id"],
            name="fk_price_list_items_list_same_org",
        ),
        ForeignKeyConstraint(
            ["organization_id", "product_variant_id"],
            ["product_variants.organization_id", "product_variants.id"],
            name="fk_price_list_items_variant_same_org",
        ),
        UniqueConstraint(
            "organization_id",
            "price_list_id",
            "product_variant_id",
            name="uq_price_list_items_org_list_variant",
        ),
        CheckConstraint("unit_price >= 0", name="ck_price_list_items_price"),
    )


class StorePriceListAssignment(Base):
    __tablename__ = "store_price_list_assignments"

    organization_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    store_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    price_list_id: Mapped[str] = mapped_column(String(36), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )

    __table_args__ = (
        ForeignKeyConstraint(
            ["organization_id", "store_id"],
            ["stores.organization_id", "stores.id"],
            name="fk_store_price_list_store_same_org",
        ),
        ForeignKeyConstraint(
            ["organization_id", "price_list_id"],
            ["price_lists.organization_id", "price_lists.id"],
            name="fk_store_price_list_list_same_org",
        ),
    )


# ============================================================================
# 7.5 Inventory
# ============================================================================


class Inventory(Base):
    __tablename__ = "inventories"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    organization_id: Mapped[str] = mapped_column(String(36), nullable=False)
    store_id: Mapped[str] = mapped_column(String(36), nullable=False)
    product_variant_id: Mapped[str] = mapped_column(String(36), nullable=False)
    on_hand_quantity: Mapped[Decimal] = mapped_column(
        Numeric(19, 4), nullable=False, default=Decimal("0.0000")
    )
    reserved_quantity: Mapped[Decimal] = mapped_column(
        Numeric(19, 4), nullable=False, default=Decimal("0.0000")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )

    __table_args__ = (
        ForeignKeyConstraint(
            ["organization_id", "store_id"],
            ["stores.organization_id", "stores.id"],
            name="fk_inventories_store_same_org",
        ),
        ForeignKeyConstraint(
            ["organization_id", "product_variant_id"],
            ["product_variants.organization_id", "product_variants.id"],
            name="fk_inventories_variant_same_org",
        ),
        UniqueConstraint(
            "organization_id",
            "store_id",
            "product_variant_id",
            name="uq_inventories_org_store_variant",
        ),
        CheckConstraint(
            "reserved_quantity >= 0", name="ck_inventories_reserved_nonnegative"
        ),
    )


class StockMovement(Base):
    __tablename__ = "stock_movements"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    organization_id: Mapped[str] = mapped_column(String(36), nullable=False)
    store_id: Mapped[str] = mapped_column(String(36), nullable=False)
    product_variant_id: Mapped[str] = mapped_column(String(36), nullable=False)
    movement_type: Mapped[str] = mapped_column(String(40), nullable=False)
    quantity_delta: Mapped[Decimal] = mapped_column(Numeric(19, 4), nullable=False)
    quantity_after: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(19, 4), nullable=True
    )
    source_type: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    source_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    idempotency_key: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    created_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)

    __table_args__ = (
        ForeignKeyConstraint(
            ["organization_id", "store_id"],
            ["stores.organization_id", "stores.id"],
            name="fk_stock_movements_store_same_org",
        ),
        ForeignKeyConstraint(
            ["organization_id", "product_variant_id"],
            ["product_variants.organization_id", "product_variants.id"],
            name="fk_stock_movements_variant_same_org",
        ),
        CheckConstraint(
            "movement_type IN ('opening', 'sale', 'refund', 'adjustment', 'transfer_in', 'transfer_out', 'purchase_receipt')",
            name="ck_stock_movements_type",
        ),
        Index(
            "ix_stock_movements_org_store_var_occ",
            "organization_id",
            "store_id",
            "product_variant_id",
            "occurred_at",
        ),
    )


class StockAdjustment(Base):
    __tablename__ = "stock_adjustments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    organization_id: Mapped[str] = mapped_column(String(36), nullable=False)
    store_id: Mapped[str] = mapped_column(String(36), nullable=False)
    adjustment_number: Mapped[str] = mapped_column(String(60), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft")
    reason: Mapped[Optional[str]] = mapped_column(String(240), nullable=True)
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    created_by: Mapped[str] = mapped_column(String(36), nullable=False)
    posted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    posted_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)

    __table_args__ = (
        ForeignKeyConstraint(
            ["organization_id", "store_id"],
            ["stores.organization_id", "stores.id"],
            name="fk_stock_adjustments_store_same_org",
        ),
        UniqueConstraint("organization_id", "id", name="uq_stock_adjustments_org_id"),
        UniqueConstraint(
            "organization_id",
            "store_id",
            "adjustment_number",
            name="uq_stock_adjustments_org_store_num",
        ),
        CheckConstraint(
            "status IN ('draft', 'posted', 'voided')",
            name="ck_stock_adjustments_status",
        ),
    )


class StockAdjustmentItem(Base):
    __tablename__ = "stock_adjustment_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    organization_id: Mapped[str] = mapped_column(String(36), nullable=False)
    adjustment_id: Mapped[str] = mapped_column(String(36), nullable=False)
    product_variant_id: Mapped[str] = mapped_column(String(36), nullable=False)
    quantity_delta: Mapped[Decimal] = mapped_column(Numeric(19, 4), nullable=False)
    note: Mapped[Optional[str]] = mapped_column(String(240), nullable=True)

    __table_args__ = (
        ForeignKeyConstraint(
            ["organization_id", "adjustment_id"],
            ["stock_adjustments.organization_id", "stock_adjustments.id"],
            name="fk_adjustment_items_adj_same_org",
        ),
        ForeignKeyConstraint(
            ["organization_id", "product_variant_id"],
            ["product_variants.organization_id", "product_variants.id"],
            name="fk_adjustment_items_variant_same_org",
        ),
        CheckConstraint(
            "quantity_delta != 0", name="ck_adjustment_items_delta_nonzero"
        ),
    )


# ============================================================================
# 7.6 Sales and Orders
# ============================================================================


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    organization_id: Mapped[str] = mapped_column(String(36), nullable=False)
    store_id: Mapped[str] = mapped_column(String(36), nullable=False)
    device_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    cashier_user_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    order_number: Mapped[str] = mapped_column(String(80), nullable=False)
    client_order_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    idempotency_key: Mapped[str] = mapped_column(String(120), nullable=False)
    order_status: Mapped[str] = mapped_column(
        String(24), nullable=False, default="completed"
    )
    payment_status: Mapped[str] = mapped_column(
        String(24), nullable=False, default="paid"
    )
    source: Mapped[str] = mapped_column(String(24), nullable=False, default="pos")
    currency_code: Mapped[str] = mapped_column(String(3), nullable=False, default="VND")
    subtotal_amount: Mapped[Decimal] = mapped_column(
        Numeric(19, 4), nullable=False, default=Decimal("0.0000")
    )
    discount_amount: Mapped[Decimal] = mapped_column(
        Numeric(19, 4), nullable=False, default=Decimal("0.0000")
    )
    tax_amount: Mapped[Decimal] = mapped_column(
        Numeric(19, 4), nullable=False, default=Decimal("0.0000")
    )
    total_amount: Mapped[Decimal] = mapped_column(Numeric(19, 4), nullable=False)
    paid_amount: Mapped[Decimal] = mapped_column(
        Numeric(19, 4), nullable=False, default=Decimal("0.0000")
    )
    change_amount: Mapped[Decimal] = mapped_column(
        Numeric(19, 4), nullable=False, default=Decimal("0.0000")
    )
    customer_name_snapshot: Mapped[Optional[str]] = mapped_column(
        String(200), nullable=True
    )
    customer_phone_snapshot: Mapped[Optional[str]] = mapped_column(
        String(40), nullable=True
    )
    note: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    created_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )

    __table_args__ = (
        ForeignKeyConstraint(
            ["organization_id", "store_id"],
            ["stores.organization_id", "stores.id"],
            name="fk_orders_store_same_org",
        ),
        UniqueConstraint("organization_id", "id", name="uq_orders_org_id"),
        UniqueConstraint(
            "organization_id",
            "store_id",
            "order_number",
            name="uq_orders_org_store_number",
        ),
        UniqueConstraint(
            "organization_id", "idempotency_key", name="uq_orders_org_idempotency"
        ),
        CheckConstraint(
            "subtotal_amount >= 0 AND discount_amount >= 0 AND tax_amount >= 0 "
            "AND total_amount >= 0 AND paid_amount >= 0 AND change_amount >= 0",
            name="ck_orders_amounts_nonnegative",
        ),
        CheckConstraint(
            "order_status IN ('draft', 'completed', 'cancelled', 'partially_refunded', 'refunded')",
            name="ck_orders_status",
        ),
        CheckConstraint(
            "payment_status IN ('unpaid', 'partially_paid', 'paid', 'partially_refunded', 'refunded')",
            name="ck_orders_payment_status",
        ),
        Index("ix_orders_org_store_created", "organization_id", "store_id", "created_at"),
    )


class OrderItem(Base):
    __tablename__ = "order_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    organization_id: Mapped[str] = mapped_column(String(36), nullable=False)
    order_id: Mapped[str] = mapped_column(String(36), nullable=False)
    product_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    product_variant_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    product_code_snapshot: Mapped[str] = mapped_column(String(80), nullable=False)
    product_name_snapshot: Mapped[str] = mapped_column(String(240), nullable=False)
    variant_name_snapshot: Mapped[Optional[str]] = mapped_column(
        String(160), nullable=True
    )
    barcode_snapshot: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    unit_name_snapshot: Mapped[str] = mapped_column(String(40), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(19, 4), nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(19, 4), nullable=False)
    discount_amount: Mapped[Decimal] = mapped_column(
        Numeric(19, 4), nullable=False, default=Decimal("0.0000")
    )
    tax_amount: Mapped[Decimal] = mapped_column(
        Numeric(19, 4), nullable=False, default=Decimal("0.0000")
    )
    line_total: Mapped[Decimal] = mapped_column(Numeric(19, 4), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )

    __table_args__ = (
        ForeignKeyConstraint(
            ["organization_id", "order_id"],
            ["orders.organization_id", "orders.id"],
            name="fk_order_items_order_same_org",
        ),
        UniqueConstraint("organization_id", "id", name="uq_order_items_org_id"),
        CheckConstraint("quantity > 0", name="ck_order_items_quantity_positive"),
    )


class OrderDiscount(Base):
    __tablename__ = "order_discounts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    organization_id: Mapped[str] = mapped_column(String(36), nullable=False)
    order_id: Mapped[str] = mapped_column(String(36), nullable=False)
    order_item_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    discount_type: Mapped[str] = mapped_column(String(24), nullable=False)
    description: Mapped[str] = mapped_column(String(240), nullable=False)
    rate: Mapped[Optional[Decimal]] = mapped_column(Numeric(9, 4), nullable=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(19, 4), nullable=False)
    approved_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )

    __table_args__ = (
        ForeignKeyConstraint(
            ["organization_id", "order_id"],
            ["orders.organization_id", "orders.id"],
            name="fk_order_discounts_order_same_org",
        ),
    )


class OrderTaxLine(Base):
    __tablename__ = "order_tax_lines"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    organization_id: Mapped[str] = mapped_column(String(36), nullable=False)
    order_id: Mapped[str] = mapped_column(String(36), nullable=False)
    order_item_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    tax_code_snapshot: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    tax_name_snapshot: Mapped[str] = mapped_column(String(120), nullable=False)
    tax_rate: Mapped[Decimal] = mapped_column(Numeric(9, 4), nullable=False)
    taxable_amount: Mapped[Decimal] = mapped_column(Numeric(19, 4), nullable=False)
    tax_amount: Mapped[Decimal] = mapped_column(Numeric(19, 4), nullable=False)

    __table_args__ = (
        ForeignKeyConstraint(
            ["organization_id", "order_id"],
            ["orders.organization_id", "orders.id"],
            name="fk_order_tax_lines_order_same_org",
        ),
    )


# ============================================================================
# 7.7 Payments, Refunds, and 7.8 Cash Drawers / Sessions
# ============================================================================


class PaymentMethod(Base):
    __tablename__ = "payment_methods"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    organization_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("organizations.id"), nullable=False
    )
    code: Mapped[str] = mapped_column(String(50), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    method_type: Mapped[str] = mapped_column(String(30), nullable=False)
    supports_offline_recording: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    requires_external_authorization: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )

    __table_args__ = (
        UniqueConstraint("organization_id", "id", name="uq_payment_methods_org_id"),
        UniqueConstraint("organization_id", "code", name="uq_payment_methods_org_code"),
        CheckConstraint(
            "method_type IN ('cash', 'bank_transfer', 'card_terminal', 'online_gateway', 'other')",
            name="ck_payment_methods_type",
        ),
        CheckConstraint(
            "status IN ('active', 'inactive')", name="ck_payment_methods_status"
        ),
    )


class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    organization_id: Mapped[str] = mapped_column(String(36), nullable=False)
    store_id: Mapped[str] = mapped_column(String(36), nullable=False)
    order_id: Mapped[str] = mapped_column(String(36), nullable=False)
    payment_method_id: Mapped[str] = mapped_column(String(36), nullable=False)
    payment_number: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    idempotency_key: Mapped[str] = mapped_column(String(120), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(19, 4), nullable=False)
    currency_code: Mapped[str] = mapped_column(String(3), nullable=False, default="VND")
    payment_status: Mapped[str] = mapped_column(String(24), nullable=False)
    authorization_reference: Mapped[Optional[str]] = mapped_column(
        String(160), nullable=True
    )
    provider_code: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    provider_transaction_id: Mapped[Optional[str]] = mapped_column(
        String(160), nullable=True
    )
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    authorized_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    captured_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )

    __table_args__ = (
        ForeignKeyConstraint(
            ["organization_id", "order_id"],
            ["orders.organization_id", "orders.id"],
            name="fk_payments_order_same_org",
        ),
        ForeignKeyConstraint(
            ["organization_id", "payment_method_id"],
            ["payment_methods.organization_id", "payment_methods.id"],
            name="fk_payments_method_same_org",
        ),
        UniqueConstraint(
            "organization_id", "idempotency_key", name="uq_payments_org_idempotency"
        ),
        CheckConstraint("amount > 0", name="ck_payments_amount_positive"),
        CheckConstraint(
            "payment_status IN ('recorded_locally', 'pending_authorization', 'authorized', 'captured', 'failed', 'cancelled', 'refunded', 'partially_refunded')",
            name="ck_payments_status",
        ),
    )


class Refund(Base):
    __tablename__ = "refunds"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    organization_id: Mapped[str] = mapped_column(String(36), nullable=False)
    store_id: Mapped[str] = mapped_column(String(36), nullable=False)
    order_id: Mapped[str] = mapped_column(String(36), nullable=False)
    refund_number: Mapped[str] = mapped_column(String(80), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="completed")
    reason: Mapped[str] = mapped_column(String(500), nullable=False)
    currency_code: Mapped[str] = mapped_column(String(3), nullable=False, default="VND")
    refund_total: Mapped[Decimal] = mapped_column(Numeric(19, 4), nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    created_by: Mapped[str] = mapped_column(String(36), nullable=False)
    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    completed_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)

    __table_args__ = (
        ForeignKeyConstraint(
            ["organization_id", "order_id"],
            ["orders.organization_id", "orders.id"],
            name="fk_refunds_order_same_org",
        ),
        UniqueConstraint("organization_id", "id", name="uq_refunds_org_id"),
        UniqueConstraint(
            "organization_id",
            "store_id",
            "refund_number",
            name="uq_refunds_org_store_number",
        ),
        CheckConstraint("refund_total > 0", name="ck_refunds_total_positive"),
        CheckConstraint(
            "status IN ('draft', 'completed', 'cancelled')", name="ck_refunds_status"
        ),
    )


class RefundItem(Base):
    __tablename__ = "refund_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    organization_id: Mapped[str] = mapped_column(String(36), nullable=False)
    refund_id: Mapped[str] = mapped_column(String(36), nullable=False)
    order_item_id: Mapped[str] = mapped_column(String(36), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(19, 4), nullable=False)
    refund_amount: Mapped[Decimal] = mapped_column(Numeric(19, 4), nullable=False)
    restock_quantity: Mapped[Decimal] = mapped_column(
        Numeric(19, 4), nullable=False, default=Decimal("0.0000")
    )
    restock_store_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)

    __table_args__ = (
        ForeignKeyConstraint(
            ["organization_id", "refund_id"],
            ["refunds.organization_id", "refunds.id"],
            name="fk_refund_items_refund_same_org",
        ),
        ForeignKeyConstraint(
            ["organization_id", "order_item_id"],
            ["order_items.organization_id", "order_items.id"],
            name="fk_refund_items_order_item_same_org",
        ),
        CheckConstraint("quantity > 0", name="ck_refund_items_qty_positive"),
        CheckConstraint("refund_amount > 0", name="ck_refund_items_amt_positive"),
        CheckConstraint(
            "restock_quantity >= 0 AND restock_quantity <= quantity",
            name="ck_refund_items_restock_bounds",
        ),
    )


class CashDrawer(Base):
    __tablename__ = "cash_drawers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    organization_id: Mapped[str] = mapped_column(String(36), nullable=False)
    store_id: Mapped[str] = mapped_column(String(36), nullable=False)
    code: Mapped[str] = mapped_column(String(60), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")

    __table_args__ = (
        ForeignKeyConstraint(
            ["organization_id", "store_id"],
            ["stores.organization_id", "stores.id"],
            name="fk_cash_drawers_store_same_org",
        ),
        UniqueConstraint("organization_id", "id", name="uq_cash_drawers_org_id"),
        UniqueConstraint(
            "organization_id", "store_id", "code", name="uq_cash_drawers_org_store_code"
        ),
    )


class CashSession(Base):
    __tablename__ = "cash_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    organization_id: Mapped[str] = mapped_column(String(36), nullable=False)
    store_id: Mapped[str] = mapped_column(String(36), nullable=False)
    cash_drawer_id: Mapped[str] = mapped_column(String(36), nullable=False)
    device_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    opened_by: Mapped[str] = mapped_column(String(36), nullable=False)
    closed_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="open")
    currency_code: Mapped[str] = mapped_column(String(3), nullable=False, default="VND")
    opening_amount: Mapped[Decimal] = mapped_column(
        Numeric(19, 4), nullable=False, default=Decimal("0.0000")
    )
    expected_closing_amount: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(19, 4), nullable=True
    )
    actual_closing_amount: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(19, 4), nullable=True
    )
    difference_amount: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(19, 4), nullable=True
    )
    opened_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    closed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    __table_args__ = (
        ForeignKeyConstraint(
            ["organization_id", "store_id"],
            ["stores.organization_id", "stores.id"],
            name="fk_cash_sessions_store_same_org",
        ),
        ForeignKeyConstraint(
            ["organization_id", "cash_drawer_id"],
            ["cash_drawers.organization_id", "cash_drawers.id"],
            name="fk_cash_sessions_drawer_same_org",
        ),
        UniqueConstraint("organization_id", "id", name="uq_cash_sessions_org_id"),
        CheckConstraint(
            "status IN ('open', 'closed', 'reviewed')", name="ck_cash_sessions_status"
        ),
    )


class CashMovement(Base):
    __tablename__ = "cash_movements"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    organization_id: Mapped[str] = mapped_column(String(36), nullable=False)
    store_id: Mapped[str] = mapped_column(String(36), nullable=False)
    cash_session_id: Mapped[str] = mapped_column(String(36), nullable=False)
    movement_type: Mapped[str] = mapped_column(String(30), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(19, 4), nullable=False)
    direction: Mapped[str] = mapped_column(String(8), nullable=False)
    reference_type: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    reference_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    note: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    created_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)

    __table_args__ = (
        ForeignKeyConstraint(
            ["organization_id", "cash_session_id"],
            ["cash_sessions.organization_id", "cash_sessions.id"],
            name="fk_cash_movements_session_same_org",
        ),
        CheckConstraint("amount > 0", name="ck_cash_movements_amount_positive"),
        CheckConstraint("direction IN ('in', 'out')", name="ck_cash_movements_dir"),
        CheckConstraint(
            "movement_type IN ('cash_in', 'cash_out', 'sale_cash', 'refund_cash', 'opening', 'closing_adjustment')",
            name="ck_cash_movements_type",
        ),
    )


# ============================================================================
# 7.9 Audit, Idempotency, Synchronization & 7.10 Private Deployment Metadata
# ============================================================================


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    organization_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    store_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    actor_type: Mapped[str] = mapped_column(String(24), nullable=False)
    actor_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    action: Mapped[str] = mapped_column(String(120), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(80), nullable=False)
    entity_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    request_id: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    source_ip: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    audit_metadata: Mapped[Dict[str, Any]] = mapped_column(
        "metadata", JSON, nullable=False, default=dict
    )
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )

    __table_args__ = (
        Index("ix_audit_logs_org_occurred", "organization_id", "occurred_at"),
    )


class IdempotencyRecord(Base):
    __tablename__ = "idempotency_records"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    organization_id: Mapped[str] = mapped_column(String(36), nullable=False)
    scope: Mapped[str] = mapped_column(String(80), nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(160), nullable=False)
    request_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    response_status: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    response_body: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)
    resource_type: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    resource_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )

    __table_args__ = (
        UniqueConstraint(
            "organization_id",
            "scope",
            "idempotency_key",
            name="uq_idempotency_scope_key",
        ),
        CheckConstraint(
            "status IN ('processing', 'completed', 'failed')",
            name="ck_idempotency_status",
        ),
    )


class SyncCheckpoint(Base):
    __tablename__ = "sync_checkpoints"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    organization_id: Mapped[str] = mapped_column(String(36), nullable=False)
    device_id: Mapped[str] = mapped_column(String(36), nullable=False)
    stream_name: Mapped[str] = mapped_column(String(60), nullable=False)
    cursor_value: Mapped[str] = mapped_column(String(255), nullable=False)
    last_success_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )

    __table_args__ = (
        UniqueConstraint(
            "organization_id",
            "device_id",
            "stream_name",
            name="uq_sync_checkpoints_org_device_stream",
        ),
    )


class CatalogChangeLog(Base):
    """Append-only change stream for deterministic cursor-based POS synchronization."""

    __tablename__ = "catalog_change_logs"

    seq: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    organization_id: Mapped[str] = mapped_column(String(36), nullable=False)
    stream_name: Mapped[str] = mapped_column(
        String(40), nullable=False, default="catalog"
    )
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False)
    change_type: Mapped[str] = mapped_column(String(20), nullable=False)
    entity_id: Mapped[str] = mapped_column(String(36), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    payload: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )

    __table_args__ = (
        CheckConstraint(
            "change_type IN ('upsert', 'tombstone')", name="ck_catalog_change_type"
        ),
        Index(
            "ix_catalog_changes_org_stream_seq",
            "organization_id",
            "stream_name",
            "seq",
        ),
    )


class LocalDeploymentIdentity(Base):
    """Singleton record per Private Server database (Section 7.10)."""

    __tablename__ = "local_deployment_identity"

    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True, default=1)
    deployment_id: Mapped[str] = mapped_column(String(36), nullable=False)
    organization_id: Mapped[str] = mapped_column(String(36), nullable=False)
    deployment_mode: Mapped[str] = mapped_column(
        String(20), nullable=False, default="private"
    )
    registered_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )

    __table_args__ = (
        CheckConstraint("id = 1", name="ck_local_deployment_identity_singleton"),
        CheckConstraint(
            "deployment_mode = 'private'", name="ck_local_deployment_mode_private"
        ),
    )


class LocalLicenseCache(Base):
    """Singleton record per Private Server database storing the verified signed license."""

    __tablename__ = "local_license_cache"

    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True, default=1)
    license_id: Mapped[str] = mapped_column(String(36), nullable=False)
    deployment_id: Mapped[str] = mapped_column(String(36), nullable=False)
    organization_id: Mapped[str] = mapped_column(String(36), nullable=False)
    signed_payload: Mapped[str] = mapped_column(Text, nullable=False)
    key_id: Mapped[str] = mapped_column(String(80), nullable=False)
    sequence: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    last_validated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    revocation_snapshot_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )

    __table_args__ = (
        CheckConstraint("id = 1", name="ck_local_license_cache_singleton"),
    )

