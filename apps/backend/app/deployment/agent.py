"""Private Server outbound Control Plane agent for enrollment, heartbeat, and license sync."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional

import httpx
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.deployment.profile import cache_signed_license_envelope
from app.infrastructure.models import (
    Device,
    LocalDeploymentIdentity,
    LocalLicenseCache,
    Store,
    User,
)


class PrivateControlAgent:
    """Outbound-only HTTPS client used by Private Server deployments to talk to Cloud Control Plane."""

    def __init__(
        self,
        settings: Optional[Settings] = None,
        control_plane_url: Optional[str] = None,
        credential_token: Optional[str] = None,
        http_client: Optional[httpx.Client] = None,
    ) -> None:
        self.settings = settings or Settings.from_env()
        self.base_url = (
            control_plane_url or self.settings.cloud_control_plane_url
        ).rstrip("/")
        self.credential_token = credential_token
        self._client = http_client

    def _headers(self, token: Optional[str] = None) -> Dict[str, str]:
        bearer = token or self.credential_token
        headers = {"Content-Type": "application/json", "Accept": "application/json"}
        if bearer:
            headers["Authorization"] = f"Bearer {bearer}"
        return headers

    def enroll_deployment(
        self,
        db: Session,
        enrollment_token: str,
        deployment_id: str,
        organization_id: str,
        instance_metadata: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Exchange one-time enrollment token for deployment credentials and initial signed license."""
        payload = {
            "deployment_id": deployment_id,
            "organization_id": organization_id,
            "enrollment_token": enrollment_token,
            "instance_metadata": instance_metadata,
        }
        client = self._client or httpx.Client(base_url=self.base_url, timeout=15.0)
        resp = client.post(
            "/control/v1/enrollments",
            json=payload,
            headers={"Content-Type": "application/json"},
        )
        resp.raise_for_status()
        body = resp.json()["data"]

        identity = db.get(LocalDeploymentIdentity, 1)
        if identity is None:
            identity = LocalDeploymentIdentity(
                id=1,
                deployment_id=deployment_id,
                organization_id=organization_id,
                deployment_mode="private",
            )
            db.add(identity)
        else:
            identity.deployment_id = deployment_id
            identity.organization_id = organization_id
        db.flush()

        if "license_envelope" in body and body["license_envelope"]:
            cache_signed_license_envelope(db, self.settings, body["license_envelope"])
        else:
            db.commit()

        self.credential_token = body.get("deployment_credential", {}).get("token")
        return body

    def build_heartbeat_payload(
        self,
        db: Session,
        health_status: str = "healthy",
    ) -> Dict[str, Any]:
        """Build privacy-safe operational heartbeat payload (never includes customer PII or orders)."""
        identity = db.get(LocalDeploymentIdentity, 1)
        org_id = (
            identity.organization_id if identity else self.settings.organization_id
        )

        active_stores = (
            db.query(func.count(Store.id))
            .filter(
                Store.organization_id == org_id,
                Store.status == "active",
                Store.deleted_at.is_(None),
            )
            .scalar()
            or 0
        )
        active_devices = (
            db.query(func.count(Device.id))
            .filter(
                Device.organization_id == org_id,
                Device.status == "active",
                Device.deleted_at.is_(None),
            )
            .scalar()
            or 0
        )
        active_users = (
            db.query(func.count(User.id))
            .filter(
                User.organization_id == org_id,
                User.status == "active",
                User.deleted_at.is_(None),
            )
            .scalar()
            or 0
        )
        lic_cache = db.get(LocalLicenseCache, 1)

        return {
            "reported_at": datetime.now(timezone.utc).isoformat(),
            "app_version": self.settings.app_version,
            "db_migration_version": "0001_initial",
            "health_status": health_status,
            "active_store_count": int(active_stores),
            "active_device_count": int(active_devices),
            "active_user_count": int(active_users),
            "license_id": lic_cache.license_id if lic_cache else None,
            "license_sequence": lic_cache.sequence if lic_cache else 0,
            "metrics": {
                "uptime_seconds": 3600,
                "disk_free_bytes": 50_000_000_000,
                "backup_last_success_at": datetime.now(timezone.utc).isoformat(),
                "sync_backlog_count": 0,
            },
        }

    def send_heartbeat(self, db: Session) -> Dict[str, Any]:
        """Send 5-minute heartbeat to Cloud Control Plane."""
        payload = self.build_heartbeat_payload(db)
        client = self._client or httpx.Client(base_url=self.base_url, timeout=15.0)
        resp = client.post(
            "/control/v1/deployments/me/heartbeat",
            json=payload,
            headers=self._headers(),
        )
        resp.raise_for_status()
        return resp.json()["data"]

    def refresh_license(self, db: Session) -> Dict[str, Any]:
        """Fetch latest signed license envelope from Cloud Control Plane and verify/cache locally."""
        client = self._client or httpx.Client(base_url=self.base_url, timeout=15.0)
        resp = client.get(
            "/control/v1/deployments/me/license",
            headers=self._headers(),
        )
        resp.raise_for_status()
        data = resp.json()["data"]
        envelope = data.get("license_envelope", data)
        verified = cache_signed_license_envelope(db, self.settings, envelope)
        return {
            "license_id": verified.payload.license_id,
            "sequence": verified.payload.sequence,
        }
