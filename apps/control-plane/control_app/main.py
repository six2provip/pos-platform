"""Cloud Control Plane FastAPI Application (`/control/v1/*` & `/control/admin/v1/*`).

Reference:
- ADR-004: Mandatory Cloud Control Plane Connection
- ADR-005: Separate Control Plane vs Business Data Plane
- docs/04-cloud-control-plane.md
- docs/07-security-and-licensing.md
"""

from __future__ import annotations

import hashlib
import importlib.util
import os
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Literal, Optional, Tuple

import bcrypt
import jwt
from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import create_engine, event, func
from sqlalchemy.orm import Session, sessionmaker

from control_app.models import (
    ControlAdminUser,
    ControlAuditLog,
    ControlBase,
    ControlCustomer,
    ControlDeployment,
    ControlDeploymentCredential,
    ControlDeploymentInstance,
    ControlEnrollmentAuthorization,
    ControlHeartbeat,
    ControlLicense,
    ControlLicenseRevocation,
    ControlPlan,
    ControlRelease,
    ControlSubscription,
)
from licensing.issuer.signer import LicenseIssuer, generate_ed25519_keypair
from licensing.schemas.envelope import (
    LicenseLimits,
    LicensePayload,
    SignedLicenseEnvelope,
    format_rfc3339_utc,
)

bearer_scheme = HTTPBearer(auto_error=False)


# ============================================================================
# Control Plane Settings & Helpers
# ============================================================================


class ControlPlaneSettings(BaseModel):
    app_name: str = "POS Platform Cloud Control Plane"
    app_version: str = "1.0.0"
    database_url: str = "sqlite:///./pos_control_dev.db"
    admin_jwt_secret: str = "dev-control-admin-jwt-secret-key-replace-in-prod-32b"
    admin_jwt_issuer: str = "pos-platform-control-plane"
    admin_jwt_audience: str = "pos-control-admin"
    signing_key_id: str = "cp-ed25519-2026-01"
    signing_private_key_b64: str = ""
    signing_public_key_b64: str = ""

    @classmethod
    def from_env(cls) -> "ControlPlaneSettings":
        priv = os.getenv("CONTROL_LICENSE_PRIVATE_KEY_B64", "")
        pub = os.getenv("CONTROL_LICENSE_PUBLIC_KEY_B64", "")
        if not priv:
            priv, pub = generate_ed25519_keypair()
        return cls(
            database_url=os.getenv(
                "CONTROL_DATABASE_URL", "sqlite:///./pos_control_dev.db"
            ),
            admin_jwt_secret=os.getenv(
                "CONTROL_ADMIN_JWT_SECRET",
                "dev-control-admin-jwt-secret-key-replace-in-prod-32b",
            ),
            signing_key_id=os.getenv("CONTROL_SIGNING_KEY_ID", "cp-ed25519-2026-01"),
            signing_private_key_b64=priv,
            signing_public_key_b64=pub,
        )


def build_control_engine(database_url: str):
    effective_url = database_url
    if effective_url.startswith("postgresql"):
        if importlib.util.find_spec("psycopg2") is None:
            effective_url = "sqlite:///./pos_control_dev.db"

    connect_args = (
        {"check_same_thread": False} if effective_url.startswith("sqlite") else {}
    )
    engine = create_engine(
        effective_url, pool_pre_ping=True, future=True, connect_args=connect_args
    )
    if effective_url.startswith("sqlite"):
        @event.listens_for(engine, "connect")
        def _set_sqlite_pragma(dbapi_connection, connection_record):  # type: ignore[no-untyped-def]
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    return engine


