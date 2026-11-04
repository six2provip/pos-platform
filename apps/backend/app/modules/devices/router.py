"""POS Devices and Activation API endpoints (`/api/v1/devices/*`, `/api/v1/device-activations/exchange`).

Reference:
- docs/01-system-architecture.md (Section 12)
- docs/03-api-specification.md (Section 7.9)
- docs/07-security-and-licensing.md (Section 8)
"""

from __future__ import annotations

import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional
from fastapi import APIRouter, Depends, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.api.deps import (
    DevicePrincipal,
    UserPrincipal,
    get_current_device,
    get_db,
    get_request_id,
    get_settings,
    require_permission,
    verify_store_access,
)
from app.core.config import Settings
from app.core.database import set_rls_tenant_context
from app.core.envelope import PaginationMeta, ok_response
from app.core.exceptions import (
    ConflictError,
    ForbiddenError,
    NotFoundError,
    UnauthorizedError,
)
from app.core.security import (
    create_device_access_token,
    generate_opaque_secret,
    hash_opaque_secret,
)
from app.deployment.profile import enforce_device_limit
from app.infrastructure.models import (
    Device,
    DeviceActivation,
    DeviceEvent,
    DeviceToken,
    Organization,
    OrganizationSetting,
    Store,
)
from app.modules.audit.service import record_audit_event

router = APIRouter(tags=["POS Devices"])


class CreateDeviceRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    device_code: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=160)
    device_type: str = Field(default="android_pos", max_length=30)
    platform: str = Field(default="android", max_length=30)


class CreateActivationCodeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expires_in_seconds: int = Field(default=300, ge=60, le=3600)


class DeviceInfoPayload(BaseModel):
    model_config = ConfigDict(extra="allow")

    app_version: str = Field(min_length=1, max_length=40)
    android_version: Optional[str] = None
    manufacturer: Optional[str] = None
    model: Optional[str] = None


class ExchangeActivationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    activation_code: str = Field(min_length=10, max_length=256)
    device_info: DeviceInfoPayload
    device_public_key: Optional[str] = None


class ReassignStoreRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    target_store_id: str
    pending_outbox_count: int = Field(default=0, ge=0)
    force_disposition_reason: Optional[str] = None


class DeviceHeartbeatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    app_version: str = Field(min_length=1, max_length=40)
    pending_outbox_count: int = Field(default=0, ge=0)
    occurred_at: Optional[datetime] = None


class RotateDeviceTokenRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    refresh_token: str = Field(min_length=10, max_length=512)


class RequestPairingSessionBody(BaseModel):
    model_config = ConfigDict(extra="allow")
    device_info: Optional[DeviceInfoPayload] = None


class PairByCodeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    pairing_code: str = Field(min_length=4, max_length=12)
    store_id: str
    name: str = Field(min_length=1, max_length=160)
    device_code: Optional[str] = Field(default=None, max_length=80)
    device_type: str = Field(default="android_pos", max_length=30)
    platform: str = Field(default="android", max_length=30)


_PAIRING_SESSIONS: Dict[str, Dict[str, Any]] = {}
_PAIRING_BY_CODE: Dict[str, str] = {}


def _serialize_device(device: Device) -> Dict[str, Any]:
    return {
        "id": device.id,
        "organization_id": device.organization_id,
        "store_id": device.store_id,
        "device_code": device.device_code,
        "name": device.name,
        "device_type": device.device_type,
        "status": device.status,
        "platform": device.platform,
        "app_version": device.app_version,
        "last_seen_at": device.last_seen_at.isoformat() if device.last_seen_at else None,
        "last_sync_at": device.last_sync_at.isoformat() if device.last_sync_at else None,
        "created_at": device.created_at.isoformat(),
    }


@router.post("/devices/pairing-session")
def request_pairing_session(
    body: Optional[RequestPairingSessionBody] = None,
    settings: Settings = Depends(get_settings),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    code = f"{secrets.randbelow(900000) + 100000}"
    session_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=15)

    session_data = {
        "session_id": session_id,
        "pairing_code": code,
        "status": "pending",
        "created_at": now.isoformat(),
        "expires_at": expires_at.isoformat(),
        "device_info": body.device_info.model_dump() if (body and body.device_info) else {},
    }
    _PAIRING_SESSIONS[session_id] = session_data
    _PAIRING_BY_CODE[code] = session_id

    return ok_response(
        {
            "session_id": session_id,
            "pairing_code": code,
            "formatted_code": f"{code[:3]} {code[3:]}",
            "expires_in_seconds": 900,
            "expires_at": expires_at.strftime("%Y-%m-%dT%H:%M:%SZ"),
        },
        request_id=request_id,
    )


