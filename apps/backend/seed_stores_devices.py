"""Idempotent seed script for Stores (branches) and Kiosk/POS Devices with Serial Numbers.

Usage inside Docker:
    docker exec pos-backend python /workspace/apps/backend/seed_stores_devices.py
"""

from __future__ import annotations

from typing import Any, Dict, List

from sqlalchemy.orm import sessionmaker

from app.core.config import Settings
from app.core.database import build_engine, set_rls_tenant_context
from app.infrastructure.models import (
    Device,
    Organization,
    PriceList,
    Store,
    StorePriceListAssignment,
    StoreSetting,
    User,
)


STORES_AND_DEVICES: List[Dict[str, Any]] = [
    {
        "code": "DEMO-S1",
        "name": "Chi nhánh Quận 1 - Nguyễn Huệ",
        "address_line": "68 Nguyễn Huệ, P. Bến Nghé, Quận 1, TP.HCM",
        "phone": "028 3821 1001",
        "status": "active",
        "devices": [
            {"code": "KIOSK-Q1-01", "serial": "K2-HCMQ1-0001", "name": "Kiosk Tự Order Cửa Chính", "type": "android_kiosk", "status": "active"},
            {"code": "KIOSK-Q1-02", "serial": "K2-HCMQ1-0002", "name": "Kiosk Tự Order Tầng 2", "type": "android_kiosk", "status": "active"},
            {"code": "POS-Q1-03", "serial": "SN-POSQ1-0003", "name": "Máy Thu Ngân Quầy Bar", "type": "android_pos", "status": "active"},
        ],
    },
    {
        "code": "DEMO-S2",
        "name": "Chi nhánh Quận 3 - Võ Văn Tần",
        "address_line": "214 Võ Văn Tần, P. 5, Quận 3, TP.HCM",
        "phone": "028 3832 2002",
        "status": "active",
        "devices": [
            {"code": "KIOSK-Q3-01", "serial": "K2-HCMQ3-0001", "name": "Kiosk Sảnh Chính", "type": "android_kiosk", "status": "active"},
            {"code": "KIOSK-Q3-02", "serial": "K2-HCMQ3-0002", "name": "Kiosk Khu Sân Vườn", "type": "android_kiosk", "status": "disabled"},
        ],
    },
    {
        "code": "DEMO-S3",
        "name": "Chi nhánh Thảo Điền - TP. Thủ Đức",
        "address_line": "42 Xuân Thủy, P. Thảo Điền, TP. Thủ Đức, TP.HCM",
        "phone": "028 3744 3003",
        "status": "active",
        "devices": [
            {"code": "KIOSK-TD-01", "serial": "K2-HCMTD-0001", "name": "Kiosk Tự Phục Vụ 01", "type": "android_kiosk", "status": "active"},
            {"code": "KIOSK-TD-02", "serial": "K2-HCMTD-0002", "name": "Kiosk Tự Phục Vụ 02", "type": "android_kiosk", "status": "active"},
            {"code": "POS-TD-03", "serial": "SN-POSTD-0003", "name": "Máy POS Thu Ngân", "type": "android_pos", "status": "active"},
        ],
    },
    {
        "code": "DEMO-S4",
        "name": "Chi nhánh Phú Mỹ Hưng - Quận 7",
        "address_line": "105 Tôn Dật Tiên, P. Tân Phú, Quận 7, TP.HCM",
        "phone": "028 5412 4004",
        "status": "active",
        "devices": [
            {"code": "KIOSK-Q7-01", "serial": "K2-HCMQ7-0001", "name": "Kiosk Crescent Mall", "type": "android_kiosk", "status": "active"},
            {"code": "POS-Q7-02", "serial": "SN-POSQ7-0002", "name": "Máy POS Quầy Pha Chế", "type": "android_pos", "status": "active"},
        ],
    },
    {
        "code": "DEMO-S5",
        "name": "Chi nhánh Hoàn Kiếm - Hà Nội",
        "address_line": "18 Nhà Thờ, P. Hàng Trống, Q. Hoàn Kiếm, Hà Nội",
        "phone": "024 3928 5005",
        "status": "active",
        "devices": [
            {"code": "KIOSK-HK-01", "serial": "K2-HNHK-0001", "name": "Kiosk Tầng 1 Nhà Thờ", "type": "android_kiosk", "status": "active"},
            {"code": "KIOSK-HK-02", "serial": "K2-HNHK-0002", "name": "Kiosk Tầng 2 Ban Công", "type": "android_kiosk", "status": "active"},
            {"code": "POS-HK-03", "serial": "SN-POSHK-0003", "name": "Máy Thu Ngân Chính", "type": "android_pos", "status": "disabled"},
        ],
    },
    {
        "code": "DEMO-S6",
        "name": "Chi nhánh Cầu Giấy - Hà Nội",
        "address_line": "89 Xuân Thủy, P. Dịch Vọng Hậu, Q. Cầu Giấy, Hà Nội",
        "phone": "024 3795 6006",
        "status": "active",
        "devices": [
            {"code": "KIOSK-CG-01", "serial": "K2-HNCG-0001", "name": "Kiosk Khu Văn Phòng", "type": "android_kiosk", "status": "active"},
        ],
    },
    {
        "code": "DEMO-S7",
        "name": "Chi nhánh Hải Châu - Đà Nẵng",
        "address_line": "120 Bạch Đằng, P. Hải Châu 1, Q. Hải Châu, Đà Nẵng",
        "phone": "0236 3821 7007",
        "status": "active",
        "devices": [
            {"code": "KIOSK-DN-01", "serial": "K2-DNHC-0001", "name": "Kiosk Bờ Sông Hàn", "type": "android_kiosk", "status": "active"},
            {"code": "POS-DN-02", "serial": "SN-POSDN-0002", "name": "Máy Thu Ngân Đà Nẵng", "type": "android_pos", "status": "active"},
        ],
    },
    {
        "code": "DEMO-S8",
        "name": "Chi nhánh Sân Bay Tân Sơn Nhất (Bảo trì)",
        "address_line": "Ga Quốc Nội T1, Q. Tân Bình, TP.HCM",
        "phone": "028 3848 8008",
        "status": "inactive",
        "devices": [
            {"code": "KIOSK-TSN-01", "serial": "K2-TSN-0001", "name": "Kiosk Cổng A2 (Đang bảo trì)", "type": "android_kiosk", "status": "disabled"},
        ],
    },
]


