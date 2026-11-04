"""Integration & security tests for Cloud Control Plane & Private Server Single-Tenant Deployment."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.core.database import build_engine
from app.core.exceptions import ConflictError
from app.deployment.agent import PrivateControlAgent
from app.main import create_app
from app.modules.organizations.service import provision_organization
from control_app.main import (
    ControlPlaneSettings,
    build_control_engine,
    create_control_plane_app,
)
from licensing.issuer.signer import generate_ed25519_keypair


def test_control_plane_enrollment_heartbeat_and_private_server_enforcement(tmp_path):
    # 1. Initialize Cloud Control Plane with a known Ed25519 key pair
    priv_b64, pub_b64 = generate_ed25519_keypair()
    key_id = "cp-ed25519-2026-01"
    cp_db_file = tmp_path / "control_plane.db"
    cp_settings = ControlPlaneSettings(
        database_url=f"sqlite:///{cp_db_file}",
        signing_key_id=key_id,
        signing_private_key_b64=priv_b64,
        signing_public_key_b64=pub_b64,
    )
    cp_engine = build_control_engine(cp_settings.database_url)
    cp_app = create_control_plane_app(
        settings=cp_settings, engine=cp_engine, create_tables=True
    )
    cp_client = TestClient(cp_app)

    # 2. Super-Admin logs in on Cloud Control Plane
    admin_login = cp_client.post(
        "/control/admin/v1/auth/login",
        json={
            "email": "superadmin@pos-platform.local",
            "password": "SuperAdmin@123456",
        },
    )
    assert admin_login.status_code == 200
    admin_token = admin_login.json()["data"]["access_token"]
    admin_h = {"Authorization": f"Bearer {admin_token}"}

    # 3. Super-Admin creates Customer, Plan (max_stores=2, max_devices=2), Subscription, and Private Deployment
    cust_resp = cp_client.post(
        "/control/admin/v1/customers",
        headers=admin_h,
        json={
            "customer_code": "CUST-LOTUS",
            "legal_name": "Lotus Mart Co., Ltd",
            "display_name": "Lotus Mart",
            "billing_email": "it@lotusmart.vn",
        },
    )
    assert cust_resp.status_code == 201
    customer_id = cust_resp.json()["data"]["id"]

    plan_resp = cp_client.post(
        "/control/admin/v1/plans",
        headers=admin_h,
        json={
            "plan_code": "PRIVATE-PRO-2S",
            "name": "Private Pro (2 Stores / 2 Devices)",
            "deployment_type": "private",
            "edition": "enterprise",
            "default_max_stores": 2,
            "default_max_devices": 2,
            "default_features": ["pos", "inventory", "reports"],
            "offline_grace_days": 7,
        },
    )
    assert plan_resp.status_code == 201
    plan_id = plan_resp.json()["data"]["id"]

    sub_resp = cp_client.post(
        "/control/admin/v1/subscriptions",
        headers=admin_h,
        json={"customer_id": customer_id, "plan_id": plan_id},
    )
    assert sub_resp.status_code == 201
    sub_id = sub_resp.json()["data"]["id"]

    fixed_org_id = "018f2b10-0000-7000-8000-000000000101"
    dep_resp = cp_client.post(
        "/control/admin/v1/deployments",
        headers=admin_h,
        json={
            "customer_id": customer_id,
            "subscription_id": sub_id,
            "deployment_code": "DEP-LOTUS-HCM",
            "deployment_mode": "private",
            "organization_id": fixed_org_id,
            "organization_name": "Lotus Mart",
            "release_channel": "stable",
        },
    )
    assert dep_resp.status_code == 201
    deployment_id = dep_resp.json()["data"]["id"]

    enroll_auth_resp = cp_client.post(
        f"/control/admin/v1/deployments/{deployment_id}/enrollment-authorizations",
        headers=admin_h,
    )
    assert enroll_auth_resp.status_code == 201
    enrollment_token = enroll_auth_resp.json()["data"]["enrollment_token"]

    # 4. Initialize Private Server Business Data Plane (`DEPLOYMENT_MODE=private`, `TENANT_MODE=single`)
    priv_db_file = tmp_path / "private_business.db"
    priv_settings = Settings(
        app_env="test",
        deployment_mode="private",
        tenant_mode="single",
        deployment_id=deployment_id,
        organization_id=fixed_org_id,
        database_url=f"sqlite:///{priv_db_file}",
        license_validation_enabled=True,
        trusted_license_public_keys={key_id: pub_b64},
    )
    priv_engine = build_engine(priv_settings.database_url)
    priv_app = create_app(
        settings=priv_settings, engine=priv_engine, create_tables=True
    )
    priv_client = TestClient(priv_app)

    with priv_app.state.session_factory() as db:
        org, owner, store_1 = provision_organization(
            db,
            priv_settings,
            organization_id=fixed_org_id,
            code="LOTUS",
            name="Lotus Mart",
            admin_email="admin@lotusmart.vn",
            admin_password="LotusPassword@123",
            initial_store_code="LOTUS-S1",
            initial_store_name="Lotus Store 1",
        )
        db.commit()

        # Verify Single-Tenant invariant: Attempting to provision a second Organization on a Private Server is blocked!
        with pytest.raises(ConflictError) as single_org_err:
            provision_organization(
                db,
                priv_settings,
                code="SECOND-ORG",
                name="Illegal Second Org",
                admin_email="admin@second.vn",
                admin_password="Password@123",
            )
        assert single_org_err.value.code == "PRIVATE_SINGLE_ORGANIZATION_VIOLATION"

        # 5. Enroll Private Server with Cloud Control Plane using PrivateControlAgent
        agent = PrivateControlAgent(
            settings=priv_settings,
            control_plane_url="http://testserver",
            http_client=cp_client,
        )
        enrolled = agent.enroll_deployment(
            db=db,
            enrollment_token=enrollment_token,
            deployment_id=deployment_id,
            organization_id=fixed_org_id,
            instance_metadata={
                "instance_fingerprint": "fp-lotus-server-01",
                "hostname": "lotus-pos-srv-01",
                "os_info": "Ubuntu 24.04 LTS",
                "container_runtime_version": "Docker 29.0",
                "app_version": "1.0.0",
            },
        )
        assert enrolled["lifecycle_status"] == "active"
        assert enrolled["license_envelope"]["payload"]["sequence"] == 1
        dep_cred_token = enrolled["deployment_credential"]["token"]

        # Replaying one-time enrollment token must fail with 409
        replay_enroll = cp_client.post(
            "/control/v1/enrollments",
            json={
                "deployment_id": deployment_id,
                "organization_id": fixed_org_id,
                "enrollment_token": enrollment_token,
                "instance_metadata": {"instance_fingerprint": "fp-lotus-server-01"},
            },
        )
        assert replay_enroll.status_code == 409

        # 6. Send operational heartbeat via PrivateControlAgent
        hb_resp = agent.send_heartbeat(db)
        assert hb_resp["connectivity_state"] == "online"

    # 7. Verify Heartbeat Privacy Allowlist: sending unapproved PII fields is rejected with 422!
    bad_hb = cp_client.post(
        "/control/v1/deployments/me/heartbeat",
        headers={"Authorization": f"Bearer {dep_cred_token}"},
        json={
            "reported_at": datetime.now(timezone.utc).isoformat(),
            "app_version": "1.0.0",
            "health_status": "healthy",
            "active_store_count": 1,
            "active_device_count": 0,
            "active_user_count": 1,
            "customer_phone_numbers": ["0909123456"],
        },
    )
    assert bad_hb.status_code == 422

    # 8. Login to Private Server Business API (no organization_code required in private mode!)
    priv_login = priv_client.post(
        "/api/v1/auth/login",
        json={
            "identifier": "admin@lotusmart.vn",
            "password": "LotusPassword@123",
        },
    )
    assert priv_login.status_code == 200
    priv_user_token = priv_login.json()["data"]["access_token"]
    priv_h = {"Authorization": f"Bearer {priv_user_token}"}

    # Verify Control Plane rejects Business User JWTs on /control/v1/*
    wrong_token_cp = cp_client.get(
        "/control/v1/deployments/me",
        headers=priv_h,
    )
    assert wrong_token_cp.status_code == 403

    # 9. Verify Private Server Capabilities & License Limit Enforcement (max_stores=2)
    caps_resp = priv_client.get("/api/v1/system/capabilities", headers=priv_h)
    assert caps_resp.status_code == 200
    caps = caps_resp.json()["data"]
    assert caps["deployment_mode"] == "private"
    assert caps["max_stores"] == 2
    assert caps["max_devices"] == 2
    assert caps["license_state"] == "active"

    # Creating Store #2 succeeds (reaching max_stores=2)
    store_2_resp = priv_client.post(
        "/api/v1/stores",
        headers=priv_h,
        json={
            "code": "LOTUS-S2",
            "name": "Lotus Store 2",
            "timezone": "Asia/Ho_Chi_Minh",
            "currency_code": "VND",
        },
    )
    assert store_2_resp.status_code == 201

    # Creating Store #3 exceeds signed license limit (max_stores=2) -> 409 LICENSE_LIMIT_EXCEEDED!
    store_3_resp = priv_client.post(
        "/api/v1/stores",
        headers=priv_h,
        json={
            "code": "LOTUS-S3",
            "name": "Lotus Store 3 (Over Limit)",
            "timezone": "Asia/Ho_Chi_Minh",
            "currency_code": "VND",
        },
    )
    assert store_3_resp.status_code == 409
    assert store_3_resp.json()["error"]["code"] == "LICENSE_LIMIT_EXCEEDED"

