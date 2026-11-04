"""Business Data Plane FastAPI application entrypoint."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.orm import sessionmaker

from app.api.deps import get_request_id, get_settings
from app.api.v1.router import api_v1_router
from app.core.config import Settings
from app.core.database import Base, build_engine
from app.core.envelope import error_response, ok_response
from app.core.exceptions import AppError
from app.infrastructure.models import Organization
from app.modules.organizations.service import provision_organization


def create_app(
    settings: Optional[Settings] = None,
    engine=None,
    create_tables: bool = True,
) -> FastAPI:
    import os

    effective_settings = settings or Settings.from_env()
    effective_engine = engine or build_engine(effective_settings.database_url)
    if create_tables:
        Base.metadata.create_all(bind=effective_engine)

    session_factory = sessionmaker(
        bind=effective_engine, autocommit=False, autoflush=False, expire_on_commit=False
    )

    if create_tables and os.getenv("AUTO_SEED_DEMO", "false").lower() == "true":
        with session_factory() as seed_db:
            existing_demo = (
                seed_db.query(Organization)
                .filter(Organization.code == "DEMO")
                .first()
            )
            if existing_demo is None:
                try:
                    provision_organization(
                        seed_db,
                        effective_settings,
                        code="DEMO",
                        name="Demo Retail Chain Vietnam",
                        admin_email="admin@demo.vn",
                        admin_password="Admin@123456",
                        admin_display_name="Quản trị viên Hệ thống",
                        initial_store_code="DEMO-S1",
                        initial_store_name="Chi nhánh Quận 1 - Nguyễn Huệ",
                    )
                    seed_db.commit()
                except Exception:
                    seed_db.rollback()

    app = FastAPI(
        title=effective_settings.app_name,
        version=effective_settings.app_version,
        docs_url="/docs",
        openapi_url="/openapi.json",
    )
    app.state.settings = effective_settings
    app.state.engine = effective_engine
    app.state.session_factory = session_factory

    app.add_middleware(
        CORSMiddleware,
        allow_origins=effective_settings.cors_allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def attach_request_id(request: Request, call_next):
        req_id = request.headers.get("X-Request-ID") or f"req_{uuid.uuid4().hex[:16]}"
        request.state.request_id = req_id
        response = await call_next(request)
        response.headers["X-Request-ID"] = req_id
        return response

    @app.exception_handler(AppError)
    async def handle_app_error(request: Request, exc: AppError) -> JSONResponse:
        req_id = getattr(request.state, "request_id", "req_unknown")
        return JSONResponse(
            status_code=exc.status_code,
            content=error_response(
                code=exc.code,
                message=exc.message,
                request_id=req_id,
                details=exc.details,
            ),
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        req_id = getattr(request.state, "request_id", "req_unknown")
        details = [
            {
                "field": ".".join(
                    str(loc) for loc in err.get("loc", []) if loc != "body"
                ),
                "reason": err.get("msg", "Invalid value"),
            }
            for err in exc.errors()
        ]
        return JSONResponse(
            status_code=422,
            content=error_response(
                code="VALIDATION_ERROR",
                message="Request validation failed.",
                request_id=req_id,
                details=details,
            ),
        )

    @app.exception_handler(HTTPException)
    async def handle_http_exception(
        request: Request, exc: HTTPException
    ) -> JSONResponse:
        req_id = getattr(request.state, "request_id", "req_unknown")
        return JSONResponse(
            status_code=exc.status_code,
            content=error_response(
                code=f"HTTP_{exc.status_code}",
                message=str(exc.detail),
                request_id=req_id,
            ),
        )

    @app.get("/health/live", tags=["Health"])
    @app.get("/api/v1/health/live", tags=["Health"])
    def health_live(
        cfg: Settings = Depends(get_settings),
        request_id: str = Depends(get_request_id),
    ) -> Dict[str, Any]:
        return ok_response(
            {
                "status": "alive",
                "deployment_mode": cfg.deployment_mode,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
            request_id=request_id,
        )

    @app.get("/health/ready", tags=["Health"])
    @app.get("/api/v1/health/ready", tags=["Health"])
    def health_ready(
        request: Request,
        cfg: Settings = Depends(get_settings),
        request_id: str = Depends(get_request_id),
    ) -> Dict[str, Any]:
        factory = request.app.state.session_factory
        with factory() as session:
            session.execute(text("SELECT 1"))
        return ok_response(
            {
                "status": "ready",
                "database": "connected",
                "deployment_mode": cfg.deployment_mode,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
            request_id=request_id,
        )

    app.include_router(api_v1_router)
    return app


app = create_app()
