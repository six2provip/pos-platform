# POS Platform — API Specification

> **Document ID:** API-001  
> **Version:** 1.0  
> **Date:** 2026-11-03  
> **Status:** Proposed — implementation baseline  
> **Related documents:** `01-system-architecture.md`, `02-database-schema.md`  
> **API styles:** REST/JSON for business and control-plane APIs; WebSocket optional for realtime notifications  
> **Deployment models:** Cloud multi-tenant + Private single-tenant

---

## 1. Purpose and scope

This document defines the API contract between the POS Platform components:

- Super Admin Web and Cloud Control Plane.
- Organization Web and Business Data Plane.
- Flutter POS APK and Business Data Plane.
- Private Server and Cloud Control Plane.

The API contract is designed for one shared product codebase across two deployment models:

1. **Cloud SaaS:** one shared Business Data Plane serves multiple Organizations, with server-derived tenant context and tenant isolation.
2. **Private Server:** one dedicated Business Data Plane serves exactly one Organization, identified during installation and bound to the deployment.

The same Business API routes and request/response schemas are used by Cloud and Private Server. Deployment-specific restrictions are enforced by trusted server configuration and capabilities, not by separate API forks.

The Control Plane API is a separate surface with separate credentials and data ownership. It manages customer accounts, deployments, license lifecycle, heartbeat, releases, and provider operations. It is not the API for orders, payments, inventory, employees, or customer business records.

This document specifies route names, authorization, payload conventions, validation rules, state transitions, and representative JSON examples. It is not a generated OpenAPI file; the backend implementation must publish a machine-readable OpenAPI 3.1 specification that conforms to this document.

## 2. API design principles

1. **Versioned routes:** Business API uses `/api/v1`; Control Plane machine API uses `/control/v1`; provider administration APIs use `/control/admin/v1`.
2. **Server-derived tenant context:** clients must not be able to select an arbitrary `organization_id` or gain access by supplying it in a request body or header.
3. **Explicit Store context:** human users may select an authorized Store; a POS Device is bound to one Store and cannot override that binding.
4. **Separate credentials:** human access tokens, device credentials, deployment credentials, and provider administrator credentials are not interchangeable.
5. **Idempotent writes:** retryable operations use an idempotency key and stable resource identifiers.
6. **Consistent errors:** errors use stable machine-readable codes and a common response envelope.
7. **Cursor-based synchronization:** device sync uses opaque server-issued cursors, not client-generated offsets or timestamps.
8. **Offline-aware semantics:** local acceptance, server receipt, and external payment authorization are distinct states.
9. **Least privilege:** each endpoint declares the actor type and required permission.
10. **No synchronous Control Plane dependency for sales:** Private Server business requests must not call Cloud Control Plane synchronously.
11. **Backward compatibility:** additive response fields are preferred; breaking changes require a new API major version or an approved compatibility plan.
12. **OpenAPI is authoritative for exact schemas:** implementation must generate and validate OpenAPI from the FastAPI route models and compare it against this specification in CI.

---

## 3. API surfaces and base URLs

### 3.1 Business API

Base path:

```text
/api/v1
```

Example Cloud URL:

```text
https://api.example.com/api/v1
```

Example Private Server URL:

```text
https://pos.customer-domain.vn/api/v1
```

The APK stores the selected Business API endpoint as part of its device binding. It must not guess a different endpoint or silently fall back to the Cloud URL.

### 3.2 Cloud Control Plane machine API

Base path:

```text
/control/v1
```

Used by registered Private Server deployments and provider-controlled automation. Authentication is deployment-level machine authentication, preferably mTLS, and must be independent from Business API user/device credentials.

### 3.3 Cloud Control Plane administration API

Base path:

```text
/control/admin/v1
```

Used by Super Admin Web and authorized provider operators. It is not exposed as an Organization Web API. It requires provider-admin authentication, provider RBAC, and audit logging.

### 3.4 Health and readiness endpoints

