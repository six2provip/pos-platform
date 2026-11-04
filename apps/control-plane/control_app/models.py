"""Cloud Control Plane SQLAlchemy 2.x database models (strictly separated from Business Data Plane).

Reference:
- ADR-005: Separate Control Plane vs Business Data Plane
- docs/02-database-schema.md (Section 8)
- docs/04-cloud-control-plane.md (Section 16)
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import (
     JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def new_uuid() -> str:
    return str(uuid.uuid4())


class ControlBase(DeclarativeBase):
    """Declarative base for all Cloud Control Plane ORM models."""


class ControlAdminUser(ControlBase):
    __tablename__ = "control_admin_users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    full_name: Mapped[str] = mapped_column(String(160), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role_code: Mapped[str] = mapped_column(
        String(40), nullable=False, default="platform_super_admin"
    )
    mfa_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    last_login_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )

    __table_args__ = (
        CheckConstraint(
            "role_code IN ('platform_super_admin', 'platform_ops', 'platform_support', 'platform_finance', 'release_manager')",
            name="ck_control_admin_role",
        ),
        CheckConstraint(
            "status IN ('active', 'disabled', 'locked')",
            name="ck_control_admin_status",
        ),
    )


class ControlCustomer(ControlBase):
    __tablename__ = "control_customers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    customer_code: Mapped[str] = mapped_column(String(60), nullable=False, unique=True)
    legal_name: Mapped[str] = mapped_column(String(240), nullable=False)
    display_name: Mapped[str] = mapped_column(String(200), nullable=False)
    tax_id: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    billing_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    technical_contact_email: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True
    )
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="active")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )

    __table_args__ = (
        CheckConstraint(
            "status IN ('onboarding', 'active', 'suspended', 'terminated')",
            name="ck_control_customers_status",
        ),
    )


class ControlPlan(ControlBase):
    __tablename__ = "control_plans"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    plan_code: Mapped[str] = mapped_column(String(60), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    deployment_type: Mapped[str] = mapped_column(String(20), nullable=False)
    edition: Mapped[str] = mapped_column(
        String(40), nullable=False, default="enterprise"
    )
    default_max_stores: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    default_max_devices: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    default_features: Mapped[List[str]] = mapped_column(
        JSON, nullable=False, default=list
    )
    offline_grace_days: Mapped[int] = mapped_column(Integer, nullable=False, default=7)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )

    __table_args__ = (
        CheckConstraint(
            "deployment_type IN ('cloud', 'private', 'both')",
            name="ck_control_plans_dep_type",
        ),
        CheckConstraint(
            "status IN ('active', 'retired')",
            name="ck_control_plans_status",
        ),
    )


class ControlSubscription(ControlBase):
    __tablename__ = "control_subscriptions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    customer_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("control_customers.id"), nullable=False
    )
    plan_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("control_plans.id"), nullable=False
    )
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="active")
    starts_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    max_stores_override: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    max_devices_override: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    features_override: Mapped[Optional[List[str]]] = mapped_column(JSON, nullable=True)
    auto_renew: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )

    __table_args__ = (
        CheckConstraint(
            "status IN ('trial', 'active', 'past_due', 'grace', 'suspended', 'expired', 'cancelled')",
            name="ck_control_subscriptions_status",
        ),
        CheckConstraint("ends_at > starts_at", name="ck_control_subscriptions_dates"),
    )


class ControlDeployment(ControlBase):
    __tablename__ = "control_deployments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    customer_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("control_customers.id"), nullable=False
    )
    subscription_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("control_subscriptions.id"), nullable=True
    )
    deployment_code: Mapped[str] = mapped_column(
        String(80), nullable=False, unique=True
    )
    deployment_mode: Mapped[str] = mapped_column(String(20), nullable=False)
    organization_id: Mapped[str] = mapped_column(String(36), nullable=False)
    organization_name: Mapped[str] = mapped_column(String(200), nullable=False)
    lifecycle_status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="pending_enrollment"
    )
    release_channel: Mapped[str] = mapped_column(
        String(20), nullable=False, default="stable"
    )
    public_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    reported_version: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    last_heartbeat_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )

    __table_args__ = (
        CheckConstraint(
            "deployment_mode IN ('cloud', 'private')",
            name="ck_control_deployments_mode",
        ),
        CheckConstraint(
            "lifecycle_status IN ('provisioning', 'pending_enrollment', 'active', 'degraded', 'grace', 'suspended', 'decommissioned')",
            name="ck_control_deployments_lifecycle",
        ),
        CheckConstraint(
            "release_channel IN ('stable', 'beta', 'pinned')",
            name="ck_control_deployments_channel",
        ),
    )


class ControlDeploymentInstance(ControlBase):
    __tablename__ = "control_deployment_instances"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    deployment_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("control_deployments.id"), nullable=False
    )
    instance_fingerprint: Mapped[str] = mapped_column(String(255), nullable=False)
    hostname: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    os_info: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    container_runtime_version: Mapped[Optional[str]] = mapped_column(
        String(100), nullable=True
    )
    enrolled_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    last_seen_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")

    __table_args__ = (
        CheckConstraint(
            "status IN ('active', 'replaced', 'revoked')",
            name="ck_control_dep_instances_status",
        ),
    )


class ControlEnrollmentAuthorization(ControlBase):
    __tablename__ = "control_enrollment_authorizations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    deployment_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("control_deployments.id"), nullable=False
    )
    token_hash: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    consumed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_by: Mapped[str] = mapped_column(String(36), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )


class ControlDeploymentCredential(ControlBase):
    __tablename__ = "control_deployment_credentials"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    deployment_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("control_deployments.id"), nullable=False
    )
    credential_hash: Mapped[str] = mapped_column(
        String(255), nullable=False, unique=True
    )
    issued_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    revoked_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    revoke_reason: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)


class ControlLicense(ControlBase):
    __tablename__ = "control_licenses"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    deployment_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("control_deployments.id"), nullable=False
    )
    subscription_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("control_subscriptions.id"), nullable=False
    )
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    signing_key_id: Mapped[str] = mapped_column(String(80), nullable=False)
    payload_json: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False)
    signature: Mapped[str] = mapped_column(Text, nullable=False)
    issued_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    valid_from: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    offline_grace_until: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    created_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)

    __table_args__ = (
        UniqueConstraint(
            "deployment_id", "sequence", name="uq_control_licenses_dep_seq"
        ),
        CheckConstraint(
            "status IN ('active', 'superseded', 'expired', 'revoked')",
            name="ck_control_licenses_status",
        ),
    )


class ControlLicenseRevocation(ControlBase):
    __tablename__ = "control_license_revocations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    license_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("control_licenses.id"), nullable=False, unique=True
    )
    deployment_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("control_deployments.id"), nullable=False
    )
    reason: Mapped[str] = mapped_column(String(500), nullable=False)
    revoked_by: Mapped[str] = mapped_column(String(36), nullable=False)
    revoked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )


class ControlHeartbeat(ControlBase):
    __tablename__ = "control_heartbeats"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    deployment_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("control_deployments.id"), nullable=False
    )
    reported_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    app_version: Mapped[str] = mapped_column(String(40), nullable=False)
    db_migration_version: Mapped[Optional[str]] = mapped_column(
        String(80), nullable=True
    )
    health_status: Mapped[str] = mapped_column(String(20), nullable=False)
    active_store_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    active_device_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    active_user_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    license_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    license_sequence: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    metrics: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)

    __table_args__ = (
        CheckConstraint(
            "health_status IN ('healthy', 'degraded', 'unhealthy')",
            name="ck_control_heartbeats_health",
        ),
        Index(
            "ix_control_heartbeats_dep_received", "deployment_id", "received_at"
        ),
    )


class ControlRelease(ControlBase):
    __tablename__ = "control_releases"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    version: Mapped[str] = mapped_column(String(40), nullable=False, unique=True)
    channel: Mapped[str] = mapped_column(String(20), nullable=False, default="stable")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="published")
    min_upgrade_from_version: Mapped[Optional[str]] = mapped_column(
        String(40), nullable=True
    )
    requires_db_migration: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    artifacts: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False)
    release_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    published_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )

    __table_args__ = (
        CheckConstraint(
            "channel IN ('stable', 'beta', 'security')",
            name="ck_control_releases_channel",
        ),
        CheckConstraint(
            "status IN ('draft', 'published', 'deprecated', 'recalled')",
            name="ck_control_releases_status",
        ),
    )


class ControlAuditLog(ControlBase):
    __tablename__ = "control_audit_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    actor_type: Mapped[str] = mapped_column(String(30), nullable=False)
    actor_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    deployment_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
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

