"""Integration & security tests for Cloud Multi-Tenant Isolation, Auth, Catalog, Inventory, POS Devices, Sales, Refunds, and Offline Sync."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi.testclient import TestClient

from app.core.config import Settings
from app.core.database import build_engine
from app.main import create_app
from app.modules.organizations.service import provision_organization


def _setup_cloud_test_env(tmp_path):
    db_file = tmp_path / "cloud_test.db"
    settings = Settings(
        app_env="test",
        deployment_mode="cloud",
        tenant_mode="multi",
        database_url=f"sqlite:///{db_file}",
    )
    engine = build_engine(settings.database_url)
    app = create_app(settings=settings, engine=engine, create_tables=True)

    with app.state.session_factory() as db:
        org_a, user_a, store_a1 = provision_organization(
            db,
            settings,
            code="ORGA",
            name="Alpha Retail Co",
            admin_email="owner@alpha.vn",
            admin_password="Password@123",
            initial_store_code="A-HCM-01",
            initial_store_name="Alpha Store 01",
        )
        org_b, user_b, store_b1 = provision_organization(
            db,
            settings,
            code="ORGB",
            name="Beta Retail Co",
            admin_email="owner@beta.vn",
            admin_password="Password@123",
            initial_store_code="B-HN-01",
            initial_store_name="Beta Store 01",
        )
        db.commit()
        assert store_a1 is not None and store_b1 is not None
        org_a_id, store_a1_id = org_a.id, store_a1.id
        org_b_id, store_b1_id = org_b.id, store_b1.id

    return TestClient(app), org_a_id, store_a1_id, org_b_id, store_b1_id


def test_cloud_multi_tenant_isolation_and_refresh_token_family_revocation(tmp_path):
    client, org_a_id, store_a1_id, org_b_id, store_b1_id = _setup_cloud_test_env(
        tmp_path
    )

    # 1. Login as Org A Owner and Org B Owner
    login_a = client.post(
        "/api/v1/auth/login",
        json={
            "organization_code": "ORGA",
            "identifier": "owner@alpha.vn",
            "password": "Password@123",
        },
    )
    assert login_a.status_code == 200
    token_a = login_a.json()["data"]["access_token"]
    refresh_a1 = login_a.json()["data"]["refresh_token"]

    login_b = client.post(
        "/api/v1/auth/login",
        json={
            "organization_code": "ORGB",
            "identifier": "owner@beta.vn",
            "password": "Password@123",
        },
    )
    assert login_b.status_code == 200
    token_b = login_b.json()["data"]["access_token"]

    # 2. Org B creates a product in Org B
    prod_b_resp = client.post(
        "/api/v1/products",
        headers={"Authorization": f"Bearer {token_b}"},
        json={
            "product_code": "BETA-SECRET-01",
            "name": "Beta Confidential Coffee",
            "product_type": "stocked",
            "track_inventory": True,
            "variants": [
                {
                    "variant_code": "BETA-V1",
                    "variant_name": "Default",
                    "sku": "BETA-SKU-1",
                    "unit_name": "bag",
                    "default_price": "120000.0000",
                    "barcodes": [{"barcode": "8930000999999", "is_primary": True}],
                }
            ],
        },
    )
    assert prod_b_resp.status_code == 201
    prod_b_id = prod_b_resp.json()["data"]["id"]

    # 3. Org A user attempts to read Org B's product or Org B's store (even when spoofing X-Organization-ID!)
    spoof_headers = {
        "Authorization": f"Bearer {token_a}",
        "X-Organization-ID": org_b_id,
    }
    get_cross_prod = client.get(
        f"/api/v1/products/{prod_b_id}", headers=spoof_headers
    )
    assert get_cross_prod.status_code == 404

    get_cross_store = client.get(
        f"/api/v1/stores/{store_b1_id}", headers=spoof_headers
    )
    assert get_cross_store.status_code == 404

    list_a_prods = client.get("/api/v1/products", headers=spoof_headers)
    assert list_a_prods.status_code == 200
    assert list_a_prods.json()["data"] == []

    # 4. Refresh token rotation & replay family revocation
    rot_resp = client.post(
        "/api/v1/auth/refresh", json={"refresh_token": refresh_a1}
    )
    assert rot_resp.status_code == 200
    refresh_a2 = rot_resp.json()["data"]["refresh_token"]
    assert refresh_a2 != refresh_a1

    # Replay consumed refresh_a1 -> revokes entire family!
    replay_resp = client.post(
        "/api/v1/auth/refresh", json={"refresh_token": refresh_a1}
    )
    assert replay_resp.status_code == 401

    # Now even refresh_a2 from the same family is revoked!
    subsequent_resp = client.post(
        "/api/v1/auth/refresh", json={"refresh_token": refresh_a2}
    )
    assert subsequent_resp.status_code == 401


def test_end_to_end_pos_device_sales_inventory_idempotency_refund_and_sync(tmp_path):
    client, org_a_id, store_a1_id, _, _ = _setup_cloud_test_env(tmp_path)

    login_a = client.post(
        "/api/v1/auth/login",
        json={
            "organization_code": "ORGA",
            "identifier": "owner@alpha.vn",
            "password": "Password@123",
        },
    ).json()["data"]
    user_token = login_a["access_token"]
    auth_h = {"Authorization": f"Bearer {user_token}"}

    # 1. Create a second store in Org A (Store A2) to test device store-scope isolation
    store_a2_resp = client.post(
        "/api/v1/stores",
        headers=auth_h,
        json={
            "code": "A-HN-02",
            "name": "Alpha Store 02",
            "timezone": "Asia/Ho_Chi_Minh",
            "currency_code": "VND",
        },
    )
    assert store_a2_resp.status_code == 201
    store_a2_id = store_a2_resp.json()["data"]["id"]

    # 2. Create category and stocked product in Org A
    cat_resp = client.post(
        "/api/v1/categories",
        headers=auth_h,
        json={"code": "DRINKS", "name": "Beverages", "sort_order": 1},
    )
    assert cat_resp.status_code == 201
    cat_id = cat_resp.json()["data"]["id"]

    prod_resp = client.post(
        "/api/v1/products",
        headers=auth_h,
        json={
            "category_id": cat_id,
            "product_code": "CF-SUA-DA",
            "name": "Ca Phe Sua Da",
            "product_type": "stocked",
            "track_inventory": True,
            "variants": [
                {
                    "variant_code": "CF-SUA-DA-M",
                    "variant_name": "Size M",
                    "sku": "SKU-CF-M",
                    "unit_name": "cup",
                    "default_cost": "12000.0000",
                    "default_price": "35000.0000",
                    "barcodes": [{"barcode": "8938505974192", "is_primary": True}],
                }
            ],
        },
    )
    assert prod_resp.status_code == 201
    variant_id = prod_resp.json()["data"]["variants"][0]["id"]

    # 3. Stock adjustment: draft -> post (+100.0000 cups in Store A1)
    adj_resp = client.post(
        "/api/v1/inventory/adjustments",
        headers=auth_h,
        json={
            "store_id": store_a1_id,
            "reason": "Opening stock count",
            "items": [
                {
                    "product_variant_id": variant_id,
                    "quantity_delta": "100.0000",
                    "note": "Initial count",
                }
            ],
        },
    )
    assert adj_resp.status_code == 201
    adj_id = adj_resp.json()["data"]["id"]

    post_adj = client.post(
        f"/api/v1/inventory/adjustments/{adj_id}/post",
        headers={**auth_h, "Idempotency-Key": "idem-post-adj-001"},
    )
    assert post_adj.status_code == 200
    assert post_adj.json()["data"]["status"] == "posted"

    inv_check = client.get(
        f"/api/v1/inventory/{variant_id}",
        params={"store_id": store_a1_id},
        headers=auth_h,
    )
    assert inv_check.status_code == 200
    assert inv_check.json()["data"]["on_hand_quantity"] == "100.0000"

    # 4. Provision POS Device in Store A1 & activate via QR activation code
    dev_resp = client.post(
        f"/api/v1/stores/{store_a1_id}/devices",
        headers=auth_h,
        json={
            "device_code": "POS-A1-01",
            "name": "Front Counter POS 1",
            "device_type": "android_pos",
            "platform": "android",
        },
    )
    assert dev_resp.status_code == 201
    device_id = dev_resp.json()["data"]["id"]

    act_resp = client.post(
        f"/api/v1/devices/{device_id}/activation-codes",
        headers=auth_h,
        json={"expires_in_seconds": 300},
    )
    assert act_resp.status_code == 201
    activation_code = act_resp.json()["data"]["activation_code"]

    exch_resp = client.post(
        "/api/v1/device-activations/exchange",
        json={
            "activation_code": activation_code,
            "device_info": {
                "app_version": "1.0.0",
                "android_version": "14",
                "manufacturer": "Sunmi",
                "model": "V2s",
            },
        },
    )
    assert exch_resp.status_code == 200
    dev_access_token = exch_resp.json()["data"]["access_token"]
    dev_h = {"Authorization": f"Bearer {dev_access_token}"}

    # Replaying consumed activation code must fail with 409
    exch_replay = client.post(
        "/api/v1/device-activations/exchange",
        json={
            "activation_code": activation_code,
            "device_info": {"app_version": "1.0.0"},
        },
    )
    assert exch_replay.status_code == 409

    # 5. Device bootstrap & Store scope isolation check
    boot_resp = client.get("/api/v1/pos/bootstrap", headers=dev_h)
    assert boot_resp.status_code == 200
    assert boot_resp.json()["data"]["store"]["id"] == store_a1_id

    # Device bound to Store A1 cannot query Store A2!
    cross_store_boot = client.get(
        "/api/v1/pos/bootstrap", params={"store_id": store_a2_id}, headers=dev_h
    )
    assert cross_store_boot.status_code == 403
    assert cross_store_boot.json()["error"]["code"] == "DEVICE_STORE_SCOPE_VIOLATION"

    # 6. Create Cash Drawer & Open Cash Session
    drawer_resp = client.post(
        "/api/v1/cash-drawers",
        headers=auth_h,
        json={"store_id": store_a1_id, "code": "DRW-01", "name": "Main Drawer"},
    )
    assert drawer_resp.status_code == 201
    drawer_id = drawer_resp.json()["data"]["id"]

    open_sess = client.post(
        "/api/v1/cash-sessions/open",
        headers=dev_h,
        json={
            "store_id": store_a1_id,
            "cash_drawer_id": drawer_id,
            "opening_amount": "500000.0000",
        },
    )
    assert open_sess.status_code == 201
    session_id = open_sess.json()["data"]["id"]

    # 7. Create POS Order (2 cups @ 35,000 = 70,000 VND, paid 100,000 CASH -> 30,000 change)
    order_payload = {
        "store_id": store_a1_id,
        "client_order_id": "cli-order-0001",
        "items": [
            {
                "product_variant_id": variant_id,
                "quantity": "2.0000",
            }
        ],
        "payments": [
            {
                "payment_method_code": "CASH",
                "amount": "100000.0000",
            }
        ],
    }
    order_resp = client.post(
        "/api/v1/orders",
        headers={**dev_h, "Idempotency-Key": "idem-order-0001"},
        json=order_payload,
    )
    assert order_resp.status_code == 201
    order_data = order_resp.json()["data"]
    order_id = order_data["id"]
    order_item_id = order_data["items"][0]["id"]
    assert order_data["total_amount"] == "70000.0000"
    assert order_data["paid_amount"] == "100000.0000"
    assert order_data["change_amount"] == "30000.0000"
    assert order_data["payment_status"] == "paid"

    # Verify inventory was deducted from 100.0000 -> 98.0000
    inv_after_sale = client.get(
        f"/api/v1/inventory/{variant_id}",
        params={"store_id": store_a1_id},
        headers=auth_h,
    )
    assert inv_after_sale.json()["data"]["on_hand_quantity"] == "98.0000"

    # Replay identical order with same Idempotency-Key -> 200 OK, no duplicate stock deduction!
    order_replay = client.post(
        "/api/v1/orders",
        headers={**dev_h, "Idempotency-Key": "idem-order-0001"},
        json=order_payload,
    )
    assert order_replay.status_code == 200
    assert order_replay.json()["data"]["id"] == order_id
    inv_after_replay = client.get(
        f"/api/v1/inventory/{variant_id}",
        params={"store_id": store_a1_id},
        headers=auth_h,
    )
    assert inv_after_replay.json()["data"]["on_hand_quantity"] == "98.0000"

    # Reusing same Idempotency-Key with modified quantity -> 409 IDEMPOTENCY_KEY_REUSED
    modified_payload = {
        **order_payload,
        "items": [{"product_variant_id": variant_id, "quantity": "5.0000"}],
    }
    order_conflict = client.post(
        "/api/v1/orders",
        headers={**dev_h, "Idempotency-Key": "idem-order-0001"},
        json=modified_payload,
    )
    assert order_conflict.status_code == 409
    assert order_conflict.json()["error"]["code"] == "IDEMPOTENCY_KEY_REUSED"

    # 8. Create partial Refund (1 cup refunded & restocked -> inventory 98.0000 -> 99.0000)
    refund_resp = client.post(
        f"/api/v1/orders/{order_id}/refunds",
        headers=auth_h,
        json={
            "reason": "Customer returned 1 cup",
            "items": [
                {
                    "order_item_id": order_item_id,
                    "quantity": "1.0000",
                    "refund_amount": "35000.0000",
                    "restock_quantity": "1.0000",
                }
            ],
        },
    )
    assert refund_resp.status_code == 201
    inv_after_refund = client.get(
        f"/api/v1/inventory/{variant_id}",
        params={"store_id": store_a1_id},
        headers=auth_h,
    )
    assert inv_after_refund.json()["data"]["on_hand_quantity"] == "99.0000"

    # 9. Close & Review Cash Session (Opening 500,000 + net cash sale 70,000 = 570,000 expected)
    close_sess = client.post(
        f"/api/v1/cash-sessions/{session_id}/close",
        headers=dev_h,
        json={"actual_closing_amount": "570000.0000"},
    )
    assert close_sess.status_code == 200
    assert close_sess.json()["data"]["expected_closing_amount"] == "570000.0000"
    assert close_sess.json()["data"]["difference_amount"] == "0.0000"

    # 10. Offline Outbox Push (/api/v1/sync/push) & Cursor Catalog Pull (/api/v1/sync/catalog)
    pull_sync = client.get(
        "/api/v1/sync/catalog",
        params={"cursor": "cat_seq_000000000", "limit": 50},
        headers=dev_h,
    )
    assert pull_sync.status_code == 200
    assert pull_sync.json()["data"]["cursor_status"] == "ok"
    assert len(pull_sync.json()["data"]["changes"]) >= 2

    push_payload = {
        "device_id": device_id,
        "store_id": store_a1_id,
        "batch_id": "batch_offline_001",
        "events": [
            {
                "event_id": "ev_offline_order_1",
                "event_type": "order.created",
                "idempotency_key": f"{org_a_id}:{device_id}:order:offline-001",
                "occurred_at": datetime.now(timezone.utc).isoformat(),
                "payload": {
                    "client_order_id": "cli-offline-001",
                    "currency_code": "VND",
                    "items": [
                        {
                            "product_variant_id": variant_id,
                            "quantity": "3.0000",
                            "unit_price": "35000.0000",
                        }
                    ],
                    "payments": [
                        {
                            "payment_method_code": "CASH",
                            "amount": "105000.0000",
                        }
                    ],
                },
            },
            {
                "event_id": "ev_offline_hb_1",
                "event_type": "device.event",
                "idempotency_key": f"{org_a_id}:{device_id}:hb:offline-001",
                "occurred_at": datetime.now(timezone.utc).isoformat(),
                "payload": {
                    "type": "heartbeat",
                    "metadata": {"battery": 92},
                },
            },
        ],
    }
    push_resp = client.post("/api/v1/sync/push", headers=dev_h, json=push_payload)
    assert push_resp.status_code == 200
    results = push_resp.json()["data"]["results"]
    assert len(results) == 2
    assert results[0]["status"] == "accepted"
    assert results[1]["status"] == "accepted"

    # Inventory after 3 offline cups sold: 99.0000 -> 96.0000
    inv_after_sync = client.get(
        f"/api/v1/inventory/{variant_id}",
        params={"store_id": store_a1_id},
        headers=auth_h,
    )
    assert inv_after_sync.json()["data"]["on_hand_quantity"] == "96.0000"

    # Re-pushing the exact same offline batch is idempotent and does NOT deduct stock again!
    push_replay = client.post("/api/v1/sync/push", headers=dev_h, json=push_payload)
    assert push_replay.status_code == 200
    assert (
        push_replay.json()["data"]["results"][0]["server_resource_id"]
        == results[0]["server_resource_id"]
    )
    inv_after_sync_replay = client.get(
        f"/api/v1/inventory/{variant_id}",
        params={"store_id": store_a1_id},
        headers=auth_h,
    )
    assert inv_after_sync_replay.json()["data"]["on_hand_quantity"] == "96.0000"