Infrastructure endpoints are separate from authenticated business routes:

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/health/live` | None; restricted at ingress where appropriate | Process liveness |
| `GET` | `/health/ready` | Internal/monitoring network | Readiness including critical dependencies |
| `GET` | `/api/v1/system/info` | Public, minimal metadata | API version, deployment mode, activation capability metadata |

`/health/ready` must not disclose database hostnames, credentials, environment variables, or detailed infrastructure configuration. On a Private Server, readiness of the Business API must not fail solely because Cloud Control Plane is temporarily unreachable; Control Plane connectivity is reported as a separate degraded capability.

---

## 4. Actors and authentication schemes

### 4.1 Actor types

| Actor | Origin | Credential | Scope |
|---|---|---|---|
| Provider Admin | Super Admin Web | Provider user access token | Platform and Control Plane operations |
| Organization User | Organization Web | Business user access token | One Organization, plus authorized Store scope |
| POS Device | Flutter APK | Device access token | One Organization, one bound Store, device permissions |
| Private Deployment | Private Server agent | mTLS certificate / deployment credential | Its registered deployment only |
| System Worker | Backend/worker process | Workload identity or restricted service credential | Explicit internal task scope |

### 4.2 Business user authentication

Recommended initial token policy (final TTLs are configuration, not permanent API guarantees):

- Access token: short-lived JWT, initially 15 minutes.
- Refresh token: high-entropy opaque secret, initially up to 30 days with rotation and revocation.
- Refresh token is stored as a hash server-side, not plaintext.
- Refresh-token reuse must revoke the affected token family and trigger an audit/security event.
- Passwords use an approved password hashing algorithm such as Argon2id; never use reversible encryption.

The database specification should include an `auth_sessions` or equivalent secure session persistence mechanism before implementation. If Redis is used for short-lived session metadata, durable refresh-token revocation and rotation semantics must still be defined.

Cloud login may accept an Organization code/slug or use an Organization-specific hostname as a lookup selector. That selector is not an authorization claim. The server must authenticate the user and verify active Organization membership before issuing tokens.

Private Server login resolves the single fixed Organization from trusted local deployment configuration. It must not permit the client to switch Organization.

### 4.3 POS Device authentication

- Activation uses a short-lived, single-use activation code.
- Activation returns a device identity and device credentials after server-side checks.
- Device credentials are distinct from user credentials.
- A device token is bound to `deployment_id` (where applicable), `organization_id`, `store_id`, and `device_id`.
- Access credentials should be short-lived; refresh/rotation material is high entropy and stored using Android Keystore-backed secure storage.
- The database stores only a hash of long-lived refresh/device secrets.
- Device disablement or revocation invalidates its credentials.

A Device token must not access Organization administration routes, even if the request includes an administrator-looking payload.

### 4.4 Private Deployment authentication

Private Server to Control Plane calls use an enrolled deployment identity authenticated with mTLS or an equivalent strong machine credential. Credentials are:

- Unique per deployment.
- Revocable and rotatable.
- Scoped to that deployment.
- Not usable as a Business API user or device token.
- Stored in a protected secret location, not in source control or normal application logs.

### 4.5 Provider Admin authentication

Provider administrators use a separate identity and authorization domain. Provider roles must not be represented by ordinary Organization roles. Sensitive actions such as deployment suspension, license revocation, signing-key rotation, and release publication require stronger authorization and audit records.

---

## 5. Request conventions

### 5.1 Required headers

| Header | Required | Description |
|---|---|---|
| `Authorization` | For protected routes | `Bearer <access-token>` |
| `Content-Type` | For JSON body | `application/json` |
| `Accept` | Recommended | `application/json` |
| `X-Request-ID` | Optional inbound; always returned | Caller-provided correlation ID or server-generated ID |
| `Idempotency-Key` | Required on designated write operations | Stable key for retry-safe request processing |
| `If-Match` | Required on selected concurrent updates | ETag/version precondition |
| `X-Store-ID` | Optional for human user routes that need Store scope | Store selector; server validates access |

Do not accept `X-Organization-ID` as an authorization mechanism. If legacy clients send it, ignore it or reject it consistently; never use it to establish tenant context.

For POS Device requests, the server derives Organization, Store, and Device from the authenticated device credential. An APK-supplied `X-Store-ID` must not override the Store binding.

### 5.2 Content and encoding

- UTF-8 JSON.
- JSON field names use `snake_case` for API v1.
- IDs use UUID strings.
- Timestamps use RFC 3339 / ISO 8601 with timezone offset; server-generated timestamps are UTC (`Z`).
- Monetary amounts use decimal strings in JSON to avoid binary floating-point representation issues, for example `"125000.0000"`.
- Currency is always explicit using ISO 4217 code, for example `"VND"`.
- Empty optional values should be omitted or set to `null` according to the endpoint schema; do not mix semantics within one field.

### 5.3 Success response envelope

Single-resource response:

```json
{
  "success": true,
  "data": {
    "id": "0192b1d6-9c7e-7a10-b9b3-5a1a2f712345"
  },
  "message": null,
  "error": null,
  "request_id": "req_01J..."
}
```

Collection response:

```json
{
  "success": true,
  "data": [],
  "message": null,
  "error": null,
  "request_id": "req_01J...",
  "meta": {
    "page_size": 50,
    "next_cursor": "opaque-cursor-or-null",
    "has_more": false
  }
}
```

The `data` type must be stable for an endpoint. Do not alternate between array, object, and null for the same endpoint.

### 5.4 Error response envelope

```json
{
  "success": false,
  "data": null,
  "message": "The requested operation could not be completed.",
  "error": {
    "code": "ORDER_STOCK_CONFLICT",
    "details": [
      {
        "field": "items[0].product_variant_id",
        "reason": "INSUFFICIENT_STOCK"
      }
    ]
  },
  "request_id": "req_01J..."
}
```

Error messages must be safe for clients. Stack traces, SQL statements, secrets, internal hostnames, and raw provider responses must never be returned to end users.

### 5.5 HTTP status codes

| Status | Meaning | Typical use |
|---|---|---|
| `200` | OK | Successful read/update/action |
| `201` | Created | Resource created |
| `202` | Accepted | Asynchronous operation accepted |
| `204` | No Content | Successful operation with no response body, only where explicitly documented |
| `400` | Bad Request | Malformed request or invalid syntax |
| `401` | Unauthorized | Missing/invalid/expired credentials |
| `403` | Forbidden | Authenticated actor lacks permission |
| `404` | Not Found | Resource absent or intentionally concealed due to scope |
| `409` | Conflict | State conflict, duplicate key with different payload, or invalid transition |
| `412` | Precondition Failed | Stale `If-Match` / ETag |
| `422` | Unprocessable Entity | Field/business validation error |
| `429` | Too Many Requests | Rate limit exceeded |
| `500` | Internal Server Error | Unexpected server error |
| `503` | Service Unavailable | Required local service unavailable; temporary dependency unavailability |

Use `Retry-After` on retryable `429` and `503` responses where a useful value can be provided.

### 5.6 Pagination, filtering, and sorting

For potentially large collections:

```text
?page_size=50&cursor=<opaque-cursor>
```

Rules:
- Default page size: 50.
- Maximum page size: 200 unless an endpoint specifies a lower limit.
- Cursors are opaque and server-generated.
- A cursor is tied to the authenticated tenant and relevant filters; reject a cursor reused with incompatible filters.
- Clients must not calculate, decode, or increment a cursor.
- Sort fields must be allowlisted per endpoint.
- Default ordering must be stable, usually `created_at DESC, id DESC` or an endpoint-specific immutable sequence.
- Use dedicated reporting/export jobs for very large data exports rather than unbounded list requests.

### 5.7 Conditional updates

For mutable resources where concurrent edits are likely, return an `ETag` or `version` value. Clients send `If-Match` on update. A stale precondition returns `412 PRECONDITION_FAILED`; the client reloads and resolves the edit rather than silently overwriting newer data.

---

## 6. Authorization and tenant context

### 6.1 Tenant resolution

The Business Backend derives tenant context from the verified principal:

- Organization User: verified user identity plus active `organization_memberships` record.
- POS Device: device credential's Organization, Store, and Device binding.
- System Worker: explicitly scoped workload identity and job context.

The client cannot set an arbitrary Organization ID in a request and gain access to it.

### 6.2 Store resolution

For a human user:

- `X-Store-ID` may select the Store context for Store-scoped operations.
- The server verifies the Store belongs to the authenticated Organization.
- The server verifies the user has access to that Store under role and `user_store_assignments` policy.
- If the user has no explicit Store assignment, access behavior is determined by the assigned role and Organization policy; absence of rows must not implicitly grant all Stores.

For a POS Device:

- Store ID is derived from the device credential/binding.
- A request attempting to access another Store is rejected.
- Reassignment is initiated through Organization Web and requires pending offline transactions to be resolved.

### 6.3 Permission format

Permission codes follow a stable dotted format. Initial examples:

| Module | Permission examples |
|---|---|
| Organization | `organization.read`, `organization.update` |
| Stores | `stores.read`, `stores.create`, `stores.update`, `stores.disable` |
| Users | `users.read`, `users.create`, `users.update`, `users.disable` |
| Roles | `roles.read`, `roles.assign`, `roles.update` |
| Products | `products.read`, `products.create`, `products.update`, `products.archive` |
| Pricing | `pricing.read`, `pricing.update` |
| Inventory | `inventory.read`, `inventory.adjust`, `inventory.post_adjustment` |
| Devices | `devices.read`, `devices.create`, `devices.activate`, `devices.reassign`, `devices.revoke` |
| Sales | `sales.order.read`, `sales.order.create`, `sales.order.void`, `sales.refund.create` |
| Cash | `cash_session.open`, `cash_session.close`, `cash_movement.create` |
| Reports | `reports.read`, `reports.export` |

The global permission catalogue is seeded by migrations. Organizations assign roles to those permission codes; they do not create arbitrary permission names.

### 6.4 Route actor matrix

| Route family | Provider Admin | Organization User | POS Device | Private Deployment |
|---|---:|---:|---:|---:|
| `/api/v1/auth/*` | No | Yes | Device-specific only | No |
| `/api/v1/organization/*` | No | Permission-based | No | No |
| `/api/v1/stores/*` | No | Permission-based | Read bound Store config only | No |
| `/api/v1/products/*` | No | Permission-based | Read/cache/search only | No |
| `/api/v1/inventory/*` | No | Permission-based | Read permitted availability; sales mutate through order flow | No |
| `/api/v1/devices/*` | No | Permission-based admin routes; device self routes | Self routes only | No |
| `/api/v1/orders/*` | No | Permission-based | Bound Store sales routes | No |
| `/api/v1/sync/*` | No | No | Yes | No |
| `/control/v1/*` | No | No | No | Yes |
| `/control/admin/v1/*` | Yes | No | No | No |

---

## 7. Business API route catalogue

All routes below are under `/api/v1` and use the Business Data Plane. They are available in both Cloud and Private Server unless explicitly stated otherwise.

### 7.1 System metadata and capability discovery

| Method | Route | Actor | Purpose |
|---|---|---|---|
| `GET` | `/system/info` | Public | Minimal deployment metadata and API compatibility |
| `GET` | `/system/capabilities` | Authenticated | Features and limits available to the current principal |

`GET /system/info` example:

```json
{
  "success": true,
  "data": {
    "product": "POS Platform",
    "api_version": "v1",
    "deployment_mode": "private",
    "deployment_id": "0192b1d6-9c7e-7a10-b9b3-5a1a2f700001",
    "minimum_pos_app_version": "1.0.0",
    "activation_enabled": true
  },
  "message": null,
  "error": null,
  "request_id": "req_01J..."
}
```

Do not return Organization secrets, license signing material, internal IP addresses, database details, or deployment credentials from public metadata endpoints.

`GET /system/capabilities` returns the feature set and limits applicable to the authenticated actor, for example `pos.sales`, `inventory.adjustments`, `max_devices`, and `max_stores`. The client must not treat capability metadata as a substitute for server-side authorization.

### 7.2 Authentication

| Method | Route | Actor | Permission |
|---|---|---|---|
| `POST` | `/auth/login` | Public | Rate-limited |
| `POST` | `/auth/refresh` | User refresh credential | Valid session family |
| `POST` | `/auth/logout` | Organization User | Current session |
| `GET` | `/auth/me` | Organization User | Authenticated |
| `POST` | `/auth/change-password` | Organization User | `users.password.change` or own account policy |
| `POST` | `/auth/forgot-password` | Public | Rate-limited; only if password recovery is enabled |
| `POST` | `/auth/reset-password` | Public reset token | Valid one-time reset token |

Login request:

```json
{
  "organization_code": "STORE-GROUP-01",
  "identifier": "admin@example.com",
  "password": "<password>"
}
```

`organization_code` is an optional Cloud tenant lookup selector, not an authorization claim. For Private Server, the Organization is fixed by the deployment and clients should omit it.

Login response:

```json
{
  "success": true,
  "data": {
    "access_token": "<short-lived-jwt>",
    "token_type": "Bearer",
    "expires_in": 900,
    "refresh_token": "<opaque-one-time-returned-secret>",
    "user": {
      "id": "0192b1d6-9c7e-7a10-b9b3-5a1a2f700010",
      "display_name": "Organization Admin",
      "status": "active"
    },
    "organization": {
      "id": "0192b1d6-9c7e-7a10-b9b3-5a1a2f700020",
      "name": "Example Store Group"
    },
    "permissions": ["organization.read", "products.read", "products.update"],
    "available_stores": [
      {"id": "0192b1d6-9c7e-7a10-b9b3-5a1a2f700030", "code": "HCM-01", "name": "Ho Chi Minh Store"}
    ]
  },
  "message": null,
  "error": null,
  "request_id": "req_01J..."
}
```

Never log passwords, access tokens, refresh tokens, reset tokens, or authorization headers. Access and refresh token lifetimes are configuration-controlled; the example values are initial engineering defaults.

### 7.3 Organization

| Method | Route | Actor | Permission |
|---|---|---|---|
| `GET` | `/organization` | User | `organization.read` |
| `PATCH` | `/organization` | User | `organization.update` |
| `GET` | `/organization/settings` | User | `organization.read` |
| `PATCH` | `/organization/settings` | User | `organization.update` |

The Business API does not expose `POST /organizations` or Organization switching. Organization provisioning occurs through Cloud Super Admin or the Private Server installer.

Settings must be schema-validated and contain preferences only. Passwords, private keys, payment secrets, device tokens, and other credentials must be stored in dedicated secret-management facilities, not in `settings` JSON.

### 7.4 Stores

| Method | Route | Actor | Permission |
|---|---|---|---|
| `GET` | `/stores` | User | `stores.read` |
| `POST` | `/stores` | User | `stores.create` |
| `GET` | `/stores/{store_id}` | User | `stores.read` |
| `PATCH` | `/stores/{store_id}` | User | `stores.update` |
| `POST` | `/stores/{store_id}/deactivate` | User | `stores.disable` |
| `GET` | `/stores/{store_id}/settings` | User | `stores.read` |
| `PATCH` | `/stores/{store_id}/settings` | User | `stores.update` |

Create Store request:

```json
{
  "code": "HCM-01",
  "name": "Ho Chi Minh Store",
  "address_line": "Example address",
  "phone": "+84...",
  "timezone": "Asia/Ho_Chi_Minh",
  "currency_code": "VND"
}
```

The backend validates Store limits against the active Cloud subscription or Private Server license. A limit breach returns `LICENSE_LIMIT_EXCEEDED` and does not create a partial Store.

### 7.5 Users, memberships, roles, and permissions

| Method | Route | Actor | Permission |
|---|---|---|---|
| `GET` | `/users` | User | `users.read` |
| `POST` | `/users` | User | `users.create` |
| `GET` | `/users/{user_id}` | User | `users.read` |
| `PATCH` | `/users/{user_id}` | User | `users.update` |
| `POST` | `/users/{user_id}/disable` | User | `users.disable` |
| `POST` | `/users/{user_id}/invite` | User | `users.create` |
| `GET` | `/roles` | User | `roles.read` |
| `POST` | `/roles` | User | `roles.update` |
| `PATCH` | `/roles/{role_id}` | User | `roles.update` |
| `PUT` | `/roles/{role_id}/permissions` | User | `roles.update` |
| `POST` | `/users/{user_id}/roles` | User | `roles.assign` |
| `DELETE` | `/users/{user_id}/roles/{role_id}` | User | `roles.assign` |
| `GET` | `/permissions` | User | `roles.read` |

Rules:
- The Organization Admin cannot create provider-level roles.
- System roles cannot be deleted or have protected permissions removed unless an explicit policy permits it.
- A user cannot grant permissions they do not possess or administer.
- Self-disable and removal of the last active Organization Owner/Admin must be blocked unless a recovery owner remains.
- User/store assignments must be checked at every Store-scoped request.

### 7.6 Categories and products

| Method | Route | Actor | Permission |
|---|---|---|---|
| `GET` | `/categories` | User or Device read | `products.read` |
| `POST` | `/categories` | User | `products.create` |
| `GET` | `/categories/{category_id}` | User | `products.read` |
| `PATCH` | `/categories/{category_id}` | User | `products.update` |
| `POST` | `/categories/{category_id}/deactivate` | User | `products.archive` |
| `GET` | `/products` | User or Device read | `products.read` |
| `POST` | `/products` | User | `products.create` |
| `GET` | `/products/{product_id}` | User or Device read | `products.read` |
| `PATCH` | `/products/{product_id}` | User | `products.update` |
| `POST` | `/products/{product_id}/archive` | User | `products.archive` |
| `POST` | `/products/{product_id}/variants` | User | `products.update` |
| `PATCH` | `/products/{product_id}/variants/{variant_id}` | User | `products.update` |
| `POST` | `/products/{product_id}/barcodes` | User | `products.update` |
| `DELETE` | `/products/{product_id}/barcodes/{barcode_id}` | User | `products.update` |
| `GET` | `/products/search` | User or Device read | `products.read` |
| `GET` | `/products/barcode/{barcode}` | User or Device read | `products.read` |

Product create request:

```json
{
  "category_id": "0192b1d6-9c7e-7a10-b9b3-5a1a2f700040",
  "product_code": "COFFEE-001",
  "name": "Milk Coffee",
  "description": "Example product",
  "product_type": "stocked",
  "track_inventory": true,
  "variants": [
    {
      "variant_code": "COFFEE-001-STD",
      "variant_name": "Standard",
      "sku": "SKU-COFFEE-001",
      "unit_name": "cup",
      "default_price": "35000.0000",
      "currency_code": "VND",
      "is_default": true,
      "barcodes": [
        {"barcode": "8930000000001", "barcode_type": "EAN13", "is_primary": true}
      ]
    }
  ]
}
```

Implementation may expose nested create or separate variant/barcode operations. The resulting persisted entities and validation rules must match `02-database-schema.md`.

Product list filters are allowlisted, for example:

```text
GET /api/v1/products?page_size=50&cursor=...&status=active&category_id=...&updated_since=...
```

Do not accept arbitrary SQL-like filters or client-specified sort expressions.

### 7.7 Pricing

| Method | Route | Actor | Permission |
|---|---|---|---|
| `GET` | `/price-lists` | User | `pricing.read` |
| `POST` | `/price-lists` | User | `pricing.update` |
| `GET` | `/price-lists/{price_list_id}` | User | `pricing.read` |
| `PATCH` | `/price-lists/{price_list_id}` | User | `pricing.update` |
| `PUT` | `/price-lists/{price_list_id}/items` | User | `pricing.update` |
| `PUT` | `/stores/{store_id}/price-list` | User | `pricing.update` |
| `GET` | `/pos/pricing` | Device | Device read policy |

Pricing responses must identify the currency and effective timestamp/version. POS may cache pricing for offline sale capture, but the server remains authoritative when synchronizing an order. An order must preserve the price snapshot used at sale time and record policy exceptions where applicable.

### 7.8 Inventory

| Method | Route | Actor | Permission |
|---|---|---|---|
| `GET` | `/inventory` | User | `inventory.read` |
| `GET` | `/inventory/{product_variant_id}` | User | `inventory.read` |
| `GET` | `/inventory/movements` | User | `inventory.read` |
| `GET` | `/inventory/adjustments` | User | `inventory.read` |
| `POST` | `/inventory/adjustments` | User | `inventory.adjust` |
| `GET` | `/inventory/adjustments/{adjustment_id}` | User | `inventory.read` |
| `PATCH` | `/inventory/adjustments/{adjustment_id}` | User | `inventory.adjust` |
| `POST` | `/inventory/adjustments/{adjustment_id}/post` | User | `inventory.post_adjustment` |
| `POST` | `/inventory/adjustments/{adjustment_id}/void` | User | Explicit void policy |

Adjustment create request:

```json
{
  "store_id": "0192b1d6-9c7e-7a10-b9b3-5a1a2f700030",
  "reason": "Stock count correction",
  "occurred_at": "2026-11-03T08:00:00Z",
  "items": [
    {
      "product_variant_id": "0192b1d6-9c7e-7a10-b9b3-5a1a2f700050",
      "quantity_delta": "-2.0000",
      "note": "Damaged items"
    }
  ]
}
```

Posting an adjustment must create stock movement records and update the inventory projection in one database transaction. Posted stock movements are immutable; corrections use compensating movements.

Store scope is derived from a verified user context and validated against the requested `store_id`. A POS Device cannot call stock adjustment APIs.

### 7.9 POS devices and activation

Organization Web routes:

| Method | Route | Actor | Permission |
|---|---|---|---|
| `GET` | `/devices` | User | `devices.read` |
| `POST` | `/stores/{store_id}/devices` | User | `devices.create` |
| `GET` | `/devices/{device_id}` | User | `devices.read` |
| `PATCH` | `/devices/{device_id}` | User | `devices.update` |
| `POST` | `/devices/{device_id}/activation-codes` | User | `devices.activate` |
| `POST` | `/devices/{device_id}/reassign-store` | User | `devices.reassign` |
| `POST` | `/devices/{device_id}/disable` | User | `devices.disable` |
| `POST` | `/devices/{device_id}/revoke` | User | `devices.revoke` |
| `GET` | `/devices/{device_id}/events` | User | `devices.read` |

Public/device activation routes:

| Method | Route | Actor | Purpose |
|---|---|---|---|
| `POST` | `/device-activations/exchange` | Unauthenticated APK | Exchange one-time activation code for device credentials |
| `GET` | `/devices/me/config` | Device | Read bound device/Store configuration |
| `POST` | `/devices/me/heartbeat` | Device | Report application and connectivity status to Business Backend |
| `POST` | `/devices/me/token/rotate` | Device | Rotate device credential |
| `POST` | `/devices/me/logout` | Device | Revoke current device credential/session |

Device create request:

```json
{
  "device_code": "POS-HCM-01-01",
  "name": "Front Counter POS 01",
  "device_type": "android_pos",
  "platform": "android"
}
```

Activation code request:

```json
{
  "expires_in_seconds": 300
}
```

Activation code response:

```json
{
  "success": true,
  "data": {
    "activation_id": "0192b1d6-9c7e-7a10-b9b3-5a1a2f700060",
    "activation_code": "<single-use-random-code>",
    "expires_at": "2026-11-03T09:05:00Z",
    "qr_payload": {
      "server_url": "https://pos.customer-domain.vn",
      "deployment_id": "0192b1d6-9c7e-7a10-b9b3-5a1a2f700001",
      "activation_code": "<single-use-random-code>",
      "protocol_version": 1
    }
  },
  "message": null,
  "error": null,
  "request_id": "req_01J..."
}
```

The raw activation code is displayed only at creation. The server stores only a hash. QR payload must not contain permanent device credentials or administrator passwords.

Activation exchange request:

```json
{
  "activation_code": "<single-use-random-code>",
  "device_info": {
    "app_version": "1.0.0",
    "android_version": "14",
    "manufacturer": "Example",
    "model": "Touch POS"
  },
  "device_public_key": "<optional-public-key-for-device-key-binding>"
}
```

Activation exchange response:

```json
{
  "success": true,
  "data": {
    "access_token": "<short-lived-device-access-token>",
    "refresh_token": "<opaque-device-refresh-secret>",
    "token_type": "Bearer",
    "expires_in": 900,
    "deployment": {
      "deployment_id": "0192b1d6-9c7e-7a10-b9b3-5a1a2f700001",
      "deployment_mode": "private",
      "server_url": "https://pos.customer-domain.vn"
    },
    "organization": {"id": "0192b1d6-9c7e-7a10-b9b3-5a1a2f700020", "name": "Example Store Group"},
    "store": {"id": "0192b1d6-9c7e-7a10-b9b3-5a1a2f700030", "code": "HCM-01", "name": "Ho Chi Minh Store"},
    "device": {"id": "0192b1d6-9c7e-7a10-b9b3-5a1a2f700070", "device_code": "POS-HCM-01-01"},
    "config_version": "cfg_000001"
  },
  "message": null,
  "error": null,
  "request_id": "req_01J..."
}
```

The APK stores the endpoint/deployment/Organization/Store binding and credentials in the correct secure storage locations. It then fetches the POS bootstrap/configuration and initial catalog data.

### 7.10 POS bootstrap and configuration

| Method | Route | Actor | Purpose |
|---|---|---|---|
| `GET` | `/pos/bootstrap` | Device | Initial POS settings, feature flags, payment methods, pricing version and sync cursors |
| `GET` | `/pos/config` | Device | Current config by version |
| `GET` | `/pos/payment-methods` | Device | Enabled payment methods and offline recording policy |
| `GET` | `/pos/cash-session/current` | Device | Current shift/drawer session, if enabled |

Bootstrap response should be compact and versioned. Product catalog data should be downloaded through the catalog sync routes rather than returning an unbounded product list in the bootstrap response.

Example:

```json
{
  "success": true,
  "data": {
    "config_version": "cfg_000001",
    "server_time": "2026-11-03T09:00:00Z",
    "organization": {"id": "...", "name": "Example Store Group", "timezone": "Asia/Ho_Chi_Minh", "currency_code": "VND"},
    "store": {"id": "...", "name": "Ho Chi Minh Store", "timezone": "Asia/Ho_Chi_Minh"},
    "device": {"id": "...", "device_code": "POS-HCM-01-01"},
    "offline_policy": {
      "enabled": true,
      "cash_recording_allowed": true,
      "allow_negative_stock": false,
      "maximum_offline_age_seconds": 259200
    },
    "features": ["pos.sales", "pos.cash", "catalog.barcode"],
    "sync": {
      "catalog_cursor": "opaque-cursor",
      "config_cursor": "opaque-cursor"
    }
  },
  "message": null,
  "error": null,
  "request_id": "req_01J..."
}
```

The values above are illustrative; the authoritative policy is determined by the Organization settings and subscription/license entitlements.

### 7.11 Cash sessions and drawer operations

| Method | Route | Actor | Permission |
|---|---|---|---|
| `GET` | `/cash-drawers` | User | `cash_session.read` |
| `POST` | `/cash-drawers` | User | `cash_drawer.manage` |
| `GET` | `/cash-sessions` | User | `cash_session.read` |
| `POST` | `/cash-sessions/open` | User or Device | `cash_session.open` / device policy |
| `GET` | `/cash-sessions/{session_id}` | User or bound Device | `cash_session.read` |
| `POST` | `/cash-sessions/{session_id}/movements` | User or Device | `cash_movement.create` / device policy |
| `POST` | `/cash-sessions/{session_id}/close` | User or Device | `cash_session.close` / device policy |
| `POST` | `/cash-sessions/{session_id}/review` | User | `cash_session.review` |

Open session request:

```json
{
  "store_id": "0192b1d6-9c7e-7a10-b9b3-5a1a2f700030",
  "cash_drawer_id": "0192b1d6-9c7e-7a10-b9b3-5a1a2f700080",
  "opening_amount": "1000000.0000",
  "currency_code": "VND"
}
```

The server must enforce the Organization's concurrency policy for open sessions (e.g. one active session per drawer). It must compute the expected closing balance from posted movements; a client-submitted expected amount is not authoritative.

### 7.12 Orders and sales

| Method | Route | Actor | Permission |
|---|---|---|---|
| `GET` | `/orders` | User | `sales.order.read` |
| `POST` | `/orders` | User or Device | `sales.order.create` / device sales policy |
| `GET` | `/orders/{order_id}` | User or Device | `sales.order.read` / own Store policy |
| `POST` | `/orders/{order_id}/void` | User | `sales.order.void` |
| `POST` | `/orders/{order_id}/payments` | User or Device | `sales.payment.record` / device sales policy |
| `GET` | `/orders/{order_id}/payments` | User or Device | `sales.order.read` / own Store policy |
| `POST` | `/orders/{order_id}/refunds` | User | `sales.refund.create` |
| `GET` | `/refunds` | User | `sales.refund.read` |
| `GET` | `/refunds/{refund_id}` | User | `sales.refund.read` |

Create order request:

```json
{
  "client_order_id": "0192b1d6-9c7e-7a10-b9b3-5a1a2f700090",
  "store_id": "0192b1d6-9c7e-7a10-b9b3-5a1a2f700030",
  "cash_session_id": "0192b1d6-9c7e-7a10-b9b3-5a1a2f700091",
  "currency_code": "VND",
  "items": [
    {
      "product_id": "0192b1d6-9c7e-7a10-b9b3-5a1a2f700040",
      "product_variant_id": "0192b1d6-9c7e-7a10-b9b3-5a1a2f700050",
      "quantity": "2.0000",
      "unit_price": "35000.0000",
      "discount_amount": "0.0000",
      "tax_amount": "0.0000"
    }
  ],
  "payments": [
    {
      "payment_method_id": "0192b1d6-9c7e-7a10-b9b3-5a1a2f700092",
      "amount": "70000.0000",
      "currency_code": "VND",
      "payment_status": "recorded_locally"
    }
  ],
  "note": "Example order",
  "client_occurred_at": "2026-11-03T09:05:00+07:00"
}
```

Required headers:

```http
Authorization: Bearer <user-or-device-access-token>
Idempotency-Key: <stable-unique-key>
Content-Type: application/json
```

Important rules:
- `organization_id`, `device_id`, `cashier_user_id`, price permissions, and authorized Store binding are derived/validated by the backend. The client must not be able to spoof them.
- `store_id` must match the authenticated Device's bound Store. For a human user, it must be within authorized Store scope.
- The server recalculates or validates prices, discounts, tax configuration, totals, and payment semantics. A submitted amount is not trusted merely because it is in a signed-in request.
- The backend stores product name/code/variant/unit/price snapshots on order lines.
- The backend assigns `order_number`; clients must not generate official receipt/order numbers.
- `client_order_id` remains stable across retries and sync attempts.
- A duplicate request with the same idempotency key and same canonical payload returns the stored result. The same key with a different payload returns `409 IDEMPOTENCY_KEY_REUSED`.
- A locally recorded cash payment is not the same as an external gateway/card authorization.
- Order creation, payment record creation, applicable cash movement creation, and stock movement/inventory updates must be handled with transactionally consistent rules. If payment or stock processing is asynchronous, expose an explicit pending state.

Create order response:

```json
{
  "success": true,
  "data": {
    "id": "0192b1d6-9c7e-7a10-b9b3-5a1a2f700093",
    "client_order_id": "0192b1d6-9c7e-7a10-b9b3-5a1a2f700090",
    "order_number": "HCM01-20261103-000001",
    "order_status": "completed",
    "payment_status": "paid",
    "currency_code": "VND",
    "subtotal_amount": "70000.0000",
    "discount_amount": "0.0000",
    "tax_amount": "0.0000",
    "total_amount": "70000.0000",
    "paid_amount": "70000.0000",
    "change_amount": "0.0000",
    "created_at": "2026-11-03T02:05:01Z",
    "sync_status": "accepted"
  },
  "message": null,
  "error": null,
  "request_id": "req_01J..."
}
```

The response example is a server-accepted online sale. Offline local acceptance is represented only on the APK before a server acknowledgement exists; it must not fabricate a server `order_number` or claim server completion.

### 7.13 Payments and payment methods

| Method | Route | Actor | Permission |
|---|---|---|---|
| `GET` | `/payment-methods` | User | `payments.methods.read` |
| `POST` | `/payment-methods` | User | `payments.methods.manage` |
| `PATCH` | `/payment-methods/{payment_method_id}` | User | `payments.methods.manage` |
| `POST` | `/orders/{order_id}/payments` | User or Device | `sales.payment.record` / device sales policy |
| `GET` | `/payments/{payment_id}` | User or Device | `sales.order.read` / own Store policy |

The payment method resource describes allowed behavior, including `supports_offline_recording` and `requires_external_authorization`. Never store card PAN, CVV, magnetic stripe data, PIN, or raw payment credentials. Only safe provider references/tokens may be stored.

A payment API response must expose its state clearly, such as `recorded_locally`, `pending_authorization`, `authorized`, `captured`, `failed`, `cancelled`, `refunded`, or `partially_refunded`.

### 7.14 Refunds

Refund routes are created against an existing completed order. Refund creation and completion must validate:
- Refundable quantity and amount per original order line.
- Refund method and authorization requirements.
- Permission and Store scope.
- Stock return/restock policy.
- Duplicate submission/idempotency.

A refund completion must create its financial effects and any restock movements in a consistent transaction or an explicitly modeled state machine. Refunds must not simply edit the original payment or overwrite the original order total.

### 7.15 Reports

| Method | Route | Actor | Permission |
|---|---|---|---|
| `GET` | `/reports/sales/summary` | User | `reports.read` |
| `GET` | `/reports/sales/by-period` | User | `reports.read` |
| `GET` | `/reports/sales/by-product` | User | `reports.read` |
| `GET` | `/reports/sales/by-store` | User | `reports.read` |
| `GET` | `/reports/payments/summary` | User | `reports.read` |
| `GET` | `/reports/inventory/summary` | User | `reports.read` |
| `POST` | `/reports/exports` | User | `reports.export` |
| `GET` | `/reports/exports/{export_id}` | User | `reports.export` |

Report routes must validate Organization and Store scope. Large exports should be asynchronous and return an export job ID. Export files must be authorized, time-limited, and stored in approved object storage or local Private Server storage. Do not return an unbounded data set from a normal list endpoint.

---

## 8. POS synchronization API

The synchronization API is designed for unreliable networks and repeated delivery. The device uses opaque cursors, stable event IDs, and idempotency keys.

### 8.1 Route catalogue

| Method | Route | Actor | Purpose |
|---|---|---|---|
| `GET` | `/sync/catalog` | Device | Pull catalog changes using an opaque cursor |
| `GET` | `/sync/config` | Device | Pull POS configuration changes |
| `GET` | `/sync/payment-methods` | Device | Pull enabled payment methods and offline policy |
| `POST` | `/sync/push` | Device | Submit a bounded batch of Outbox events |
| `GET` | `/sync/status` | Device | Read server-side sync status for the device |

### 8.2 Catalog pull

Request:

```text
GET /api/v1/sync/catalog?page_size=500&cursor=<opaque-cursor>
```

Response:

```json
{
  "success": true,
  "data": {
    "changes": [
      {
        "entity_type": "product_variant",
        "change_type": "upsert",
        "entity_id": "0192b1d6-9c7e-7a10-b9b3-5a1a2f700050",
        "version": 12,
        "payload": {
          "product_id": "0192b1d6-9c7e-7a10-b9b3-5a1a2f700040",
          "variant_code": "COFFEE-001-STD",
          "variant_name": "Standard",
          "sku": "SKU-COFFEE-001",
          "unit_name": "cup",
          "default_price": "35000.0000",
          "currency_code": "VND",
          "status": "active"
        }
      }
    ],
    "next_cursor": "opaque-next-cursor",
    "has_more": false,
    "server_time": "2026-11-03T02:10:00Z"
  },
  "message": null,
  "error": null,
  "request_id": "req_01J..."
}
```

Rules:
- Cursor is opaque, scoped to device/Organization/stream and compatible filters.
- Use tombstone/delete changes for archived/deactivated entities so device caches can be updated.
- The client stores the returned cursor only after the corresponding page changes have been committed to its local database.
- If a cursor expires or becomes invalid, return `409 SYNC_CURSOR_EXPIRED` with a recovery instruction to perform a full catalog refresh.
- Do not require the client to compare local wall-clock timestamps to infer catalog changes.

### 8.3 Push Outbox events

Request:

```json
{
  "batch_id": "0192b1d6-9c7e-7a10-b9b3-5a1a2f700100",
  "events": [
    {
      "event_id": "0192b1d6-9c7e-7a10-b9b3-5a1a2f700101",
      "event_type": "order.create",
      "payload_version": 1,
      "idempotency_key": "pos001-order-0192b1d6-9c7e-7a10-b9b3-5a1a2f700090",
      "occurred_at": "2026-11-03T09:05:00+07:00",
      "payload": {
        "client_order_id": "0192b1d6-9c7e-7a10-b9b3-5a1a2f700090",
        "currency_code": "VND",
        "items": [],
        "payments": []
      }
    }
  ]
}
```

Response:

```json
{
  "success": true,
  "data": {
    "batch_id": "0192b1d6-9c7e-7a10-b9b3-5a1a2f700100",
    "results": [
      {
        "event_id": "0192b1d6-9c7e-7a10-b9b3-5a1a2f700101",
        "status": "accepted",
        "resource_type": "order",
        "resource_id": "0192b1d6-9c7e-7a10-b9b3-5a1a2f700093",
        "server_reference": "HCM01-20261103-000001"
      }
    ]
  },
  "message": null,
  "error": null,
  "request_id": "req_01J..."
}
```

Per-event results may be:
- `accepted`: event was committed or its prior idempotent result was replayed.
- `rejected`: permanent validation or policy failure; include stable error code and safe details.
- `retry`: temporary server/dependency failure; client should retry using the same event ID and idempotency key.
- `conflict`: human/business reconciliation required; event remains visible and must not be silently dropped.

Batch processing rules:
- Set a maximum event count and byte size (initial proposal: 50 events and 1 MiB per request; tune after testing).
- Process events independently unless an explicit atomic batch contract is introduced.
- Return a result for every submitted event.
- A transient failure for one event must not conceal the outcome of other events.
- Same event ID or idempotency key with same canonical payload returns the recorded result.
- Same key with a different payload returns `409 IDEMPOTENCY_KEY_REUSED` for that event.
- The server must persist the outcome before returning `accepted`.
- The client must persist each acknowledgement before marking the event completed locally.

### 8.4 Sync status

`GET /sync/status` returns:
- Device binding status.
- Last successful server-received sync time.
- Pending/accepted/rejected event summaries available to the device.
- Current catalog/config cursor metadata.
- Required minimum APK version, if any.

Do not expose another Device's events or detailed personal data.

---

## 9. Cloud Control Plane machine API

All routes below are under `/control/v1`. They are called by a registered Private Server agent using mTLS or an equivalent deployment-scoped credential. They must not accept Business API user tokens or POS Device tokens.

### 9.1 Machine route catalogue

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/enrollments` | Enroll a new Private Server deployment using a one-time enrollment authorization |
| `GET` | `/deployments/me` | Read registered deployment identity and state |
| `POST` | `/deployments/me/heartbeat` | Submit deployment health/version heartbeat |
| `GET` | `/deployments/me/license` | Retrieve latest signed license entitlement |
| `POST` | `/deployments/me/license/renew` | Request renewal or fetch updated entitlement |
| `GET` | `/deployments/me/releases` | Fetch compatible release metadata |
| `POST` | `/deployments/me/events` | Report allowlisted lifecycle and operational events |
| `POST` | `/deployments/me/credentials/rotate` | Rotate deployment credentials using approved rotation flow |
| `POST` | `/deployments/me/decommission` | Request decommissioning after explicit authorization |

### 9.2 Enrollment

Enrollment is one-time and must be authorized by a provider-side provisioning action. The installation must generate its deployment identity and key pair locally. The private key must remain protected on the customer server.

Example request:

```json
{
  "enrollment_code": "<short-lived-one-time-enrollment-code>",
  "deployment_public_key": "<public-key-or-certificate-request>",
  "deployment_mode": "private",
  "product_version": "1.0.0",
  "organization_id": "0192b1d6-9c7e-7a10-b9b3-5a1a2f700020",
  "organization_code": "CUSTOMER-001",
  "installation_nonce": "<random-installation-nonce>"
}
```

Enrollment validation:
- Code is valid, unexpired, and single-use.
- Customer account and license contract are eligible.
- Deployment mode is `private`.
- Organization ID matches the provisioning authorization.
- The public key/certificate request is valid.
- The same enrollment code cannot register two deployments.

Response includes `deployment_id`, certificate/credential issuance information, registered Organization binding, and the initial signed license envelope. The response must never deliver the deployment private key.

### 9.3 Heartbeat

Example request:

```json
{
  "reported_at": "2026-11-03T02:15:00Z",
  "deployment_version": "1.0.0",
  "health_status": "healthy",
  "store_count": 3,
  "active_device_count": 5,
  "backup_status": {
    "last_success_at": "2026-11-03T01:00:00Z",
    "last_result": "success"
  },
  "capabilities": ["pos", "inventory", "reports"]
}
```

Heartbeat must be minimized. Do not send order lines, payment data, customer details, employee personal data, product catalog, or inventory-level details. Control Plane returns server receive time, deployment state, license refresh hint, and maintenance/update notices when available.

### 9.4 License retrieval and renewal

- `GET /deployments/me/license` returns the signed entitlement envelope and signing key ID.
- `POST /deployments/me/license/renew` requests renewal/refresh and may return `202` if provider-side review is required.
- Private Server verifies the signature locally with a trusted public key.
- The signed payload must bind `deployment_id` and `organization_id`.
- A license refresh response must not require a schema migration or interrupt open POS transactions.
- License enforcement policy is evaluated locally using cached signed entitlements and the configured grace policy.

### 9.5 Release metadata

`GET /deployments/me/releases` returns only compatible release metadata for the deployment's channel and current version:

- Version.
- Channel (`stable`, `preview`, `hotfix`).
- Deployment type compatibility.
- Minimum supported current version.
- Artifact reference from a trusted registry.
- SHA-256 checksum.
- Release notes.
- Whether manual approval/maintenance window is required.

A Private Server must verify artifact integrity and trusted provenance before installation. Control Plane should not issue arbitrary executable URLs in an untrusted payload.

---

## 10. Cloud Control Plane provider administration API

All routes below are under `/control/admin/v1`. They require provider administrator credentials, provider RBAC, stronger authorization for sensitive operations, and Control Plane audit logging.

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/customers` | List commercial customer accounts |
| `POST` | `/customers` | Create customer account |
| `GET` | `/customers/{customer_id}` | Read customer |
| `PATCH` | `/customers/{customer_id}` | Update customer |
| `GET` | `/plans` | List plans |
| `POST` | `/plans` | Create draft plan |
| `PATCH` | `/plans/{plan_id}` | Update plan/entitlements |
| `POST` | `/plans/{plan_id}/publish` | Publish plan version |
| `GET` | `/subscriptions` | List subscriptions/contracts |
| `POST` | `/subscriptions` | Create subscription/contract |
| `PATCH` | `/subscriptions/{subscription_id}` | Update commercial state |
| `GET` | `/deployments` | List Cloud and Private deployments |
| `GET` | `/deployments/{deployment_id}` | Deployment detail |
| `POST` | `/deployments/{deployment_id}/suspend` | Suspend deployment entitlement per policy |
| `POST` | `/deployments/{deployment_id}/resume` | Resume deployment |
| `POST` | `/deployments/{deployment_id}/revoke-credentials` | Revoke deployment credentials |
| `GET` | `/licenses` | List licenses |
| `POST` | `/deployments/{deployment_id}/licenses` | Issue signed license |
| `POST` | `/licenses/{license_id}/revoke` | Revoke license |
| `GET` | `/releases` | List software releases |
| `POST` | `/releases` | Publish release metadata after validation |
| `POST` | `/deployments/{deployment_id}/release-assignment` | Assign compatible release/channel |
| `GET` | `/audit-logs` | Query provider audit logs |

Provider administration must not provide unrestricted access to Private Server Business Data Plane databases. Support access to customer business data, if offered later, requires a separately approved, time-limited, audited support mechanism and customer authorization.

---

## 11. Realtime API (optional)

WebSocket is optional and must not be required for POS sales, local order persistence, or synchronization.

Suggested endpoint:

```text
wss://<business-host>/api/v1/realtime
```

Authentication:
- Prefer short-lived connection ticket obtained from `POST /api/v1/realtime/ticket`.
- Do not put long-lived access or refresh tokens in query strings.
- The server binds the connection to the verified Organization and allowed Store set.

Suggested channels/events:

| Event | Audience | Purpose |
|---|---|---|
| `order.created` | Authorized Organization Web users | New order notification |
| `order.updated` | Authorized Organization Web users | Order state change |
| `inventory.changed` | Authorized users/Devices | Inventory change notification |
| `device.status_changed` | Device administrators | Device online/offline/disabled state |
| `configuration.updated` | Authorized Devices | POS configuration invalidation hint |

Realtime events are notifications, not the authoritative transaction record. Clients must retrieve current data through REST APIs after receiving an event. A missed WebSocket event must not cause data loss.

---

## 12. API state machines and business invariants

### 12.1 Device lifecycle

```text
pending -> active -> disabled
pending -> revoked
active -> revoked
active -> pending (only through a controlled reactivation workflow)
```

- Activation codes are short-lived, one-time, hashed at rest, and rate-limited.
- A disabled or revoked Device cannot authenticate.
- Store reassignment is initiated by an authorized Organization user.
- Reassignment checks unsynchronized local orders before switching binding.
- Endpoint reassignment requires fresh activation against the new deployment.

### 12.2 Order lifecycle

Initial API status values follow the database schema:

- `draft`
- `completed`
- `cancelled`
- `partially_refunded`
- `refunded`

Normal POS create flow creates a posted/completed order only after the backend validates and commits it. A draft may be created by a future Web workflow, but a local unsynchronized cart is not a server-side draft order unless explicitly submitted as such.

Do not change a completed order's line items, prices, or totals directly. Use void/cancel policy before completion or an explicit refund/reversal after completion.

### 12.3 Payment lifecycle

Initial states from the database schema:

- `recorded_locally`
- `pending_authorization`
- `authorized`
- `captured`
- `failed`
- `cancelled`
- `refunded`
- `partially_refunded`

A cash payment captured locally under the configured offline policy may be synchronized later. An external card/gateway payment is only `authorized` or `captured` after a valid provider/terminal result is verified.

### 12.4 Stock adjustment lifecycle

- `draft` may be edited by authorized users.
- `posted` is immutable and creates stock movements.
- `voided` is only available through an explicit permission and policy; if the adjustment has already affected stock, create compensating movements rather than deleting posted movements.

### 12.5 License/deployment lifecycle

Private deployment lifecycle is managed by Control Plane and reflected locally:

```text
pending_enrollment -> active -> warning -> suspended/revoked -> decommissioned
```

A temporary network outage is not itself proof that the deployment license is invalid. Local enforcement follows the last valid signed entitlement and grace policy. Control Plane suspension/revocation takes effect locally when a fresh signed status/entitlement is received, subject to the offline enforcement contract.

---

## 13. Idempotency and concurrency

### 13.1 Idempotency header

Designated write routes require:

```http
Idempotency-Key: <unique-client-generated-value>
```

The key is scoped by Organization and operation. The server stores a canonical request hash and the resulting status/resource reference.

Rules:
- Same key + same request hash: replay the original result.
- Same key + different request hash: return `409 IDEMPOTENCY_KEY_REUSED`.
- Concurrent requests with the same key: one operation wins; the other waits/replays or receives a documented retryable conflict.
- Store idempotency metadata for a retention period appropriate to the operation; financial operations require longer retention than ephemeral UI actions.
- Do not depend on client retries being exactly once; design for at-least-once delivery with idempotent processing.

### 13.2 Required idempotency routes

At minimum:
- `POST /orders`
- `POST /orders/{order_id}/payments`
- `POST /orders/{order_id}/refunds`
- `POST /sync/push` (per-event idempotency remains mandatory)
- `POST /inventory/adjustments/{adjustment_id}/post`
- `POST /device-activations/exchange` (activation code single-use behavior)
- Control Plane enrollment and license-issuance operations

### 13.3 Concurrency

Use `If-Match`/ETag or a resource version for high-contention editable resources such as Products, price lists, Store settings, and draft stock adjustments. Server-side transactions and row locks protect final stock and payment posting. Return `412 PRECONDITION_FAILED` for stale version preconditions or a documented `409` conflict where ETag is not used.

---

## 14. Data validation and monetary rules

- Monetary JSON values are decimal strings, not binary floating-point numbers.
- Currency code is always explicit.
- Quantities are decimal strings where fractional units are supported.
- Backend recalculates/validates line totals, discounts, tax, order totals, and payment totals.
- Client-submitted price values are hints/snapshots, not authority to override server price policy.
- Historical order lines preserve snapshot product names, codes, variants, units, and prices.
- Tax behavior is market-configured and must not be enabled as a regulated invoicing feature until jurisdiction requirements are confirmed.
- Request models reject unknown security-sensitive fields where mass assignment could be possible.
- Server must enforce numeric precision, range, rounding, and currency rules before persistence.

---

## 15. Rate limits and payload limits

Initial engineering defaults, to be tuned after load testing:

| Route class | Initial limit guidance |
|---|---|
| Login / password recovery | Strict per IP + identifier rate limit |
| Activation exchange | Strict per IP + activation code rate limit |
| Normal authenticated reads | Per principal/device and per IP adaptive limit |
| Normal writes | Per principal/device and per Organization limit |
| Sync push | Max 50 events and 1 MiB per request initially |
| Catalog pull | Max 500 changes per page initially |
| Uploads | Per file type/size policy; pre-signed or controlled upload where supported |
| Reports/exports | Job concurrency and per-Organization quota |

All configurable limits must be documented. `429` responses should include `Retry-After` when possible. Never rely only on client-side throttling.

---

## 16. Security requirements

1. HTTPS is mandatory in production.
2. Private Server to Control Plane uses mTLS or equivalent deployment-scoped authentication.
3. Device credentials are scoped and revocable.
4. Organization tenant context is derived from the authenticated principal.
5. Store scope is verified on every Store-scoped operation.
6. Tenant isolation is enforced in service/repository layers and with PostgreSQL RLS defense in depth for Cloud.
7. Avoid returning `403` vs `404` in a way that leaks existence of cross-tenant resources; use a consistent concealment policy.
8. No credentials or tokens in query strings.
9. No secrets in QR codes, logs, or audit metadata.
10. Provider Admin endpoints require provider RBAC and audit.
11. Private Server Control Plane communication must not expose PostgreSQL/Redis or Docker management ports publicly.
12. Control Plane never receives Private Server transaction-level data by default.
13. Error responses must not disclose stack traces, SQL, tokens, hostnames, or private infrastructure details.
14. CORS origins must be allowlisted per deployment; do not use wildcard credentials.
15. Use CSRF protections for cookie-based browser sessions; bearer-token SPA storage strategy must be explicitly reviewed and avoid localStorage for long-lived refresh secrets.

---

## 17. Observability and request tracing

Every API response returns `request_id`. The backend logs the same correlation ID with:
- Route template, not raw sensitive query string.
- Actor type and non-secret actor identifier.
- Organization/Store context where applicable.
- Deployment ID for Private deployments.
- HTTP status and latency.
- Stable error code on failure.

Do not log authorization headers, passwords, token material, card data, or activation codes. Business event/audit logging is separate from technical request logging.

Private Server heartbeat telemetry must be aggregated and allowlisted. No product-level or transaction-level details are sent to Control Plane by default.

---

## 18. OpenAPI and contract governance

### 18.1 OpenAPI generation

The FastAPI Business API and Control Plane API must publish separate OpenAPI 3.1 documents:

- `/openapi/business-v1.json` or a protected build artifact.
- `/openapi/control-v1.json` or a protected build artifact.
- Provider admin API schema may be a separate protected document.

Production exposure of the schema endpoints is configurable. CI must still generate and validate the documents.

### 18.2 Contract requirements

- Define all request and response models with Pydantic.
- Define stable error codes in a central registry.
- Generate typed clients or SDK artifacts for TypeScript and Dart where appropriate.
- Use contract tests between backend and Web/APK clients.
- Breaking contract changes require explicit review and compatibility notes.
- Keep examples valid against the actual schemas.
- Do not treat a hand-written Markdown example as an executable contract; the OpenAPI artifact and automated tests are authoritative for implementation.

### 18.3 Compatibility policy

Within API v1:
- Adding optional response fields is backward-compatible.
- Adding a new endpoint is backward-compatible.
- Adding a new enum value may not be backward-compatible for exhaustive clients; coordinate client releases and define unknown-value handling.
- Removing/renaming fields, changing field types, changing requiredness, or changing status semantics is breaking.
- Breaking changes require a versioned rollout and deprecation window or a new major API path.

---

## 19. Test requirements

### 19.1 Business API tests

- Authentication and refresh-token rotation.
- Role/permission enforcement for every protected route.
- Organization and Store scope verification.
- Cloud cross-tenant isolation.
- Private single-Organization enforcement.
- Product and price list validation.
- Inventory adjustment posting and stock movement consistency.
- Order create/retry/idempotency.
- Payment authorization semantics.
- Refund quantity and amount limits.
- Cash session concurrency.
- Device activation, token rotation, disablement, and revocation.
- Cursor expiry and full-refresh recovery.

### 19.2 Control Plane tests

- Enrollment code expiry and single-use behavior.
- Deployment credential authentication and rotation.
- Deployment-to-customer/Organization binding.
- License signature validation and key rotation.
- Heartbeat allowlist validation.
- Release compatibility and artifact checksum validation.
- Revoked/suspended deployment behavior.
- Control Plane outage does not interrupt eligible local business operations.

### 19.3 Contract tests

- Validate every example payload against OpenAPI models.
- Verify Web and APK generated clients match the API schema.
- Verify old supported clients handle additive fields and unknown enum values safely.
- Test idempotency replay under concurrent requests.
- Test request limits and rate limiting.

---

## 20. Implementation sequence

1. Define Pydantic shared primitives: UUID, money string, timestamp, cursor page, response/error envelope.
2. Implement auth/session and tenant-resolution middleware.
3. Implement Organization/Store/User/RBAC endpoints.
4. Implement Products, Variants, Barcodes, Price Lists.
5. Implement Devices and activation lifecycle.
6. Implement Inventory and Stock Adjustments.
7. Implement Orders, Payments, Refunds, Cash Sessions.
8. Implement POS Bootstrap and Catalog Sync.
9. Implement Outbox batch ingestion and idempotency.
10. Implement Control Plane enrollment, heartbeat, license and release APIs.
11. Generate OpenAPI, build typed clients, and add contract tests.
12. Run Cloud multi-tenant and Private single-tenant acceptance suites.

Do not start parallel Web/Flutter integration against undocumented ad hoc endpoints. Publish and review the generated OpenAPI contract first.

---

## 21. Open decisions before production

These details must be finalized through hardware discovery, market requirements, or additional ADRs:

1. Minimum Android API level and supported device models.
2. Printer connectivity and vendor-specific SDK requirements.
3. Barcode scanner modes: camera, USB HID, Bluetooth HID.
4. Payment gateway and card-terminal integration contracts.
5. Offline inventory acceptance policy for each Organization.
6. Tax and electronic invoice requirements for the target jurisdiction.
7. Exact access/refresh/device token TTLs and session persistence implementation.
8. Final sync batch limits after real hardware/network tests.
9. Rate limits per plan and deployment tier.
10. API deprecation and old APK support window.
11. Whether report export uses background workers from the first commercial release.
12. Whether realtime WebSocket is enabled in the initial release or deferred.

Each resolved decision must be recorded in an ADR or updated technical specification.

---

## 22. Related documents

- `01-system-architecture.md` — deployment models, system boundaries, trust boundaries, offline architecture, and infrastructure.
- `02-database-schema.md` — Business Data Plane, Control Plane, and POS local data model.
- `04-cloud-control-plane.md` — Control Plane enrollment, licensing, heartbeat, subscriptions, and release lifecycle.
- `05-private-server-deployment.md` — Private Server install, update, backup, restore, and operations.
- `06-pos-offline-sync.md` — detailed Flutter local persistence, Outbox, replay, conflicts, and recovery.
- `07-security-and-licensing.md` — detailed identity, device trust, deployment credentials, signing, entitlement enforcement, and security controls.

---

## Final API contract statement

The POS Platform exposes two separate API trust domains:

1. **Business API** — serves Organization Web and Flutter POS for business operations. The same `/api/v1` contract is deployed in Cloud and Private modes. Cloud requests are tenant-scoped; Private requests are bound to one fixed Organization.
2. **Control Plane API** — serves Private deployment lifecycle and provider administration. Machine routes use deployment credentials; provider administration uses separate provider identity and permissions.

The Flutter APK connects only to its activated Business API endpoint for sales and business synchronization. It never uses Control Plane credentials and never manages Organizations or Stores. Private Server connects outbound to Cloud Control Plane for registration, license, heartbeat, and release metadata, but normal business transactions remain local to its Business Data Plane.

This separation is mandatory for the product's hybrid deployment model and is the basis for implementation, OpenAPI generation, client integration, and contract testing.
