"""Global permission catalogue and default system role definitions.

Reference:
- docs/02-database-schema.md (Section 7.2, 16.1)
- docs/03-api-specification.md (Section 6.3)
"""

from __future__ import annotations

from typing import Dict, List, Tuple
from sqlalchemy.orm import Session

from app.infrastructure.models import Permission, Role, RolePermission

# (code, module, description)
GLOBAL_PERMISSIONS: List[Tuple[str, str, str]] = [
    ("organization.read", "organization", "Read organization profile and settings"),
    ("organization.update", "organization", "Update organization profile and settings"),
    ("stores.read", "stores", "View stores and store settings"),
    ("stores.create", "stores", "Create new stores"),
    ("stores.update", "stores", "Update store profile and settings"),
    ("stores.disable", "stores", "Deactivate stores"),
    ("users.read", "users", "View users and memberships"),
    ("users.create", "users", "Create and invite users"),
    ("users.update", "users", "Update user profiles"),
    ("users.disable", "users", "Disable or lock user accounts"),
    ("users.password.change", "users", "Change user password"),
    ("roles.read", "roles", "View roles and permission catalogue"),
    ("roles.update", "roles", "Create and update roles and role permissions"),
    ("roles.assign", "roles", "Assign and remove roles from users"),
    ("products.read", "products", "Read categories, products, variants, and barcodes"),
    ("products.create", "products", "Create categories and products"),
    ("products.update", "products", "Update categories, products, variants, and barcodes"),
    ("products.archive", "products", "Deactivate categories and archive products"),
    ("pricing.read", "pricing", "Read price lists and store price list assignments"),
    ("pricing.update", "pricing", "Create and update price lists and items"),
    ("inventory.read", "inventory", "Read inventory balances, movements, and adjustments"),
    ("inventory.adjust", "inventory", "Create and edit draft stock adjustments"),
    ("inventory.post_adjustment", "inventory", "Post or void stock adjustments"),
    ("devices.read", "devices", "View POS devices and device events"),
    ("devices.create", "devices", "Register new POS devices"),
    ("devices.update", "devices", "Update POS device metadata"),
    ("devices.activate", "devices", "Issue one-time POS device activation codes"),
    ("devices.reassign", "devices", "Reassign a POS device to another store"),
    ("devices.disable", "devices", "Disable a POS device"),
    ("devices.revoke", "devices", "Revoke POS device credentials"),
    ("sales.order.read", "sales", "Read sales orders and payments"),
    ("sales.order.create", "sales", "Create sales orders"),
    ("sales.order.void", "sales", "Void or cancel orders"),
    ("sales.payment.record", "sales", "Record payments against orders"),
    ("sales.refund.read", "sales", "Read refund records"),
    ("sales.refund.create", "sales", "Create and complete order refunds"),
    ("payments.methods.read", "payments", "Read payment methods"),
    ("payments.methods.manage", "payments", "Create and update payment methods"),
    ("cash_session.read", "cash", "Read cash drawers and cash sessions"),
    ("cash_drawer.manage", "cash", "Create and manage cash drawers"),
    ("cash_session.open", "cash", "Open a cash session"),
    ("cash_session.close", "cash", "Close a cash session"),
    ("cash_session.review", "cash", "Review closed cash sessions"),
    ("cash_movement.create", "cash", "Create cash-in and cash-out movements"),
    ("reports.read", "reports", "Read sales, payment, and inventory reports"),
    ("reports.export", "reports", "Create and download report exports"),
]

ALL_PERMISSION_CODES: List[str] = [p[0] for p in GLOBAL_PERMISSIONS]

SYSTEM_ROLE_DEFINITIONS: Dict[str, Dict[str, object]] = {
    "org_owner": {
        "name": "Organization Owner",
        "description": "Full administrative access across the Organization and all Stores",
        "all_stores_access": True,
        "permissions": ALL_PERMISSION_CODES,
    },
    "store_manager": {
        "name": "Store Manager",
        "description": "Manages store catalog, inventory, devices, cash sessions, and sales",
        "all_stores_access": False,
        "permissions": [
            "organization.read",
            "stores.read",
            "users.read",
            "products.read",
            "products.create",
            "products.update",
            "pricing.read",
            "inventory.read",
            "inventory.adjust",
            "inventory.post_adjustment",
            "devices.read",
            "devices.create",
            "devices.activate",
            "Sales.order.read" if False else "sales.order.read",
            "sales.order.create",
            "sales.order.void",
            "sales.payment.record",
            "sales.refund.read",
            "sales.refund.create",
            "payments.methods.read",
            "cash_session.read",
            "cash_drawer.manage",
            "cash_session.open",
            "cash_session.close",
            "cash_session.review",
            "cash_movement.create",
            "reports.read",
        ],
    },
    "cashier": {
        "name": "Cashier",
        "description": "Operates POS checkout, cash sessions, and views products",
        "all_stores_access": False,
        "permissions": [
            "organization.read",
            "stores.read",
            "products.read",
            "pricing.read",
            "inventory.read",
            "sales.order.read",
            "sales.order.create",
            "sales.payment.record",
            "payments.methods.read",
            "cash_session.read",
            "cash_session.open",
            "cash_session.close",
            "cash_movement.create",
        ],
    },
}


def ensure_global_permissions_seeded(db: Session) -> Dict[str, Permission]:
    """Ensure the global permission dictionary rows exist in `permissions`."""
    existing = {p.code: p for p in db.query(Permission).all()}
    for code, module, description in GLOBAL_PERMISSIONS:
        if code not in existing:
            perm = Permission(code=code, module=module, description=description)
            db.add(perm)
            existing[code] = perm
    db.flush()
    return existing


def seed_organization_system_roles(
    db: Session, organization_id: str
) -> Dict[str, Role]:
    """Create default system roles (`org_owner`, `store_manager`, `cashier`) for a new Organization."""
    perms_by_code = ensure_global_permissions_seeded(db)
    created_roles: Dict[str, Role] = {}
    for code, spec in SYSTEM_ROLE_DEFINITIONS.items():
        role = (
            db.query(Role)
            .filter(Role.organization_id == organization_id, Role.code == code)
            .first()
        )
        if role is None:
            role = Role(
                organization_id=organization_id,
                code=code,
                name=str(spec["name"]),
                description=str(spec["description"]),
                is_system=True,
                all_stores_access=bool(spec["all_stores_access"]),
            )
            db.add(role)
            db.flush()
            for perm_code in spec["permissions"]:  # type: ignore[attr-defined]
                perm = perms_by_code.get(perm_code)
                if perm is not None:
                    db.add(RolePermission(role_id=role.id, permission_id=perm.id))
        created_roles[code] = role
    db.flush()
    return created_roles