@router.get("/devices/pairing-session/{session_id}")
def get_pairing_session_status(
    session_id: str,
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    sess = _PAIRING_SESSIONS.get(session_id)
    if not sess:
        raise NotFoundError(code="SESSION_NOT_FOUND", message="Phiên ghép nối không tồn tại hoặc đã hết hạn.")

    exp = datetime.fromisoformat(sess["expires_at"])
    if datetime.now(timezone.utc) > exp:
        sess["status"] = "expired"
        _PAIRING_BY_CODE.pop(sess["pairing_code"], None)
        raise UnauthorizedError(code="SESSION_EXPIRED", message="Phiên ghép nối đã hết hạn.")

    return ok_response(sess, request_id=request_id)


@router.post("/devices/pair-by-code", status_code=status.HTTP_201_CREATED)
def pair_device_by_code(
    body: PairByCodeRequest,
    principal: UserPrincipal = Depends(require_permission("devices.create")),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    request_id: str = Depends(get_request_id),
) -> JSONResponse:
    cleaned_code = body.pairing_code.replace(" ", "").replace("-", "").strip()
    session_id = _PAIRING_BY_CODE.get(cleaned_code)
    if not session_id or session_id not in _PAIRING_SESSIONS:
        raise NotFoundError(
            code="PAIRING_CODE_NOT_FOUND",
            message=f"Mã ghép nối '{body.pairing_code}' không tồn tại hoặc đã hết hạn. Vui lòng kiểm tra màn hình máy POS.",
        )

    sess = _PAIRING_SESSIONS[session_id]
    if sess.get("status") != "pending":
        raise ConflictError(
            code="PAIRING_CODE_ALREADY_USED",
            message="Mã ghép nối này đã được sử dụng trước đó.",
        )

    store = verify_store_access(db, principal, requested_store_id=body.store_id)
    assert store is not None
    org = principal.organization

    enforce_device_limit(db, settings, org)

    now = datetime.now(timezone.utc)

    raw_code = (body.device_code or "").strip().upper()
    if not raw_code:
        count = db.query(Device).filter(Device.organization_id == org.id).count()
        raw_code = f"POS-TERMINAL-{count + 1:02d}"

    existing = (
        db.query(Device)
        .filter(Device.organization_id == org.id, Device.device_code == raw_code)
        .first()
    )
    if existing:
        if existing.status in ("revoked", "pending"):
            device = existing
            device.status = "active"
            device.store_id = store.id
            device.name = body.name.strip()
        else:
            count = db.query(Device).filter(Device.organization_id == org.id).count()
            raw_code = f"POS-TERMINAL-{count + 1:02d}"
            device = Device(
                organization_id=org.id,
                store_id=store.id,
                device_code=raw_code,
                name=body.name.strip(),
                device_type=body.device_type,
                platform=body.platform,
                status="active",
                created_by=principal.user.id,
            )
            db.add(device)
    else:
        device = Device(
            organization_id=org.id,
            store_id=store.id,
            device_code=raw_code,
            name=body.name.strip(),
            device_type=body.device_type,
            platform=body.platform,
            status="active",
            created_by=principal.user.id,
        )
        db.add(device)

    db.flush()

    prior_tokens = (
        db.query(DeviceToken)
        .filter(
            DeviceToken.organization_id == org.id,
            DeviceToken.device_id == device.id,
            DeviceToken.revoked_at.is_(None),
        )
        .all()
    )
    for pt in prior_tokens:
        pt.revoked_at = now
        pt.revoke_reason = "re-paired"

    raw_refresh = generate_opaque_secret(prefix="drt")
    token_row = DeviceToken(
        organization_id=org.id,
        device_id=device.id,
        token_hash=hash_opaque_secret(raw_refresh),
        issued_at=now,
        expires_at=now + timedelta(days=90),
        last_used_at=now,
    )
    db.add(token_row)
    db.flush()

    access_token = create_device_access_token(
        settings=settings,
        device_id=device.id,
        organization_id=org.id,
        store_id=store.id,
        token_family_id=token_row.token_family_id,
        deployment_id=settings.deployment_id,
        now=now,
    )

    device.last_seen_at = now
    device.app_version = sess.get("device_info", {}).get("app_version", "1.0.0")

    db.add(
        DeviceEvent(
            organization_id=org.id,
            device_id=device.id,
            event_type="paired_by_code",
            occurred_at=now,
            received_at=now,
            metadata={"pairing_code": cleaned_code, "paired_by_user": principal.user.id},
        )
    )

    record_audit_event(
        db,
        action="device.paired_by_code",
        entity_type="device",
        actor_type="user",
        actor_id=principal.user.id,
        organization_id=org.id,
        store_id=store.id,
        entity_id=device.id,
        request_id=request_id,
        metadata={"device_code": device.device_code, "pairing_code": cleaned_code},
    )

    db.commit()
    db.refresh(device)

    sess["status"] = "paired"
    sess["access_token"] = access_token
    sess["refresh_token"] = raw_refresh
    sess["device"] = _serialize_device(device)
    sess["store"] = {"id": store.id, "code": store.code, "name": store.name}
    sess["organization"] = {"id": org.id, "code": org.code, "name": org.name}
    _PAIRING_BY_CODE.pop(cleaned_code, None)

    return JSONResponse(
        status_code=status.HTTP_201_CREATED,
        content=ok_response(
            {
                "message": f"Ghép nối thành công máy POS {device.name} ({device.device_code})!",
                "device": _serialize_device(device),
                "store": {"id": store.id, "code": store.code, "name": store.name},
            },
            request_id=request_id,
        ),
    )


@router.get("/devices")
@router.get("/stores/{store_id}/devices")
def list_devices(
    store_id: Optional[str] = None,
    principal: UserPrincipal = Depends(require_permission("devices.read")),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    query = db.query(Device).filter(
        Device.organization_id == principal.organization.id,
        Device.deleted_at.is_(None),
    )
    if store_id:
        verify_store_access(db, principal, requested_store_id=store_id)
        query = query.filter(Device.store_id == store_id)
    elif not principal.all_stores_access:
        query = query.filter(Device.store_id.in_(principal.authorized_store_ids))

    devices = query.order_by(Device.created_at.desc()).all()
    return ok_response(
        [_serialize_device(d) for d in devices],
        request_id=request_id,
        meta=PaginationMeta(page_size=50, next_cursor=None, has_more=False),
    )


@router.post("/stores/{store_id}/devices", status_code=status.HTTP_201_CREATED)
def create_device(
    store_id: str,
    body: CreateDeviceRequest,
    principal: UserPrincipal = Depends(require_permission("devices.create")),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    request_id: str = Depends(get_request_id),
) -> JSONResponse:
    store = verify_store_access(db, principal, requested_store_id=store_id)
    assert store is not None
    org = principal.organization
    enforce_device_limit(db, settings, org)

    norm_code = body.device_code.strip().upper()
    if (
        db.query(Device)
        .filter(Device.organization_id == org.id, Device.device_code == norm_code)
        .first()
    ):
        raise ConflictError(
            code="DEVICE_CODE_EXISTS",
            message=f"Device code '{norm_code}' already exists in this organization.",
        )

    device = Device(
        organization_id=org.id,
        store_id=store.id,
        device_code=norm_code,
        name=body.name.strip(),
        device_type=body.device_type,
        platform=body.platform,
        status="pending",
        created_by=principal.user.id,
    )
    db.add(device)
    db.flush()

    record_audit_event(
        db,
        action="device.created",
        entity_type="device",
        actor_type="user",
        actor_id=principal.user.id,
        organization_id=org.id,
        store_id=store.id,
        entity_id=device.id,
        request_id=request_id,
        metadata={"device_code": device.device_code},
    )
    db.commit()
    db.refresh(device)
    return JSONResponse(
        status_code=status.HTTP_201_CREATED,
        content=ok_response(_serialize_device(device), request_id=request_id),
    )


@router.post("/devices/{device_id}/activation-codes", status_code=status.HTTP_201_CREATED)
def create_activation_code(
    device_id: str,
    body: CreateActivationCodeRequest,
    principal: UserPrincipal = Depends(require_permission("devices.activate")),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    request_id: str = Depends(get_request_id),
) -> JSONResponse:
    org = principal.organization
    device = (
        db.query(Device)
        .filter(
            Device.organization_id == org.id,
            Device.id == device_id,
            Device.deleted_at.is_(None),
        )
        .first()
    )
    if device is None:
        raise NotFoundError(code="DEVICE_NOT_FOUND", message="POS device not found.")
    verify_store_access(db, principal, requested_store_id=device.store_id)
    enforce_device_limit(db, settings, org, exclude_device_id=device.id)

    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(seconds=body.expires_in_seconds)
    raw_code = generate_opaque_secret(prefix="act", num_bytes=24)

    activation = DeviceActivation(
        organization_id=org.id,
        store_id=device.store_id,
        device_id=device.id,
        activation_code_hash=hash_opaque_secret(raw_code),
        expires_at=expires_at,
        created_by=principal.user.id,
    )
    db.add(activation)
    record_audit_event(
        db,
        action="device.activation_code.issued",
        entity_type="device",
        actor_type="user",
        actor_id=principal.user.id,
        organization_id=org.id,
        store_id=device.store_id,
        entity_id=device.id,
        request_id=request_id,
        metadata={"activation_id": activation.id, "expires_at": expires_at.isoformat()},
    )
    db.commit()
    db.refresh(activation)

    return JSONResponse(
        status_code=status.HTTP_201_CREATED,
        content=ok_response(
            {
                "activation_id": activation.id,
                "activation_code": raw_code,
                "expires_at": expires_at.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "qr_payload": {
                    "server_url": settings.public_base_url,
                    "deployment_id": settings.deployment_id,
                    "activation_code": raw_code,
                    "protocol_version": 1,
                },
            },
            request_id=request_id,
        ),
    )


@router.post("/device-activations/exchange")
def exchange_activation_code(
    body: ExchangeActivationRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    code_hash = hash_opaque_secret(body.activation_code.strip())
    activation = (
        db.query(DeviceActivation)
        .filter(DeviceActivation.activation_code_hash == code_hash)
        .first()
    )
    if activation is None:
        raise UnauthorizedError(
            code="INVALID_ACTIVATION_CODE",
            message="Activation code is invalid or unknown.",
        )

    set_rls_tenant_context(db, activation.organization_id)
    now = datetime.now(timezone.utc)

    if activation.consumed_at is not None:
        raise ConflictError(
            code="ACTIVATION_CODE_ALREADY_USED",
            message="Activation code has already been consumed.",
        )

    exp_utc = (
        activation.expires_at.replace(tzinfo=timezone.utc)
        if activation.expires_at.tzinfo is None
        else activation.expires_at.astimezone(timezone.utc)
    )
    if now >= exp_utc:
        raise UnauthorizedError(
            code="ACTIVATION_CODE_EXPIRED",
            message="Activation code has expired.",
        )

    org = (
        db.query(Organization)
        .filter(
            Organization.id == activation.organization_id,
            Organization.deleted_at.is_(None),
        )
        .first()
    )
    if org is None or org.status != "active":
        raise ForbiddenError(
            code="ORGANIZATION_INACTIVE", message="Organization is not active."
        )

    store = (
        db.query(Store)
        .filter(
            Store.organization_id == org.id,
            Store.id == activation.store_id,
            Store.deleted_at.is_(None),
        )
        .first()
    )
    if store is None or store.status != "active":
        raise ForbiddenError(code="STORE_INACTIVE", message="Store is not active.")

    device = (
        db.query(Device)
        .filter(
            Device.organization_id == org.id,
            Device.id == activation.device_id,
            Device.deleted_at.is_(None),
        )
        .first()
    )
    if device is None or device.status in ("disabled", "revoked"):
        raise ForbiddenError(
            code="DEVICE_NOT_ELIGIBLE",
            message="POS device is disabled or revoked.",
        )

    enforce_device_limit(db, settings, org, exclude_device_id=device.id)

    # Mark activation consumed and revoke any prior active tokens for this device
    activation.consumed_at = now
    prior_tokens = (
        db.query(DeviceToken)
        .filter(
            DeviceToken.organization_id == org.id,
            DeviceToken.device_id == device.id,
            DeviceToken.revoked_at.is_(None),
        )
        .all()
    )
    for pt in prior_tokens:
        pt.revoked_at = now
        pt.revoke_reason = "reactivated"

    device.status = "active"
    device.app_version = body.device_info.app_version
    device.last_seen_at = now

    raw_refresh = generate_opaque_secret(prefix="drt")
    token_row = DeviceToken(
        organization_id=org.id,
        device_id=device.id,
        token_hash=hash_opaque_secret(raw_refresh),
        issued_at=now,
        expires_at=now + timedelta(days=90),
        last_used_at=now,
    )
    db.add(token_row)
    db.flush()

    access_token = create_device_access_token(
        settings=settings,
        device_id=device.id,
        organization_id=org.id,
        store_id=store.id,
        token_family_id=token_row.token_family_id,
        deployment_id=settings.deployment_id,
        now=now,
    )

    db.add(
        DeviceEvent(
            organization_id=org.id,
            device_id=device.id,
            event_type="activated",
            occurred_at=now,
            received_at=now,
            event_metadata={"app_version": body.device_info.app_version},
        )
    )
    record_audit_event(
        db,
        action="device.activated",
        entity_type="device",
        actor_type="device",
        actor_id=device.id,
        organization_id=org.id,
        store_id=store.id,
        entity_id=device.id,
        request_id=request_id,
        metadata={"device_code": device.device_code},
    )

    org_setting = (
        db.query(OrganizationSetting)
        .filter(OrganizationSetting.organization_id == org.id)
        .first()
    )
    cfg_ver = f"cfg_{org_setting.version:06d}" if org_setting else "cfg_000001"

    db.commit()
    return ok_response(
        {
            "access_token": access_token,
            "refresh_token": raw_refresh,
            "token_type": "Bearer",
            "expires_in": settings.device_access_token_expire_seconds,
            "deployment": {
                "deployment_id": settings.deployment_id,
                "deployment_mode": settings.deployment_mode,
                "server_url": settings.public_base_url,
            },
            "organization": {"id": org.id, "name": org.name},
            "store": {"id": store.id, "code": store.code, "name": store.name},
            "device": {"id": device.id, "device_code": device.device_code},
            "config_version": cfg_ver,
        },
        request_id=request_id,
    )


@router.post("/devices/{device_id}/reassign-store")
def reassign_device_store(
    device_id: str,
    body: ReassignStoreRequest,
    principal: UserPrincipal = Depends(require_permission("devices.reassign")),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    org = principal.organization
    device = (
        db.query(Device)
        .filter(
            Device.organization_id == org.id,
            Device.id == device_id,
            Device.deleted_at.is_(None),
        )
        .first()
    )
    if device is None:
        raise NotFoundError(code="DEVICE_NOT_FOUND", message="POS device not found.")

    verify_store_access(db, principal, requested_store_id=device.store_id)
    target_store = verify_store_access(
        db, principal, requested_store_id=body.target_store_id
    )
    assert target_store is not None

    if body.pending_outbox_count > 0 and not body.force_disposition_reason:
        raise ConflictError(
            code="DEVICE_HAS_PENDING_OUTBOX_EVENTS",
            message="Device has unsynchronized offline orders. Synchronize them first or provide force_disposition_reason.",
        )

    old_store_id = device.store_id
    device.store_id = target_store.id
    now = datetime.now(timezone.utc)

    # Revoke old store-bound credentials so the device must re-authenticate/rotate
    active_tokens = (
        db.query(DeviceToken)
        .filter(
            DeviceToken.organization_id == org.id,
            DeviceToken.device_id == device.id,
            DeviceToken.revoked_at.is_(None),
        )
        .all()
    )
    for tok in active_tokens:
        tok.revoked_at = now
        tok.revoke_reason = "store_reassigned"

    db.add(
        DeviceEvent(
            organization_id=org.id,
            device_id=device.id,
            event_type="store_reassigned",
            occurred_at=now,
            received_at=now,
            event_metadata={
                "old_store_id": old_store_id,
                "new_store_id": target_store.id,
                "force_disposition_reason": body.force_disposition_reason,
            },
        )
    )
    record_audit_event(
        db,
        action="device.store.reassigned",
        entity_type="device",
        actor_type="user",
        actor_id=principal.user.id,
        organization_id=org.id,
        store_id=target_store.id,
        entity_id=device.id,
        request_id=request_id,
        metadata={"old_store_id": old_store_id, "new_store_id": target_store.id},
    )
    db.commit()
    db.refresh(device)
    return ok_response(_serialize_device(device), request_id=request_id)


@router.delete("/devices/{device_id}")
def delete_device(
    device_id: str,
    principal: UserPrincipal = Depends(require_permission("devices.revoke")),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    org = principal.organization
    device = (
        db.query(Device)
        .filter(
            Device.organization_id == org.id,
            Device.id == device_id,
            Device.deleted_at.is_(None),
        )
        .first()
    )
    if device is None:
        raise NotFoundError(code="DEVICE_NOT_FOUND", message="POS device not found.")
    verify_store_access(db, principal, requested_store_id=device.store_id)

    now = datetime.now(timezone.utc)
    device.deleted_at = now
    device.status = "revoked"

    for tok in (
        db.query(DeviceToken)
        .filter(
            DeviceToken.organization_id == org.id,
            DeviceToken.device_id == device.id,
            DeviceToken.revoked_at.is_(None),
        )
        .all()
    ):
        tok.revoked_at = now
        tok.revoke_reason = "device_deleted"

    record_audit_event(
        db,
        action="device.deleted",
        entity_type="device",
        actor_type="user",
        actor_id=principal.user.id,
        organization_id=org.id,
        store_id=device.store_id,
        entity_id=device.id,
        request_id=request_id,
        metadata={"device_code": device.device_code},
    )
    db.commit()
    return ok_response({"deleted": True, "device_id": device_id}, request_id=request_id)


@router.post("/devices/{device_id}/revoke")
def revoke_device(
    device_id: str,
    principal: UserPrincipal = Depends(require_permission("devices.revoke")),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    org = principal.organization
    device = (
        db.query(Device)
        .filter(
            Device.organization_id == org.id,
            Device.id == device_id,
            Device.deleted_at.is_(None),
        )
        .first()
    )
    if device is None:
        raise NotFoundError(code="DEVICE_NOT_FOUND", message="POS device not found.")
    verify_store_access(db, principal, requested_store_id=device.store_id)

    now = datetime.now(timezone.utc)
    device.status = "revoked"
    for tok in (
        db.query(DeviceToken)
        .filter(
            DeviceToken.organization_id == org.id,
            DeviceToken.device_id == device.id,
            DeviceToken.revoked_at.is_(None),
        )
        .all()
    ):
        tok.revoked_at = now
        tok.revoke_reason = "admin_revoked"

    db.add(
        DeviceEvent(
            organization_id=org.id,
            device_id=device.id,
            event_type="revoked",
            occurred_at=now,
            received_at=now,
            event_metadata={"revoked_by": principal.user.id},
        )
    )
    record_audit_event(
        db,
        action="device.revoked",
        entity_type="device",
        actor_type="user",
        actor_id=principal.user.id,
        organization_id=org.id,
        store_id=device.store_id,
        entity_id=device.id,
        request_id=request_id,
    )
    db.commit()
    db.refresh(device)
    return ok_response(_serialize_device(device), request_id=request_id)


@router.delete("/devices/{device_id}")
def delete_device(
    device_id: str,
    principal: UserPrincipal = Depends(require_permission("devices.revoke")),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    org = principal.organization
    device = (
        db.query(Device)
        .filter(
            Device.organization_id == org.id,
            Device.id == device_id,
            Device.deleted_at.is_(None),
        )
        .first()
    )
    if device is None:
        raise NotFoundError(code="DEVICE_NOT_FOUND", message="POS device not found.")
    verify_store_access(db, principal, requested_store_id=device.store_id)

    now = datetime.now(timezone.utc)
    device.deleted_at = now
    device.status = "revoked"

    for tok in (
        db.query(DeviceToken)
        .filter(
            DeviceToken.organization_id == org.id,
            DeviceToken.device_id == device.id,
            DeviceToken.revoked_at.is_(None),
        )
        .all()
    ):
        tok.revoked_at = now
        tok.revoke_reason = "device_deleted"

    record_audit_event(
        db,
        action="device.deleted",
        entity_type="device",
        actor_type="user",
        actor_id=principal.user.id,
        organization_id=org.id,
        store_id=device.store_id,
        entity_id=device.id,
        request_id=request_id,
        metadata={"device_code": device.device_code},
    )
    db.commit()
    return ok_response({"deleted": True, "device_id": device_id}, request_id=request_id)


@router.get("/devices/me/config")
def get_device_self_config(
    principal: DevicePrincipal = Depends(get_current_device),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    org_setting = (
        db.query(OrganizationSetting)
        .filter(OrganizationSetting.organization_id == principal.organization.id)
        .first()
    )
    cfg_ver = f"cfg_{org_setting.version:06d}" if org_setting else "cfg_000001"
    return ok_response(
        {
            "config_version": cfg_ver,
            "deployment_mode": settings.deployment_mode,
            "deployment_id": settings.deployment_id,
            "organization": {
                "id": principal.organization.id,
                "name": principal.organization.name,
                "currency_code": principal.organization.default_currency,
                "timezone": principal.organization.timezone,
            },
            "store": {
                "id": principal.store.id,
                "code": principal.store.code,
                "name": principal.store.name,
                "timezone": principal.store.timezone,
                "currency_code": principal.store.currency_code,
            },
            "device": _serialize_device(principal.device),
            "settings": org_setting.settings if org_setting else {},
        },
        request_id=request_id,
    )


@router.post("/devices/me/heartbeat")
def post_device_heartbeat(
    body: DeviceHeartbeatRequest,
    principal: DevicePrincipal = Depends(get_current_device),
    db: Session = Depends(get_db),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    now = datetime.now(timezone.utc)
    principal.device.app_version = body.app_version
    principal.device.last_seen_at = now
    db.add(
        DeviceEvent(
            organization_id=principal.organization.id,
            device_id=principal.device.id,
            event_type="heartbeat",
            occurred_at=body.occurred_at or now,
            received_at=now,
            event_metadata={
                "app_version": body.app_version,
                "pending_outbox_count": body.pending_outbox_count,
            },
        )
    )
    db.commit()
    return ok_response(
        {
            "device_id": principal.device.id,
            "status": principal.device.status,
            "server_time": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        },
        request_id=request_id,
    )


@router.post("/devices/me/token/rotate")
def rotate_device_token(
    body: RotateDeviceTokenRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    request_id: str = Depends(get_request_id),
) -> Dict[str, Any]:
    tok_hash = hash_opaque_secret(body.refresh_token.strip())
    token_row = (
        db.query(DeviceToken).filter(DeviceToken.token_hash == tok_hash).first()
    )
    if token_row is None or token_row.revoked_at is not None:
        raise UnauthorizedError(
            code="INVALID_DEVICE_REFRESH_TOKEN",
            message="Device refresh credential is invalid or revoked.",
        )

    set_rls_tenant_context(db, token_row.organization_id)
    now = datetime.now(timezone.utc)
    exp_utc = (
        token_row.expires_at.replace(tzinfo=timezone.utc)
        if token_row.expires_at.tzinfo is None
        else token_row.expires_at.astimezone(timezone.utc)
    )
    if now >= exp_utc:
        raise UnauthorizedError(
            code="DEVICE_REFRESH_TOKEN_EXPIRED",
            message="Device refresh credential has expired.",
        )

    device = (
        db.query(Device)
        .filter(
            Device.organization_id == token_row.organization_id,
            Device.id == token_row.device_id,
            Device.deleted_at.is_(None),
        )
        .first()
    )
    if device is None or device.status != "active":
        raise ForbiddenError(
            code="DEVICE_NOT_ACTIVE", message="POS device is no longer active."
        )

    token_row.revoked_at = now
    token_row.revoke_reason = "rotated"

    new_raw_refresh = generate_opaque_secret(prefix="drt")
    new_tok = DeviceToken(
        organization_id=device.organization_id,
        device_id=device.id,
        token_hash=hash_opaque_secret(new_raw_refresh),
        token_family_id=token_row.token_family_id,
        issued_at=now,
        expires_at=now + timedelta(days=90),
        last_used_at=now,
    )
    db.add(new_tok)
    db.flush()

    access_token = create_device_access_token(
        settings=settings,
        device_id=device.id,
        organization_id=device.organization_id,
        store_id=device.store_id,
        token_family_id=new_tok.token_family_id,
        deployment_id=settings.deployment_id,
        now=now,
    )
    db.commit()
    return ok_response(
        {
            "access_token": access_token,
            "refresh_token": new_raw_refresh,
            "token_type": "Bearer",
            "expires_in": settings.device_access_token_expire_seconds,
        },
        request_id=request_id,
    )