def seed() -> None:
    settings = Settings.from_env()
    engine = build_engine(settings.database_url)
    SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False, expire_on_commit=False)

    with SessionLocal() as db:
        org = db.query(Organization).filter(Organization.code == "DEMO").first()
        if org is None:
            raise RuntimeError("Organization 'DEMO' not found.")

        set_rls_tenant_context(db, org.id)

        if org.max_stores_limit < 20:
            org.max_stores_limit = 20

        default_pl = (
            db.query(PriceList)
            .filter(PriceList.organization_id == org.id, PriceList.is_default.is_(True))
            .first()
        )
        admin_user = db.query(User).filter(User.email == "admin@demo.vn").first()
        actor_id = admin_user.id if admin_user else None

        created_stores = 0
        updated_stores = 0
        created_devices = 0

        for s_data in STORES_AND_DEVICES:
            store = (
                db.query(Store)
                .filter(Store.organization_id == org.id, Store.code == s_data["code"])
                .first()
            )
            if store is None:
                store = Store(
                    organization_id=org.id,
                    code=s_data["code"],
                    name=s_data["name"],
                    address_line=s_data["address_line"],
                    phone=s_data["phone"],
                    timezone=org.timezone,
                    currency_code=org.default_currency,
                    status=s_data["status"],
                    created_by=actor_id,
                    updated_by=actor_id,
                )
                db.add(store)
                db.flush()
                db.add(StoreSetting(organization_id=org.id, store_id=store.id, settings={}))
                if default_pl:
                    db.add(
                        StorePriceListAssignment(
                            organization_id=org.id,
                            store_id=store.id,
                            price_list_id=default_pl.id,
                        )
                    )
                created_stores += 1
            else:
                # Enrich existing store address/phone if empty
                if not store.address_line:
                    store.address_line = s_data["address_line"]
                if not store.phone:
                    store.phone = s_data["phone"]
                updated_stores += 1

            for d_data in s_data["devices"]:
                existing_dev = (
                    db.query(Device)
                    .filter(
                        Device.organization_id == org.id,
                        Device.device_code == d_data["code"],
                    )
                    .first()
                )
                if existing_dev is None:
                    db.add(
                        Device(
                            organization_id=org.id,
                            store_id=store.id,
                            device_code=d_data["code"],
                            serial_number=d_data["serial"],
                            name=d_data["name"],
                            device_type=d_data["type"],
                            platform="android",
                            status=d_data["status"],
                            created_by=actor_id,
                        )
                    )
                    created_devices += 1

        db.commit()
        print(
            f"Seeded Stores & Devices for '{org.code}':\n"
            f"  - Stores created: {created_stores} (enriched existing: {updated_stores})\n"
            f"  - Devices created: {created_devices}"
        )


if __name__ == "__main__":
    seed()

