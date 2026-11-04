"""Business Data Plane API v1 aggregate router."""

from __future__ import annotations

from dataclasses import asdict
from datetime import datetime, timezone
from typing import Any, Dict

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import (
    Principal,
    get_current_principal,
    get_db,
    get_request_id,
    get_settings,
)
from app.core.config import Settings
from app.core.envelope import ok_response
from app.deployment.profile import resolve_organization_entitlements
from app.modules.authentication.router import router as auth_router
from app.modules.devices.router import router as devices_router
from app.modules.employees.router import router as employees_router
from app.modules.inventory.router import router as inventory_router
from app.modules.organizations.router import router as organizations_router
from app.modules.products.router import router as products_router
from app.modules.sales.router import router as sales_router
from app.modules.stores.router import router as stores_router
from app.modules.synchronization.router import router as sync_router

api_v1_router = APIRouter(prefix="/api/v1")

api_v1_router.include_router(auth_router)
api_v1_router.include_router(organizations_router)
api_v1_router.include_router(stores_router)
api_v1_router.include_router(employees_router)
api_v1_router.include_router(devices_router)
api_v1_router.include_router(products_router)
api_v1_router.include_router(inventory_router)
api_v1_router.include_router(sales_router)
api_v1_router.include_router(sync_router)


@api_v1_router.get("/system/info", tags=["System"])
def get_system_info(
    settings: Settings = Depends(get_settings),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    return ok_response(
        {
            "app_name": settings.app_name,
            "app_version": settings.app_version,
            "minimum_pos_app_version": settings.minimum_pos_app_version,
            "deployment_mode": settings.deployment_mode,
            "tenant_mode": settings.tenant_mode,
            "deployment_id": settings.deployment_id,
            "server_time": datetime.now(timezone.utc).isoformat(),
        },
        request_id=request_id,
    )


@api_v1_router.get("/system/capabilities", tags=["System"])
def get_system_capabilities(
    principal: Principal = Depends(get_current_principal),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    ent = resolve_organization_entitlements(
        db=db, settings=settings, organization=principal.organization
    )
    return ok_response(asdict(ent), request_id=request_id)
