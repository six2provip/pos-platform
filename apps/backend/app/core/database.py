"""Database engine, session management, and PostgreSQL RLS tenant context binding.

Reference:
- ADR-006: PostgreSQL as Primary Database
- docs/02-database-schema.md (Section 10.3)
- docs/07-security-and-licensing.md (Section 7.4)
"""

from __future__ import annotations

import importlib.util
from typing import Generator
from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


class Base(DeclarativeBase):
    """Declarative base for all Business Data Plane ORM models."""


def build_engine(database_url: str):
    """Create a SQLAlchemy 2.x engine for PostgreSQL or SQLite (in-memory/file test harness)."""
    effective_url = database_url
    if effective_url.startswith("postgresql"):
        if importlib.util.find_spec("psycopg2") is None:
            effective_url = "sqlite:///./pos_business_dev.db"

    connect_args = {}
    if effective_url.startswith("sqlite"):
        connect_args["check_same_thread"] = False

    engine = create_engine(
        effective_url,
        pool_pre_ping=True,
        future=True,
        connect_args=connect_args,
    )

    if effective_url.startswith("sqlite"):
        @event.listens_for(engine, "connect")
        def _set_sqlite_pragma(dbapi_connection, connection_record):  # type: ignore[no-untyped-def]
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    return engine


def set_rls_tenant_context(session: Session, organization_id: str) -> None:
    """Bind the transaction-local tenant context (`app.organization_id`) for PostgreSQL RLS.

    Uses `set_config('app.organization_id', :org_id, true)` which is transaction-local
    (`is_local = true`), preventing connection-pool leakage across requests.
    """
    dialect = session.bind.dialect.name if session.bind is not None else ""
    if dialect == "postgresql":
        session.execute(
            text("SELECT set_config('app.organization_id', :org_id, true)"),
            {"org_id": str(organization_id)},
        )