def sha256_hex(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


class ControlError(Exception):
    def __init__(
        self, code: str, message: str, status_code: int = 400, details: Optional[ list ] = None
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details or []


def cp_ok(data: Any, request_id: str) -> Dict[str, Any]:
    return {
        "success": True,
        "data": data,
        "message": None,
        "error": None,
        "request_id": request_id,
    }


def cp_err(
    code: str, message: str, request_id: str, details: Optional[list] = None
) -> Dict[str, Any]:
    return {
        "success": False,
        "data": None,
        "message": message,
        "error": {"code": code, "details": details or []},
        "request_id": request_id,
    }


def compute_connectivity_state(
    last_heartbeat_at: Optional[datetime], now: Optional[datetime] = None
) -> str:
    """Calculate deployment connectivity state from last heartbeat age (Section 14.3 of doc 04)."""
    if last_heartbeat_at is None:
        return "never_connected"
    ref_now = now or datetime.now(timezone.utc)
    hb = (
        last_heartbeat_at
        if last_heartbeat_at.tzinfo
        else last_heartbeat_at.replace(tzinfo=timezone.utc)
    )
    age_seconds = (ref_now - hb).total_seconds()
    if age_seconds <= 15 * 60:
        return "online"
    if age_seconds <= 60 * 60:
        return "delayed"
    if age_seconds <= 24 * 3600:
        return "stale"
    return "offline"


def record_control_audit(
    db: Session,
    *,
    actor_type: str,
    actor_id: Optional[str],
    action: str,
    entity_type: str,
    entity_id: Optional[str] = None,
    deployment_id: Optional[str] = None,
    request_id: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> None:
    db.add(
        ControlAuditLog(
            actor_type=actor_type,
            actor_id=actor_id,
            deployment_id=deployment_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            request_id=request_id,
            audit_metadata=metadata or {},
        )
    )


# ============================================================================
# Dependencies
# ============================================================================


def get_cp_settings(request: Request) -> ControlPlaneSettings:
    return request.app.state.settings


def get_cp_issuer(request: Request) -> LicenseIssuer:
    return request.app.state.license_issuer


def get_cp_db(request: Request):
    factory = request.app.state.session_factory
    db: Session = factory()
    try:
        yield db
    finally:
        db.close()


def get_cp_request_id(request: Request) -> str:
    return getattr(request.state, "request_id", "req_cp_unknown")


def require_control_admin(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    db: Session = Depends(get_cp_db),
    settings: ControlPlaneSettings = Depends(get_cp_settings),
) -> ControlAdminUser:
    if credentials is None or not credentials.credentials:
        raise ControlError(
            code="ADMIN_AUTH_REQUIRED",
            message="Provider Super-Admin bearer token is required.",
            status_code=401,
        )
    raw_token = credentials.credentials
    try:
        claims = jwt.decode(
            raw_token,
            settings.admin_jwt_secret,
            algorithms=["HS256"],
            issuer=settings.admin_jwt_issuer,
            audience=settings.admin_jwt_audience,
        )
    except jwt.PyJWTError as exc:
        raise ControlError(
            code="INVALID_ADMIN_TOKEN",
            message=f"Invalid or expired Super-Admin token: {exc}",
            status_code=401,
        ) from exc

    if claims.get("principal_type") != "control_admin":
        raise ControlError(
            code="INVALID_PRINCIPAL_TYPE",
            message="Only control_admin tokens are accepted on Provider Admin API.",
            status_code=403,
        )

    admin = (
        db.query(ControlAdminUser)
        .filter(
            ControlAdminUser.id == str(claims["sub"]),
            ControlAdminUser.status == "active",
        )
        .first()
    )
    if admin is None:
        raise ControlError(
            code="ADMIN_USER_INACTIVE",
            message="Super-Admin user is inactive or does not exist.",
            status_code=401,
        )
    return admin


def require_deployment_credential(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    db: Session = Depends(get_cp_db),
) -> ControlDeployment:
    """Authenticate a Private Server deployment machine credential (`cp_dep_live_...`).

    Strictly rejects Organization User JWTs, POS Device JWTs, or revoked deployment tokens.
    """
    if credentials is None or not credentials.credentials:
        raise ControlError(
            code="DEPLOYMENT_CREDENTIAL_REQUIRED",
            message="Deployment machine credential is required.",
            status_code=401,
        )
    raw = credentials.credentials.strip()
    if not raw.startswith("cp_dep_"):
        raise ControlError(
            code="INVALID_DEPLOYMENT_CREDENTIAL",
            message="Only deployment machine credentials ('cp_dep_...') are accepted on /control/v1/*.",
            status_code=403,
        )

    token_hash = sha256_hex(raw)
    now = datetime.now(timezone.utc)
    cred = (
        db.query(ControlDeploymentCredential)
        .filter(
            ControlDeploymentCredential.credential_hash == token_hash,
            ControlDeploymentCredential.revoked_at.is_(None),
        )
        .first()
    )
    if cred is None:
        raise ControlError(
            code="DEPLOYMENT_CREDENTIAL_REVOKED_OR_INVALID",
            message="Deployment credential is invalid or has been revoked.",
            status_code=401,
        )
    exp = (
        cred.expires_at
        if cred.expires_at.tzinfo
        else cred.expires_at.replace(tzinfo=timezone.utc)
    )
    if exp <= now:
        raise ControlError(
            code="DEPLOYMENT_CREDENTIAL_EXPIRED",
            message="Deployment credential has expired.",
            status_code=401,
        )

    deployment = (
        db.query(ControlDeployment)
        .filter(ControlDeployment.id == cred.deployment_id)
        .first()
    )
    if deployment is None or deployment.lifecycle_status == "decommissioned":
        raise ControlError(
            code="DEPLOYMENT_DECOMMISSIONED",
            message="Deployment is decommissioned or not found.",
            status_code=403,
        )
    return deployment


# ============================================================================
# License Issuance Helper
# ============================================================================


def issue_signed_license_for_deployment(
    db: Session,
    issuer: LicenseIssuer,
    deployment: ControlDeployment,
    actor_id: Optional[str] = None,
    validity_days: int = 30,
) -> Tuple[ControlLicense, SignedLicenseEnvelope]:
    if not deployment.subscription_id:
        raise ControlError(
            code="DEPLOYMENT_NO_SUBSCRIPTION",
            message="Deployment has no linked subscription to issue a license.",
            status_code=409,
        )
    sub = (
        db.query(ControlSubscription)
        .filter(ControlSubscription.id == deployment.subscription_id)
        .first()
    )
    if sub is None or sub.status in ("suspended", "expired", "cancelled"):
        raise ControlError(
            code="SUBSCRIPTION_INACTIVE",
            message="Subscription is not active; cannot issue or renew license.",
            status_code=403,
        )
    plan = db.query(ControlPlan).filter(ControlPlan.id == sub.plan_id).first()
    if plan is None:
        raise ControlError(
            code="PLAN_NOT_FOUND", message="Subscription plan not found.", status_code=404
        )

    # Mark previous active licenses as superseded
    prev_licenses = (
        db.query(ControlLicense)
        .filter(
            ControlLicense.deployment_id == deployment.id,
            ControlLicense.status == "active",
        )
        .all()
    )
    for pl in prev_licenses:
        pl.status = "superseded"

    max_seq = (
        db.query(func.max(ControlLicense.sequence))
        .filter(ControlLicense.deployment_id == deployment.id)
        .scalar()
        or 0
    )
    next_seq = int(max_seq) + 1
    now = datetime.now(timezone.utc)
    sub_ends = (
        sub.ends_at if sub.ends_at.tzinfo else sub.ends_at.replace(tzinfo=timezone.utc)
    )
    expires_at = min(now + timedelta(days=validity_days), sub_ends)
    if expires_at <= now:
        expires_at = now + timedelta(days=validity_days)

    grace_until = expires_at + timedelta(days=plan.offline_grace_days)

    max_stores = (
        sub.max_stores_override
        if sub.max_stores_override is not None
        else plan.default_max_stores
    )
    max_devices = (
        sub.max_devices_override
        if sub.max_devices_override is not None
        else plan.default_max_devices
    )
    features = (
        sub.features_override
        if sub.features_override is not None
        else plan.default_features
    )
    if not features:
        features = ["pos", "inventory", "reports"]

    license_id = str(uuid.uuid4())
    payload = LicensePayload(
        schema_version=1,
        license_id=license_id,
        customer_id=deployment.customer_id,
        deployment_id=deployment.id,
        organization_id=deployment.organization_id,
        edition=plan.edition,
        features=features,
        limits=LicenseLimits(max_stores=max_stores, max_devices=max_devices),
        sequence=next_seq,
        issued_at=format_rfc3339_utc(now),
        not_before=format_rfc3339_utc(now),
        expires_at=format_rfc3339_utc(expires_at),
        grace_policy_id="grace-standard-01",
        key_id=issuer.key_id,
    )
    envelope = issuer.sign(payload)

    lic_row = ControlLicense(
        id=license_id,
        deployment_id=deployment.id,
        subscription_id=sub.id,
        sequence=next_seq,
        status="active",
        signing_key_id=issuer.key_id,
        payload_json=envelope.model_dump(mode="json"),
        signature=envelope.signature_b64,
        issued_at=now,
        valid_from=now,
        expires_at=expires_at,
        offline_grace_until=grace_until,
        created_by=actor_id,
    )
    db.add(lic_row)
    db.flush()
    return lic_row, envelope


# ============================================================================
# Request Schemas
# ============================================================================


class AdminLoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: str
    password: str


class CreateCustomerRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    customer_code: str = Field(..., min_length=2, max_length=60)
    legal_name: str = Field(..., min_length=2, max_length=240)
    display_name: str = Field(..., min_length=2, max_length=200)
    tax_id: Optional[str] = None
    billing_email: Optional[str] = None
    technical_contact_email: Optional[str] = None


class CreatePlanRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    plan_code: str = Field(..., min_length=2, max_length=60)
    name: str = Field(..., min_length=2, max_length=160)
    deployment_type: Literal["cloud", "private", "both"] = "both"
    edition: str = "enterprise"
    default_max_stores: int = Field(default=3, ge=1)
    default_max_devices: int = Field(default=15, ge=1)
    default_features: List[str] = Field(
        default_factory=lambda: ["pos", "inventory", "reports"]
    )
    offline_grace_days: int = Field(default=7, ge=1)


class CreateSubscriptionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    customer_id: str
    plan_id: str
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    max_stores_override: Optional[int] = None
    max_devices_override: Optional[int] = None
    features_override: Optional[List[str]] = None
    auto_renew: bool = True


class UpdateSubscriptionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Optional[str] = None
    max_stores_override: Optional[int] = None
    max_devices_override: Optional[int] = None
    features_override: Optional[List[str]] = None


class CreateDeploymentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    customer_id: str
    subscription_id: str
    deployment_code: str = Field(..., min_length=2, max_length=80)
    deployment_mode: Literal["cloud", "private"] = "private"
    organization_id: str
    organization_name: str
    release_channel: Literal["stable", "beta", "pinned"] = "stable"
    public_url: Optional[str] = None


class UpdateDeploymentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    lifecycle_status: Optional[str] = None
    release_channel: Optional[str] = None
    subscription_id: Optional[str] = None


class RevokeLicenseRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reason: str = Field(..., min_length=3, max_length=500)


class CreateReleaseRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: str = Field(..., min_length=1, max_length=40)
    channel: Literal["stable", "beta", "security"] = "stable"
    min_upgrade_from_version: Optional[str] = None
    requires_db_migration: bool = False
    artifacts: Dict[str, Any]
    release_notes: Optional[str] = None


class EnrollmentInstanceMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid")

    instance_fingerprint: str = Field(..., min_length=4, max_length=255)
    hostname: Optional[str] = None
    os_info: Optional[str] = None
    container_runtime_version: Optional[str] = None
    app_version: Optional[str] = None


class EnrollmentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    deployment_id: str
    organization_id: str
    enrollment_token: str
    instance_metadata: EnrollmentInstanceMetadata


class HeartbeatMetricsPayload(BaseModel):
    """Strict allowlist of aggregate operational metrics (rejects PII/receipts)."""

    model_config = ConfigDict(extra="forbid")

    uptime_seconds: int = Field(default=0, ge=0)
    disk_free_bytes: int = Field(default=0, ge=0)
    backup_last_success_at: Optional[str] = None
    sync_backlog_count: int = Field(default=0, ge=0)


class HeartbeatRequest(BaseModel):
    """Privacy-safe heartbeat schema; `extra='forbid'` rejects any unapproved fields."""

    model_config = ConfigDict(extra="forbid")

    reported_at: datetime
    app_version: str = Field(..., min_length=1, max_length=40)
    db_migration_version: Optional[str] = None
    health_status: Literal["healthy", "degraded", "unhealthy"]
    active_store_count: int = Field(..., ge=0)
    active_device_count: int = Field(..., ge=0)
    active_user_count: int = Field(..., ge=0)
    license_id: Optional[str] = None
    license_sequence: Optional[int] = None
    metrics: HeartbeatMetricsPayload = Field(default_factory=HeartbeatMetricsPayload)


# ============================================================================
# Application Factory
# ============================================================================


def create_control_plane_app(
    settings: Optional[ControlPlaneSettings] = None,
    engine=None,
    create_tables: bool = True,
) -> FastAPI:
    cfg = settings or ControlPlaneSettings.from_env()
    eng = engine or build_control_engine(cfg.database_url)
    if create_tables:
        ControlBase.metadata.create_all(bind=eng)

    session_factory = sessionmaker(
        bind=eng, autocommit=False, autoflush=False, expire_on_commit=False
    )
    issuer = LicenseIssuer(
        key_id=cfg.signing_key_id, private_key_b64=cfg.signing_private_key_b64
    )

    app = FastAPI(title=cfg.app_name, version=cfg.app_version)
    app.state.settings = cfg
    app.state.engine = eng
    app.state.session_factory = session_factory
    app.state.license_issuer = issuer

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Bootstrap default Super-Admin user if none exists
    if create_tables:
        with session_factory() as db:
            existing_admin = db.query(ControlAdminUser).first()
            if existing_admin is None:
                db.add(
                    ControlAdminUser(
                        email="superadmin@pos-platform.local",
                        full_name="Platform Super Admin",
                        password_hash=hash_password("SuperAdmin@123456"),
                        role_code="platform_super_admin",
                        mfa_enabled=True,
                        status="active",
                    )
                )
                db.commit()

    @app.middleware("http")
    async def attach_request_id(request: Request, call_next):
        req_id = request.headers.get("X-Request-ID") or f"req_cp_{uuid.uuid4().hex[:14]}"
        request.state.request_id = req_id
        response = await call_next(request)
        response.headers["X-Request-ID"] = req_id
        return response

    @app.exception_handler(ControlError)
    async def handle_control_error(request: Request, exc: ControlError) -> JSONResponse:
        req_id = getattr(request.state, "request_id", "req_cp_unknown")
        return JSONResponse(
            status_code=exc.status_code,
            content=cp_err(exc.code, exc.message, req_id, exc.details),
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        req_id = getattr(request.state, "request_id", "req_cp_unknown")
        details = [
            {
                "field": ".".join(str(loc) for loc in err.get("loc", []) if loc != "body"),
                "reason": err.get("msg", "Invalid value"),
            }
            for err in exc.errors()
        ]
        return JSONResponse(
            status_code=422,
            content=cp_err(
                "VALIDATION_ERROR", "Control Plane payload validation failed.", req_id, details
            ),
        )

    @app.exception_handler(HTTPException)
    async def handle_http_exception(
        request: Request, exc: HTTPException
    ) -> JSONResponse:
        req_id = getattr(request.state, "request_id", "req_cp_unknown")
        return JSONResponse(
            status_code=exc.status_code,
            content=cp_err(f"HTTP_{exc.status_code}", f"{exc.detail}", req_id),
        )

    # ------------------------------------------------------------------------
    # Health & Public Key Discovery
    # ------------------------------------------------------------------------

    @app.get("/health/live", tags=["Health"])
    @app.get("/control/v1/health", tags=["Health"])
    def health_live(request_id: str = Depends(get_cp_request_id)) -> Dict[str, Any]:
        return cp_ok(
            {
                "status": "alive",
                "service": "cloud-control-plane",
                "signing_key_id": issuer.key_id,
                "signing_public_key_b64": issuer.public_key_b64,
            },
            request_id,
        )

    # ------------------------------------------------------------------------
    # Provider Super-Admin API (/control/admin/v1/*)
    # ------------------------------------------------------------------------

    @app.post("/control/admin/v1/auth/login", tags=["Provider Super-Admin"])
    def admin_login(
        body: AdminLoginRequest,
        db: Session = Depends(get_cp_db),
        settings: ControlPlaneSettings = Depends(get_cp_settings),
        request_id: str = Depends(get_cp_request_id),
    ) -> Dict[str, Any]:
        admin = (
            db.query(ControlAdminUser)
            .filter(ControlAdminUser.email == body.email.strip().lower())
            .first()
        )
        if admin is None or not verify_password(body.password, admin.password_hash):
            raise ControlError(
                code="INVALID_ADMIN_CREDENTIALS",
                message="Invalid Super-Admin email or password.",
                status_code=401,
            )
        if admin.status != "active":
            raise ControlError(
                code="ADMIN_ACCOUNT_LOCKED",
                message="Super-Admin account is disabled or locked.",
                status_code=403,
            )

        now = datetime.now(timezone.utc)
        admin.last_login_at = now
        token = jwt.encode(
            {
                "iss": settings.admin_jwt_issuer,
                "aud": settings.admin_jwt_audience,
                "sub": admin.id,
                "principal_type": "control_admin",
                "role": admin.role_code,
                "iat": int(now.timestamp()),
                "exp": int((now + timedelta(hours=8)).timestamp()),
            },
            settings.admin_jwt_secret,
            algorithm="HS256",
        )
        record_control_audit(
            db,
            actor_type="control_admin",
            actor_id=admin.id,
            action="control_admin.login",
            entity_type="control_admin_user",
            entity_id=admin.id,
            request_id=request_id,
        )
        db.commit()
        return cp_ok(
            {
                "access_token": token,
                "token_type": "Bearer",
                "admin": {
                    "id": admin.id,
                    "email": admin.email,
                    "full_name": admin.full_name,
                    "role_code": admin.role_code,
                },
            },
            request_id,
        )

    @app.get("/control/admin/v1/customers", tags=["Provider Super-Admin"])
    def list_customers(
        admin: ControlAdminUser = Depends(require_control_admin),
        db: Session = Depends(get_cp_db),
        request_id: str = Depends(get_cp_request_id),
    ) -> Dict[str, Any]:
        rows = db.query(ControlCustomer).order_by(ControlCustomer.created_at.desc()).all()
        return cp_ok(
            [
                {
                    "id": c.id,
                    "customer_code": c.customer_code,
                    "legal_name": c.legal_name,
                    "display_name": c.display_name,
                    "tax_id": c.tax_id,
                    "billing_email": c.billing_email,
                    "status": c.status,
                }
                for c in rows
            ],
            request_id,
        )

    @app.post(
        "/control/admin/v1/customers",
        status_code=status.HTTP_201_CREATED,
        tags=["Provider Super-Admin"],
    )
    def create_customer(
        body: CreateCustomerRequest,
        admin: ControlAdminUser = Depends(require_control_admin),
        db: Session = Depends(get_cp_db),
        request_id: str = Depends(get_cp_request_id),
    ) -> JSONResponse:
        cust = ControlCustomer(
            customer_code=body.customer_code.strip().upper(),
            legal_name=body.legal_name.strip(),
            display_name=body.display_name.strip(),
            tax_id=body.tax_id,
            billing_email=body.billing_email,
            technical_contact_email=body.technical_contact_email,
            status="active",
        )
        db.add(cust)
        db.flush()
        record_control_audit(
            db,
            actor_type="control_admin",
            actor_id=admin.id,
            action="customer.created",
            entity_type="control_customer",
            entity_id=cust.id,
            request_id=request_id,
        )
        db.commit()
        return JSONResponse(
            status_code=status.HTTP_201_CREATED,
            content=cp_ok(
                {
                    "id": cust.id,
                    "customer_code": cust.customer_code,
                    "legal_name": cust.legal_name,
                    "display_name": cust.display_name,
                    "status": cust.status,
                },
                request_id,
            ),
        )

    @app.get("/control/admin/v1/plans", tags=["Provider Super-Admin"])
    def list_plans(
        admin: ControlAdminUser = Depends(require_control_admin),
        db: Session = Depends(get_cp_db),
        request_id: str = Depends(get_cp_request_id),
    ) -> Dict[str, Any]:
        rows = db.query(ControlPlan).order_by(ControlPlan.created_at.desc()).all()
        return cp_ok(
            [
                {
                    "id": p.id,
                    "plan_code": p.plan_code,
                    "name": p.name,
                    "deployment_type": p.deployment_type,
                    "edition": p.edition,
                    "default_max_stores": p.default_max_stores,
                    "default_max_devices": p.default_max_devices,
                    "default_features": p.default_features,
                    "offline_grace_days": p.offline_grace_days,
                    "status": p.status,
                }
                for p in rows
            ],
            request_id,
        )

    @app.post(
        "/control/admin/v1/plans",
        status_code=status.HTTP_201_CREATED,
        tags=["Provider Super-Admin"],
    )
    def create_plan(
        body: CreatePlanRequest,
        admin: ControlAdminUser = Depends(require_control_admin),
        db: Session = Depends(get_cp_db),
        request_id: str = Depends(get_cp_request_id),
    ) -> JSONResponse:
        plan = ControlPlan(
            plan_code=body.plan_code.strip().upper(),
            name=body.name.strip(),
            deployment_type=body.deployment_type,
            edition=body.edition,
            default_max_stores=body.default_max_stores,
            default_max_devices=body.default_max_devices,
            default_features=body.default_features,
            offline_grace_days=body.offline_grace_days,
            status="active",
        )
        db.add(plan)
        db.commit()
        return JSONResponse(
            status_code=status.HTTP_201_CREATED,
            content=cp_ok(
                {
                    "id": plan.id,
                    "plan_code": plan.plan_code,
                    "name": plan.name,
                    "edition": plan.edition,
                    "default_max_stores": plan.default_max_stores,
                    "default_max_devices": plan.default_max_devices,
                    "default_features": plan.default_features,
                },
                request_id,
            ),
        )

    @app.get("/control/admin/v1/subscriptions", tags=["Provider Super-Admin"])
    def list_subscriptions(
        admin: ControlAdminUser = Depends(require_control_admin),
        db: Session = Depends(get_cp_db),
        request_id: str = Depends(get_cp_request_id),
    ) -> Dict[str, Any]:
        rows = (
            db.query(ControlSubscription)
            .order_by(ControlSubscription.created_at.desc())
            .all()
        )
        return cp_ok(
            [
                {
                    "id": s.id,
                    "customer_id": s.customer_id,
                    "plan_id": s.plan_id,
                    "status": s.status,
                    "starts_at": s.starts_at.isoformat(),
                    "ends_at": s.ends_at.isoformat(),
                    "max_stores_override": s.max_stores_override,
                    "max_devices_override": s.max_devices_override,
                    "features_override": s.features_override,
                }
                for s in rows
            ],
            request_id,
        )

    @app.post(
        "/control/admin/v1/subscriptions",
        status_code=status.HTTP_201_CREATED,
        tags=["Provider Super-Admin"],
    )
    def create_subscription(
        body: CreateSubscriptionRequest,
        admin: ControlAdminUser = Depends(require_control_admin),
        db: Session = Depends(get_cp_db),
        request_id: str = Depends(get_cp_request_id),
    ) -> JSONResponse:
        now = datetime.now(timezone.utc)
        starts_at = body.starts_at or now
        ends_at = body.ends_at or (starts_at + timedelta(days=365))
        sub = ControlSubscription(
            customer_id=body.customer_id,
            plan_id=body.plan_id,
            status="active",
            starts_at=starts_at,
            ends_at=ends_at,
            max_stores_override=body.max_stores_override,
            max_devices_override=body.max_devices_override,
            features_override=body.features_override,
            auto_renew=body.auto_renew,
        )
        db.add(sub)
        db.commit()
        return JSONResponse(
            status_code=status.HTTP_201_CREATED,
            content=cp_ok(
                {
                    "id": sub.id,
                    "customer_id": sub.customer_id,
                    "plan_id": sub.plan_id,
                    "status": sub.status,
                    "starts_at": sub.starts_at.isoformat(),
                    "ends_at": sub.ends_at.isoformat(),
                },
                request_id,
            ),
        )

    @app.patch(
        "/control/admin/v1/subscriptions/{sub_id}", tags=["Provider Super-Admin"]
    )
    def update_subscription(
        sub_id: str,
        body: UpdateSubscriptionRequest,
        admin: ControlAdminUser = Depends(require_control_admin),
        db: Session = Depends(get_cp_db),
        request_id: str = Depends(get_cp_request_id),
    ) -> Dict[str, Any]:
        sub = (
            db.query(ControlSubscription)
            .filter(ControlSubscription.id == sub_id)
            .first()
        )
        if sub is None:
            raise ControlError(
                code="SUBSCRIPTION_NOT_FOUND",
                message="Subscription not found.",
                status_code=404,
            )
        if body.status is not None:
            sub.status = body.status
        if body.max_stores_override is not None:
            sub.max_stores_override = body.max_stores_override
        if body.max_devices_override is not None:
            sub.max_devices_override = body.max_devices_override
        if body.features_override is not None:
            sub.features_override = body.features_override
        db.commit()
        return cp_ok(
            {
                "id": sub.id,
                "status": sub.status,
                "max_stores_override": sub.max_stores_override,
                "max_devices_override": sub.max_devices_override,
                "features_override": sub.features_override,
            },
            request_id,
        )

    @app.get("/control/admin/v1/deployments", tags=["Provider Super-Admin"])
    def list_deployments(
        admin: ControlAdminUser = Depends(require_control_admin),
        db: Session = Depends(get_cp_db),
        request_id: str = Depends(get_cp_request_id),
    ) -> Dict[str, Any]:
        rows = (
            db.query(ControlDeployment)
            .order_by(ControlDeployment.created_at.desc())
            .all()
        )
        return cp_ok(
            [
                {
                    "id": d.id,
                    "customer_id": d.customer_id,
                    "subscription_id": d.subscription_id,
                    "deployment_code": d.deployment_code,
                    "deployment_mode": d.deployment_mode,
                    "organization_id": d.organization_id,
                    "organization_name": d.organization_name,
                    "lifecycle_status": d.lifecycle_status,
                    "connectivity_state": compute_connectivity_state(
                        d.last_heartbeat_at
                    ),
                    "release_channel": d.release_channel,
                    "reported_version": d.reported_version,
                    "last_heartbeat_at": (
                        d.last_heartbeat_at.isoformat() if d.last_heartbeat_at else None
                    ),
                }
                for d in rows
            ],
            request_id,
        )

    @app.post(
        "/control/admin/v1/deployments",
        status_code=status.HTTP_201_CREATED,
        tags=["Provider Super-Admin"],
    )
    def create_deployment(
        body: CreateDeploymentRequest,
        admin: ControlAdminUser = Depends(require_control_admin),
        db: Session = Depends(get_cp_db),
        request_id: str = Depends(get_cp_request_id),
    ) -> JSONResponse:
        dep = ControlDeployment(
            customer_id=body.customer_id,
            subscription_id=body.subscription_id,
            deployment_code=body.deployment_code.strip().upper(),
            deployment_mode=body.deployment_mode,
            organization_id=body.organization_id,
            organization_name=body.organization_name.strip(),
            lifecycle_status=(
                "pending_enrollment" if body.deployment_mode == "private" else "active"
            ),
            release_channel=body.release_channel,
            public_url=body.public_url,
        )
        db.add(dep)
        db.flush()
        record_control_audit(
            db,
            actor_type="control_admin",
            actor_id=admin.id,
            deployment_id=dep.id,
            action="deployment.created",
            entity_type="control_deployment",
            entity_id=dep.id,
            request_id=request_id,
        )
        db.commit()
        return JSONResponse(
            status_code=status.HTTP_201_CREATED,
            content=cp_ok(
                {
                    "id": dep.id,
                    "deployment_code": dep.deployment_code,
                    "deployment_mode": dep.deployment_mode,
                    "organization_id": dep.organization_id,
                    "organization_name": dep.organization_name,
                    "lifecycle_status": dep.lifecycle_status,
                },
                request_id,
            ),
        )

    @app.get(
        "/control/admin/v1/deployments/{deployment_id}",
        tags=["Provider Super-Admin"],
    )
    def get_deployment(
        deployment_id: str,
        admin: ControlAdminUser = Depends(require_control_admin),
        db: Session = Depends(get_cp_db),
        request_id: str = Depends(get_cp_request_id),
    ) -> Dict[str, Any]:
        d = (
            db.query(ControlDeployment)
            .filter(ControlDeployment.id == deployment_id)
            .first()
        )
        if d is None:
            raise ControlError(
                code="DEPLOYMENT_NOT_FOUND",
                message="Deployment not found.",
                status_code=404,
            )
        return cp_ok(
            {
                "id": d.id,
                "customer_id": d.customer_id,
                "subscription_id": d.subscription_id,
                "deployment_code": d.deployment_code,
                "deployment_mode": d.deployment_mode,
                "organization_id": d.organization_id,
                "organization_name": d.organization_name,
                "lifecycle_status": d.lifecycle_status,
                "connectivity_state": compute_connectivity_state(d.last_heartbeat_at),
                "release_channel": d.release_channel,
                "reported_version": d.reported_version,
                "last_heartbeat_at": (
                    d.last_heartbeat_at.isoformat() if d.last_heartbeat_at else None
                ),
            },
            request_id,
        )

    @app.post(
        "/control/admin/v1/deployments/{deployment_id}/enrollment-authorizations",
        status_code=status.HTTP_201_CREATED,
        tags=["Provider Super-Admin"],
    )
    def create_enrollment_authorization(
        deployment_id: str,
        admin: ControlAdminUser = Depends(require_control_admin),
        db: Session = Depends(get_cp_db),
        request_id: str = Depends(get_cp_request_id),
    ) -> JSONResponse:
        dep = (
            db.query(ControlDeployment)
            .filter(ControlDeployment.id == deployment_id)
            .first()
        )
        if dep is None:
            raise ControlError(
                code="DEPLOYMENT_NOT_FOUND",
                message="Deployment not found.",
                status_code=404,
            )
        raw_token = f"cp_enroll_{secrets.token_urlsafe(24)}"
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=30)
        auth_row = ControlEnrollmentAuthorization(
            deployment_id=dep.id,
            token_hash=sha256_hex(raw_token),
            expires_at=expires_at,
            created_by=admin.id,
        )
        db.add(auth_row)
        record_control_audit(
            db,
            actor_type="control_admin",
            actor_id=admin.id,
            deployment_id=dep.id,
            action="deployment.enrollment_token_issued",
            entity_type="control_enrollment_authorization",
            entity_id=auth_row.id,
            request_id=request_id,
        )
        db.commit()
        return JSONResponse(
            status_code=status.HTTP_201_CREATED,
            content=cp_ok(
                {
                    "enrollment_authorization_id": auth_row.id,
                    "deployment_id": dep.id,
                    "enrollment_token": raw_token,
                    "expires_at": expires_at.isoformat(),
                },
                request_id,
            ),
        )

    @app.post(
        "/control/admin/v1/deployments/{deployment_id}/licenses",
        status_code=status.HTTP_201_CREATED,
        tags=["Provider Super-Admin"],
    )
    def admin_issue_license(
        deployment_id: str,
        admin: ControlAdminUser = Depends(require_control_admin),
        db: Session = Depends(get_cp_db),
        issuer_svc: LicenseIssuer = Depends(get_cp_issuer),
        request_id: str = Depends(get_cp_request_id),
    ) -> JSONResponse:
        dep = (
            db.query(ControlDeployment)
            .filter(ControlDeployment.id == deployment_id)
            .first()
        )
        if dep is None:
            raise ControlError(
                code="DEPLOYMENT_NOT_FOUND",
                message="Deployment not found.",
                status_code=404,
            )
        lic_row, envelope = issue_signed_license_for_deployment(
            db=db, issuer=issuer_svc, deployment=dep, actor_id=admin.id
        )
        record_control_audit(
            db,
            actor_type="control_admin",
            actor_id=admin.id,
            deployment_id=dep.id,
            action="license.issued",
            entity_type="control_license",
            entity_id=lic_row.id,
            request_id=request_id,
            metadata={"sequence": lic_row.sequence},
        )
        db.commit()
        return JSONResponse(
            status_code=status.HTTP_201_CREATED,
            content=cp_ok(
                {
                    "license_id": lic_row.id,
                    "sequence": lic_row.sequence,
                    "license_envelope": envelope.model_dump(mode="json"),
                },
                request_id,
            ),
        )

    @app.post(
        "/control/admin/v1/licenses/{license_id}/revoke",
        tags=["Provider Super-Admin"],
    )
    def admin_revoke_license(
        license_id: str,
        body: RevokeLicenseRequest,
        admin: ControlAdminUser = Depends(require_control_admin),
        db: Session = Depends(get_cp_db),
        request_id: str = Depends(get_cp_request_id),
    ) -> Dict[str, Any]:
        lic = (
            db.query(ControlLicense).filter(ControlLicense.id == license_id).first()
        )
        if lic is None:
            raise ControlError(
                code="LICENSE_NOT_FOUND",
                message="License not found.",
                status_code=404,
            )
        lic.status = "revoked"
        existing_rev = (
            db.query(ControlLicenseRevocation)
            .filter(ControlLicenseRevocation.license_id == lic.id)
            .first()
        )
        if existing_rev is None:
            rev = ControlLicenseRevocation(
                license_id=lic.id,
                deployment_id=lic.deployment_id,
                reason=body.reason.strip(),
                revoked_by=admin.id,
            )
            db.add(rev)

        dep = (
            db.query(ControlDeployment)
            .filter(ControlDeployment.id == lic.deployment_id)
            .first()
        )
        if dep is not None:
            dep.lifecycle_status = "suspended"

        record_control_audit(
            db,
            actor_type="control_admin",
            actor_id=admin.id,
            deployment_id=lic.deployment_id,
            action="license.revoked",
            entity_type="control_license",
            entity_id=lic.id,
            request_id=request_id,
            metadata={"reason": body.reason},
        )
        db.commit()
        return cp_ok(
            {
                "license_id": lic.id,
                "deployment_id": lic.deployment_id,
                "status": lic.status,
            },
            request_id,
        )

    @app.get("/control/admin/v1/releases", tags=["Provider Super-Admin"])
    def admin_list_releases(
        admin: ControlAdminUser = Depends(require_control_admin),
        db: Session = Depends(get_cp_db),
        request_id: str = Depends(get_cp_request_id),
    ) -> Dict[str, Any]:
        rows = (
            db.query(ControlRelease)
            .order_by(ControlRelease.published_at.desc())
            .all()
        )
        return cp_ok(
            [
                {
                    "id": r.id,
                    "version": r.version,
                    "channel": r.channel,
                    "status": r.status,
                    "min_upgrade_from_version": r.min_upgrade_from_version,
                    "requires_db_migration": r.requires_db_migration,
                    "artifacts": r.artifacts,
                    "published_at": r.published_at.isoformat(),
                }
                for r in rows
            ],
            request_id,
        )

    @app.post(
        "/control/admin/v1/releases",
        status_code=status.HTTP_201_CREATED,
        tags=["Provider Super-Admin"],
    )
    def admin_create_release(
        body: CreateReleaseRequest,
        admin: ControlAdminUser = Depends(require_control_admin),
        db: Session = Depends(get_cp_db),
        request_id: str = Depends(get_cp_request_id),
    ) -> JSONResponse:
        rel = ControlRelease(
            version=body.version.strip(),
            channel=body.channel,
            status="published",
            min_upgrade_from_version=body.min_upgrade_from_version,
            requires_db_migration=body.requires_db_migration,
            artifacts=body.artifacts,
            release_notes=body.release_notes,
        )
        db.add(rel)
        db.commit()
        return JSONResponse(
            status_code=status.HTTP_201_CREATED,
            content=cp_ok(
                {
                    "id": rel.id,
                    "version": rel.version,
                    "channel": rel.channel,
                    "status": rel.status,
                    "artifacts": rel.artifacts,
                },
                request_id,
            ),
        )

    @app.get("/control/admin/v1/audit-logs", tags=["Provider Super-Admin"])
    def admin_list_audit_logs(
        admin: ControlAdminUser = Depends(require_control_admin),
        db: Session = Depends(get_cp_db),
        request_id: str = Depends(get_cp_request_id),
    ) -> Dict[str, Any]:
        rows = (
            db.query(ControlAuditLog)
            .order_by(ControlAuditLog.occurred_at.desc())
            .limit(100)
            .all()
        )
        return cp_ok(
            [
                {
                    "id": a.id,
                    "actor_type": a.actor_type,
                    "actor_id": a.actor_id,
                    "deployment_id": a.deployment_id,
                    "action": a.action,
                    "entity_type": a.entity_type,
                    "entity_id": a.entity_id,
                    "metadata": a.audit_metadata,
                    "occurred_at": a.occurred_at.isoformat(),
                }
                for a in rows
            ],
            request_id,
        )

    # ------------------------------------------------------------------------
    # Machine API (/control/v1/*)
    # ------------------------------------------------------------------------

    @app.post(
        "/control/v1/enrollments",
        status_code=status.HTTP_201_CREATED,
        tags=["Deployment Machine API"],
    )
    def enroll_deployment(
        body: EnrollmentRequest,
        db: Session = Depends(get_cp_db),
        issuer_svc: LicenseIssuer = Depends(get_cp_issuer),
        request_id: str = Depends(get_cp_request_id),
    ) -> JSONResponse:
        dep = (
            db.query(ControlDeployment)
            .filter(ControlDeployment.id == body.deployment_id)
            .first()
        )
        if dep is None or dep.organization_id != body.organization_id:
            raise ControlError(
                code="DEPLOYMENT_IDENTITY_MISMATCH",
                message="Deployment ID or Organization ID does not match Control Plane record.",
                status_code=404,
            )

        token_hash = sha256_hex(body.enrollment_token.strip())
        auth_row = (
            db.query(ControlEnrollmentAuthorization)
            .filter(
                ControlEnrollmentAuthorization.deployment_id == dep.id,
                ControlEnrollmentAuthorization.token_hash == token_hash,
            )
            .first()
        )
        now = datetime.now(timezone.utc)
        if auth_row is None:
            raise ControlError(
                code="INVALID_ENROLLMENT_TOKEN",
                message="Enrollment token is invalid.",
                status_code=401,
            )
        if auth_row.consumed_at is not None:
            raise ControlError(
                code="ENROLLMENT_TOKEN_CONSUMED",
                message="One-time enrollment token has already been used.",
                status_code=409,
            )
        exp = (
            auth_row.expires_at
            if auth_row.expires_at.tzinfo
            else auth_row.expires_at.replace(tzinfo=timezone.utc)
        )
        if exp <= now:
            raise ControlError(
                code="ENROLLMENT_TOKEN_EXPIRED",
                message="Enrollment token has expired.",
                status_code=401,
            )

        auth_row.consumed_at = now
        dep.lifecycle_status = "active"
        dep.reported_version = body.instance_metadata.app_version
        dep.last_heartbeat_at = now

        instance = ControlDeploymentInstance(
            deployment_id=dep.id,
            instance_fingerprint=body.instance_metadata.instance_fingerprint,
            hostname=body.instance_metadata.hostname,
            os_info=body.instance_metadata.os_info,
            container_runtime_version=body.instance_metadata.container_runtime_version,
            enrolled_at=now,
            last_seen_at=now,
            status="active",
        )
        db.add(instance)

        raw_cred = f"cp_dep_live_{secrets.token_urlsafe(32)}"
        cred_expires = now + timedelta(days=365)
        cred_row = ControlDeploymentCredential(
            deployment_id=dep.id,
            credential_hash=sha256_hex(raw_cred),
            issued_at=now,
            expires_at=cred_expires,
        )
        db.add(cred_row)

        lic_row, envelope = issue_signed_license_for_deployment(
            db=db, issuer=issuer_svc, deployment=dep, actor_id="enrollment"
        )

        record_control_audit(
            db,
            actor_type="deployment",
            actor_id=dep.id,
            deployment_id=dep.id,
            action="deployment.enrolled",
            entity_type="control_deployment",
            entity_id=dep.id,
            request_id=request_id,
            metadata={
                "instance_fingerprint": body.instance_metadata.instance_fingerprint,
                "license_id": lic_row.id,
            },
        )
        db.commit()

        return JSONResponse(
            status_code=status.HTTP_201_CREATED,
            content=cp_ok(
                {
                    "deployment_id": dep.id,
                    "organization_id": dep.organization_id,
                    "lifecycle_status": dep.lifecycle_status,
                    "deployment_credential": {
                        "credential_id": cred_row.id,
                        "token": raw_cred,
                        "expires_at": cred_expires.isoformat(),
                    },
                    "license_envelope": envelope.model_dump(mode="json"),
                    "trusted_public_keys": {
                        issuer_svc.key_id: issuer_svc.public_key_b64
                    },
                },
                request_id,
            ),
        )

    @app.get("/control/v1/deployments/me", tags=["Deployment Machine API"])
    def get_my_deployment(
        dep: ControlDeployment = Depends(require_deployment_credential),
        request_id: str = Depends(get_cp_request_id),
    ) -> Dict[str, Any]:
        return cp_ok(
            {
                "id": dep.id,
                "deployment_code": dep.deployment_code,
                "deployment_mode": dep.deployment_mode,
                "organization_id": dep.organization_id,
                "organization_name": dep.organization_name,
                "lifecycle_status": dep.lifecycle_status,
                "release_channel": dep.release_channel,
                "connectivity_state": compute_connectivity_state(dep.last_heartbeat_at),
            },
            request_id,
        )

    @app.post("/control/v1/deployments/me/heartbeat", tags=["Deployment Machine API"])
    def submit_heartbeat(
        body: HeartbeatRequest,
        dep: ControlDeployment = Depends(require_deployment_credential),
        db: Session = Depends(get_cp_db),
        request_id: str = Depends(get_cp_request_id),
    ) -> Dict[str, Any]:
        now = datetime.now(timezone.utc)
        hb = ControlHeartbeat(
            deployment_id=dep.id,
            reported_at=body.reported_at,
            received_at=now,
            app_version=body.app_version,
            db_migration_version=body.db_migration_version,
            health_status=body.health_status,
            active_store_count=body.active_store_count,
            active_device_count=body.active_device_count,
            active_user_count=body.active_user_count,
            license_id=body.license_id,
            license_sequence=body.license_sequence,
            metrics=body.metrics.model_dump(mode="json"),
        )
        db.add(hb)

        dep.last_heartbeat_at = now
        dep.reported_version = body.app_version

        latest_lic = (
            db.query(ControlLicense)
            .filter(
                ControlLicense.deployment_id == dep.id,
                ControlLicense.status == "active",
            )
            .order_by(ControlLicense.sequence.desc())
            .first()
        )
        latest_rel = (
            db.query(ControlRelease)
            .filter(
                ControlRelease.channel == dep.release_channel,
                ControlRelease.status == "published",
            )
            .order_by(ControlRelease.published_at.desc())
            .first()
        )

        actions_required: List[str] = []
        if latest_lic and (
            body.license_sequence is None or body.license_sequence < latest_lic.sequence
        ):
            actions_required.append("refresh_license")

        revoked_check = (
            db.query(ControlLicenseRevocation)
            .filter(ControlLicenseRevocation.deployment_id == dep.id)
            .first()
        )
        if revoked_check is not None:
            actions_required.append("license_revoked")

        db.commit()
        return cp_ok(
            {
                "received_at": now.isoformat(),
                "deployment_lifecycle_status": dep.lifecycle_status,
                "connectivity_state": "online",
                "next_heartbeat_seconds": 300,
                "latest_license_sequence": latest_lic.sequence if latest_lic else 0,
                "latest_available_version": (
                    latest_rel.version if latest_rel else dep.reported_version
                ),
                "actions_required": actions_required,
            },
            request_id,
        )

    @app.get("/control/v1/deployments/me/license", tags=["Deployment Machine API"])
    def get_my_license(
        dep: ControlDeployment = Depends(require_deployment_credential),
        db: Session = Depends(get_cp_db),
        request_id: str = Depends(get_cp_request_id),
    ) -> Dict[str, Any]:
        lic = (
            db.query(ControlLicense)
            .filter(ControlLicense.deployment_id == dep.id)
            .order_by(ControlLicense.sequence.desc())
            .first()
        )
        if lic is None:
            raise ControlError(
                code="LICENSE_NOT_FOUND",
                message="No license has been issued for this deployment.",
                status_code=404,
            )
        if lic.status == "revoked":
            raise ControlError(
                code="LICENSE_REVOKED",
                message="The active license for this deployment has been revoked.",
                status_code=403,
            )
        return cp_ok(
            {
                "license_id": lic.id,
                "sequence": lic.sequence,
                "status": lic.status,
                "license_envelope": lic.payload_json,
            },
            request_id,
        )

    @app.post(
        "/control/v1/deployments/me/license/renew", tags=["Deployment Machine API"]
    )
    def renew_my_license(
        dep: ControlDeployment = Depends(require_deployment_credential),
        db: Session = Depends(get_cp_db),
        issuer_svc: LicenseIssuer = Depends(get_cp_issuer),
        request_id: str = Depends(get_cp_request_id),
    ) -> Dict[str, Any]:
        lic_row, envelope = issue_signed_license_for_deployment(
            db=db, issuer=issuer_svc, deployment=dep, actor_id=dep.id
        )
        record_control_audit(
            db,
            actor_type="deployment",
            actor_id=dep.id,
            deployment_id=dep.id,
            action="license.renewed",
            entity_type="control_license",
            entity_id=lic_row.id,
            request_id=request_id,
            metadata={"sequence": lic_row.sequence},
        )
        db.commit()
        return cp_ok(
            {
                "license_id": lic_row.id,
                "sequence": lic_row.sequence,
                "status": lic_row.status,
                "license_envelope": envelope.model_dump(mode="json"),
            },
            request_id,
        )

    @app.get("/control/v1/deployments/me/releases", tags=["Deployment Machine API"])
    def get_my_releases(
        dep: ControlDeployment = Depends(require_deployment_credential),
        db: Session = Depends(get_cp_db),
        request_id: str = Depends(get_cp_request_id),
    ) -> Dict[str, Any]:
        rows = (
            db.query(ControlRelease)
            .filter(
                ControlRelease.channel == dep.release_channel,
                ControlRelease.status == "published",
            )
            .order_by(ControlRelease.published_at.desc())
            .all()
        )
        return cp_ok(
            [
                {
                    "version": r.version,
                    "channel": r.channel,
                    "min_upgrade_from_version": r.min_upgrade_from_version,
                    "requires_db_migration": r.requires_db_migration,
                    "artifacts": r.artifacts,
                    "published_at": r.published_at.isoformat(),
                }
                for r in rows
            ],
            request_id,
        )

    @app.post(
        "/control/v1/deployments/me/credentials/rotate",
        tags=["Deployment Machine API"],
    )
    def rotate_my_credential(
        dep: ControlDeployment = Depends(require_deployment_credential),
        db: Session = Depends(get_cp_db),
        request_id: str = Depends(get_cp_request_id),
    ) -> Dict[str, Any]:
        now = datetime.now(timezone.utc)
        old_creds = (
            db.query(ControlDeploymentCredential)
            .filter(
                ControlDeploymentCredential.deployment_id == dep.id,
                ControlDeploymentCredential.revoked_at.is_(None),
            )
            .all()
        )
        for oc in old_creds:
            oc.revoked_at = now
            oc.revoke_reason = "rotated"

        raw_cred = f"cp_dep_live_{secrets.token_urlsafe(32)}"
        cred_expires = now + timedelta(days=365)
        new_cred = ControlDeploymentCredential(
            deployment_id=dep.id,
            credential_hash=sha256_hex(raw_cred),
            issued_at=now,
            expires_at=cred_expires,
        )
        db.add(new_cred)
        record_control_audit(
            db,
            actor_type="deployment",
            actor_id=dep.id,
            deployment_id=dep.id,
            action="deployment.credential_rotated",
            entity_type="control_deployment_credential",
            entity_id=new_cred.id,
            request_id=request_id,
        )
        db.commit()
        return cp_ok(
            {
                "credential_id": new_cred.id,
                "token": raw_cred,
                "expires_at": cred_expires.isoformat(),
            },
            request_id,
        )

    @app.post(
        "/control/v1/deployments/me/decommission", tags=["Deployment Machine API"]
    )
    def decommission_my_deployment(
        dep: ControlDeployment = Depends(require_deployment_credential),
        db: Session = Depends(get_cp_db),
        request_id: str = Depends(get_cp_request_id),
    ) -> Dict[str, Any]:
        now = datetime.now(timezone.utc)
        dep.lifecycle_status = "decommissioned"
        creds = (
            db.query(ControlDeploymentCredential)
            .filter(
                ControlDeploymentCredential.deployment_id == dep.id,
                ControlDeploymentCredential.revoked_at.is_(None),
            )
            .all()
        )
        for c in creds:
            c.revoked_at = now
            c.revoke_reason = "decommissioned"

        lics = (
            db.query(ControlLicense)
            .filter(
                ControlLicense.deployment_id == dep.id,
                ControlLicense.status == "active",
            )
            .all()
        )
        for l_row in lics:
            l_row.status = "revoked"

        record_control_audit(
            db,
            actor_type="deployment",
            actor_id=dep.id,
            deployment_id=dep.id,
            action="deployment.decommissioned",
            entity_type="control_deployment",
            entity_id=dep.id,
            request_id=request_id,
        )
        db.commit()
        return cp_ok(
            {
                "deployment_id": dep.id,
                "lifecycle_status": dep.lifecycle_status,
                "decommissioned_at": now.isoformat(),
            },
            request_id,
        )

    return app


app = create_control_plane_app()

