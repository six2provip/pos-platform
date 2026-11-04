"""Deployment-aware application configuration.

Reference:
- ADR-003: Multi-tenant Cloud, Single-tenant Private Server
- ADR-012: Deployment-specific Configuration
- docs/01-system-architecture.md
- docs/05-private-server-deployment.md (Section 8)
"""

from __future__ import annotations

import os
from typing import Dict, List, Literal, Optional
from pydantic import BaseModel, Field, model_validator


class Settings(BaseModel):
    """Typed runtime settings loaded from environment variables."""

    app_name: str = "POS Platform Business API"
    app_version: str = "1.0.0"
    minimum_pos_app_version: str = "1.0.0"
    app_env: Literal["development", "staging", "production", "test"] = "development"

    # Deployment profile: 'cloud' (multi-tenant) or 'private' (single-tenant)
    deployment_mode: Literal["cloud", "private"] = "cloud"
    tenant_mode: Literal["multi", "single"] = "multi"

    # Required when deployment_mode == 'private'
    deployment_id: Optional[str] = None
    organization_id: Optional[str] = None
    public_base_url: str = "https://api.pos-platform.local"

    # Database & Redis
    database_url: str = "postgresql+psycopg2://business_app:dev_business_app_password@127.0.0.1:5432/pos_business"
    redis_url: Optional[str] = None

    # Authentication & Cryptography
    jwt_secret_key: str = "dev-only-jwt-secret-key-replace-in-production-32bytes"
    jwt_algorithm: str = "HS256"
    jwt_issuer: str = "pos-platform-business"
    jwt_user_audience: str = "pos-business-user"
    jwt_device_audience: str = "pos-business-device"
    access_token_expire_seconds: int = 900  # 15 minutes
    refresh_token_expire_days: int = 30
    device_access_token_expire_seconds: int = 900
    activation_code_expire_seconds: int = 300

    # Cloud Control Plane & Licensing (Private Server mode)
    cloud_control_plane_url: str = "https://control.pos-platform.local"
    license_validation_enabled: bool = False
    trusted_license_public_keys: Dict[str, str] = Field(default_factory=dict)

    # Sync limits
    sync_max_batch_events: int = 50
    sync_max_catalog_page_size: int = 500

    # Default limits in Cloud mode when no explicit subscription record is attached
    default_max_stores: int = 10
    default_max_devices: int = 50

    # CORS
    cors_allowed_origins: List[str] = Field(
        default_factory=lambda: ["http://localhost:3000", "http://localhost:3001"]
    )

    @model_validator(mode="after")
    def validate_deployment_profile(self) -> "Settings":
        if self.deployment_mode == "cloud":
            if self.tenant_mode != "multi":
                raise ValueError("Cloud deployment_mode requires tenant_mode='multi'")
        elif self.deployment_mode == "private":
            if self.tenant_mode != "single":
                raise ValueError("Private deployment_mode requires tenant_mode='single'")
            if not self.organization_id:
                raise ValueError(
                    "Private deployment_mode requires fixed ORGANIZATION_ID"
                )
            if not self.deployment_id:
                raise ValueError(
                    "Private deployment_mode requires immutable DEPLOYMENT_ID"
                )
        return self

    @classmethod
    def from_env(cls) -> "Settings":
        deployment_mode = os.getenv("DEPLOYMENT_MODE", "cloud").lower()
        default_tenant_mode = "single" if deployment_mode == "private" else "multi"
        tenant_mode = os.getenv("TENANT_MODE", default_tenant_mode).lower()
        lic_enabled_default = "true" if deployment_mode == "private" else "false"
        lic_enabled = (
            os.getenv("LICENSE_VALIDATION_ENABLED", lic_enabled_default).lower()
            == "true"
        )
        trusted_keys_raw = os.getenv("TRUSTED_LICENSE_PUBLIC_KEYS", "")
        trusted_keys: Dict[str, str] = {}
        if trusted_keys_raw:
            for pair in trusted_keys_raw.split(","):
                if ":" in pair:
                    k, v = pair.split(":", 1)
                    trusted_keys[k.strip()] = v.strip()

        return cls(
            app_env=os.getenv("APP_ENV", "development"),  # type: ignore[arg-type]
            deployment_mode=deployment_mode,  # type: ignore[arg-type]
            tenant_mode=tenant_mode,  # type: ignore[arg-type]
            deployment_id=os.getenv("DEPLOYMENT_ID"),
            organization_id=os.getenv("ORGANIZATION_ID"),
            public_base_url=os.getenv(
                "PUBLIC_BASE_URL", "https://api.pos-platform.local"
            ),
            database_url=os.getenv(
                "DATABASE_URL",
                "postgresql+psycopg2://business_app:dev_business_app_password@127.0.0.1:5432/pos_business",
            ),
            redis_url=os.getenv("REDIS_URL"),
            jwt_secret_key=os.getenv(
                "JWT_SECRET_KEY",
                "dev-only-jwt-secret-key-replace-in-production-32bytes",
            ),
            cloud_control_plane_url=os.getenv(
                "CLOUD_CONTROL_PLANE_URL", "https://control.pos-platform.local"
            ),
            license_validation_enabled=lic_enabled,
            trusted_license_public_keys=trusted_keys,
        )

