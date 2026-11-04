# POS Platform — Security & Licensing Specification

**Document:** `07-security-and-licensing.md`  
**Version:** 1.0  
**Date:** 03 November 2026  
**Status:** Architecture Baseline — Proposed for Implementation  
**Applies to:** Cloud SaaS, Private Server, Cloud Control Plane, Organization Web, Super Admin Web, Flutter POS APK  
**Related documents:** `01-system-architecture.md`, `02-database-schema.md`, `03-api-specification.md`, `04-cloud-control-plane.md`, `05-private-server-deployment.md`, `06-pos-offline-sync.md`

---

## 1. Purpose

This document defines the security architecture, identity model, credential lifecycle, authorization rules, cryptographic key management, license model, threat controls, and security acceptance criteria for the POS Platform.

The platform has two business deployment models:

1. **Cloud SaaS:** multiple Organizations share the provider's Cloud Business Data Plane, with strict logical tenant isolation.
2. **Private Server:** one dedicated deployment serves exactly one Organization. The deployment may run on customer-owned infrastructure or provider-managed dedicated infrastructure.

Both deployment models use one shared product codebase and one Flutter POS APK. Every Private Server must enroll with and periodically communicate with the Cloud Control Plane for deployment identity, license lifecycle, release metadata, and operational status. Private business transactions must not synchronously depend on the Control Plane.

The security design must preserve the following properties:

- Confidentiality of customer and business data.
- Integrity and traceability of orders, payments, inventory movements, and license entitlements.
- Availability of local POS operations during temporary Internet or Control Plane outages.
- Isolation between Cloud Organizations and between Private Server customers.
- Least-privilege access for users, devices, deployments, and provider operators.
- Protection against duplicated offline transactions and replayed requests.
- Verifiable software and license provenance.
- Safe recovery, credential rotation, and incident response.

This document is an engineering baseline. It is not a certification, legal opinion, PCI DSS attestation, or guarantee that a deployment is secure without correct implementation, configuration, testing, and operations.

---

## 2. Security Principles

### 2.1 Secure by default

- Production endpoints require HTTPS.
- TLS certificate verification must never be disabled in production.
- Default passwords and shared credentials are prohibited.
- Administrative functions are denied unless explicitly authorized.
- Secrets are not stored in source code, container images, client bundles, or ordinary application settings.
- Sensitive actions are audited.
- Data access is scoped by authenticated identity and server-derived Organization/Store context.

### 2.2 Separate trust domains

The platform has separate identity and authorization domains:

- Provider administrators.
- Organization users.
- POS devices.
- Private Server deployments.
- License signing service.
- Software release signing pipeline.

A credential issued for one domain must not be accepted in another domain. In particular:

- An Organization User token is not a Control Plane machine credential.
- A POS Device token is not an Organization Admin token.
- A deployment certificate is not a user or device token.
- A license signature is not an authentication credential.
- A release artifact signature is not a license signature.

### 2.3 Local business availability, central commercial authority

The Cloud Control Plane is the authority for Private Server registration and commercial entitlement issuance. However, a Private Server uses its locally cached signed entitlement to continue permitted local business operations during temporary connectivity failures.

Mandatory Cloud connectivity means mandatory enrollment and periodic authenticated communication. It does not mean every sale, payment record, or inventory operation calls the Cloud Control Plane.

### 2.4 Minimize collected data

Private Server heartbeat and license traffic must contain only the operational metadata needed for licensing, support, and service health. Private business data must not be copied to the Control Plane as a side effect of heartbeat, license refresh, or release checks.

### 2.5 Explicitly distinguish status dimensions

Do not collapse these states into one generic status:

- Contract/commercial status.
- License entitlement status.
- Deployment connectivity status.
- Local application health.
- User/device authentication status.
- Business transaction status.

A missed heartbeat is not proof that a license was revoked. A license expiry is not proof that the local database is unhealthy. An offline order is not a server-accepted order until the backend acknowledges it.

---

## 3. Scope and Security Boundaries

### 3.1 Components

| Component | Trust boundary | Security responsibilities |
|---|---|---|
| Super Admin Web | Provider identity domain | Strong authentication, privileged access, approval and audit |
| Cloud Control Plane API | Provider service domain | Deployment registration, license lifecycle, release metadata |
| License Issuer | Highly restricted cryptographic domain | Sign entitlements; protect signing keys |
| Release Pipeline | Software supply-chain domain | Build provenance, artifact signing, release authorization |
| Cloud Business Backend | Cloud business domain | Tenant-scoped business API, Organization and Store authorization |
| Private Business Backend | Customer deployment domain | One-Organization business API, local authentication and authorization |
| Organization Web | User-facing business client | Secure session handling; never trusted as an authorization boundary |
| Flutter POS APK | Device endpoint | Device identity, secure token storage, local data protection, offline queue |
| Customer infrastructure | Customer/provider infrastructure boundary | Host, network, storage, operating system, Docker and backup security |

### 3.2 Data flow boundaries

1. Organization Web communicates with its Business Backend over HTTPS.
2. POS APK communicates with its configured Business Backend over HTTPS.
3. Private Server communicates outbound to the Control Plane over HTTPS with deployment-scoped authentication, preferably mTLS.
4. Provider administrative clients communicate with the Control Plane using provider identities and privileged authorization.
5. License Issuer signs entitlement payloads using a protected signing key. Private Servers receive only the signed entitlement and trusted verification keys.
6. Release pipeline publishes immutable, signed software artifacts and release metadata.

### 3.3 Network exposure rules

- Publicly expose only the required HTTPS reverse proxy/API entry points.
- Do not expose PostgreSQL, Redis, Docker Engine, database administration ports, or internal worker ports to the public Internet.
- Private Server Control Plane communication is outbound-only by default.
- Do not require inbound port-forwarding into a customer network for heartbeats, license refresh, or release discovery.
- Restrict internal container networks and service-to-service access.

---

## 4. Threat Model

### 4.1 Assets to protect

| Asset | Examples | Impact if compromised |
|---|---|---|
| Business data | Orders, payments, customer records, prices, inventory | Financial loss, privacy breach, operational disruption |
| Tenant boundaries | `organization_id`, Store scope | Cross-customer data exposure or modification |
| User credentials | Password hashes, sessions, refresh tokens | Account takeover |
| Device credentials | POS access/refresh tokens, device private keys if used | Unauthorized sales API access or device impersonation |
| Deployment credentials | Private Server identity certificate/private key | Deployment impersonation, license or metadata abuse |
| License signing key | Provider private signing key | Forged or unauthorized license entitlements |
| Release signing key | Software artifact signing key | Malicious or untrusted software distribution |
| Payment references | Gateway transaction IDs and terminal references | Fraud, reconciliation errors, privacy risk |
| Backups | Database and uploaded files | Broad data exposure or loss |
| Audit records | Privileged action and business event history | Loss of accountability or evidence |

### 4.2 Threat actors

- External attacker on the Internet.
- Malicious or compromised Organization user.
- Stolen or modified POS device.
- Compromised customer server or administrator account.
- Malicious or compromised provider administrator.
- Malicious dependency, build runner, container image, or update artifact.
- Network attacker attempting interception, replay, or downgrade.
- Accidental operator error, including incorrect tenant scope or secret exposure.

### 4.3 Threat scenarios and baseline controls

| Threat | Required controls |
|---|---|
| Cross-tenant data access | Server-derived tenant context, tenant-scoped data access, RLS defense in depth, isolation tests |
| Privilege escalation | RBAC, Store scope, server-side permission checks, deny by default |
| Credential theft | Short-lived access tokens, refresh-token rotation, secure storage, MFA for privileged roles |
| Device cloning | Device-scoped credential, revocation, activation controls, optional hardware-backed key storage |
| Deployment impersonation | Deployment-specific mTLS identity, locally generated private key, rotation and revocation |
| License forgery | Asymmetric signed entitlement; public-key verification on Private Server |
| License rollback | Signed issue/version sequence, persisted highest accepted sequence, trusted time, controlled recovery |
| Duplicate offline orders | Stable event IDs, idempotency keys, transactional Outbox, durable server acknowledgement |
| Payment replay | Provider idempotency/reference checks, payment state machine, immutable provider references |
| Malicious update | Signed artifacts, trusted registry, digest verification, staged deployment |
| Backup theft | Encryption, restricted access, separate destination, key management, restore controls |
| Log leakage | Secret redaction, access control, retention, structured logging |
| Cloud outage abuse | Cached entitlement and bounded grace period, clear state separation, alerts |
| Insider abuse | MFA, least privilege, dual approval for critical operations, immutable audit trail |

### 4.4 Threat modeling process

For each new module or externally exposed API:

1. Identify assets and data classifications.
2. Identify entry points, identities, and trust boundaries.
3. Enumerate threats using STRIDE or an equivalent method.
4. Define preventive, detective, and recovery controls.
5. Record accepted residual risks and the owner.
6. Add automated tests or operational verification for critical controls.

Security review is required for changes to authentication, authorization, tenant isolation, deployment enrollment, licensing, payments, offline sync, cryptographic keys, and software update mechanisms.

---

## 5. Data Classification and Handling

### 5.1 Classification levels

| Level | Examples | Handling |
|---|---|---|
| Public | Published product documentation, public release notes | May be public after approval |
| Internal | Non-secret operational metadata, internal architecture | Restricted to staff and authorized contractors |
| Confidential | Orders, customer details, employee records, business reports | Access controlled; encrypted in transit; protected at rest and in backups |
| Restricted Secret | Passwords, refresh tokens, device tokens, deployment private keys, signing keys, payment secrets | Dedicated secret storage, least privilege, redaction, rotation, strict audit |

### 5.2 Data minimization

The Control Plane should normally receive only:

- Deployment ID and customer/deployment reference.
- Organization binding identifier.
- Software version and release channel.
- License ID and license state.
- Last heartbeat timestamp.
- Coarse health state and approved resource summaries.
- Enrollment, key rotation, update, and license lifecycle events.

The Control Plane must not receive by default:

- Order lines or receipts.
- Customer names, addresses, or contact details.
- Employee personal data.
- Product catalog details.
- Payment card data or terminal secrets.
- Full database exports or backups.
- Raw business API request/response bodies.

Any future support feature that accesses business data requires a separate requirement, customer authorization, data-flow review, narrow access scope, time-bound access, and audit record.

### 5.3 Data retention

Retention periods must be configurable and documented in the customer agreement and privacy notice. Define distinct retention policies for:

- Business transactions.
- Authentication and security events.
- Provider Control Plane events.
- Operational telemetry.
- Backups and backup copies.
- Support bundles.
- Deleted or decommissioned deployments.

Do not use one global retention value for all data classes.

---

## 6. Identity and Authentication Architecture

### 6.1 Identity classes

| Identity | Used by | Credential | Allowed domain |
|---|---|---|---|
| Provider Admin | Super Admin Web | Provider user session | Control Plane administration |
| Organization User | Organization Web | User access/refresh tokens | Business API within authorized Organization/Store scope |
| POS Device | Flutter APK | Device access/refresh tokens | POS API within one Organization and bound Store |
| Private Deployment | Private Server agent | mTLS certificate or equivalent deployment credential | Control Plane machine API for that deployment |
| License Issuer | Signing service | Protected signing key | Sign license entitlements only |
| Release Signer | Release pipeline | Separate protected signing key | Sign release metadata/artifact provenance only |

Credentials from one identity class must never be accepted as another identity class.

### 6.2 User authentication

Recommended baseline:

- Passwords hashed using Argon2id with parameters selected from current infrastructure benchmarks and security review.
- Unique salts generated by the password hashing library.
- Passwords and reset tokens never logged.
- Access JWT lifetime: initial default 15 minutes.
- Refresh tokens: high-entropy opaque secrets, initially up to 30 days, with rotation and revocation.
- Store only a cryptographic hash of refresh tokens server-side.
- Refresh-token reuse revokes the affected token family and emits a security event.
- Support account lockout or adaptive rate limiting without allowing trivial denial-of-service against known accounts.
- Enforce MFA for provider administrators and strongly recommend it for Organization owners and finance/privileged roles.
- Require step-up authentication for sensitive actions such as changing payout/payment settings, assigning privileged roles, exporting sensitive data, and managing devices.

Token lifetimes are configuration-controlled policy defaults, not immutable protocol guarantees.

### 6.3 Password reset and account recovery

- Reset tokens must be cryptographically random, single-use, short-lived, and stored hashed.
- Do not reveal whether an email or username exists in public reset responses.
- Revoke active sessions according to the recovery policy after password reset.
- Notify the account owner of password and security changes.
- Provider support staff must not ask customers to disclose passwords or MFA recovery secrets.

### 6.4 Provider administrator identity

Provider identities must be stored and authorized separately from Organization users.

Roles should be granular, for example:

- `platform_support_readonly`
- `platform_operations`
- `customer_commercial_admin`
- `license_operator`
- `release_manager`
- `security_admin`
- `platform_super_admin`

A single broad superuser role should not be the day-to-day default. High-impact operations require step-up authentication and, where commercially appropriate, approval by a second authorized person.

### 6.5 Session management

- Rotate refresh tokens on each successful refresh.
- Track session/device metadata without collecting unnecessary personal information.
- Revoke sessions on logout, account disablement, credential reset, or suspicious activity according to policy.
- Use secure, HttpOnly, SameSite cookies for browser sessions where applicable; avoid storing long-lived browser credentials in localStorage.
- Apply CSRF protections when cookie-based authentication is used.
- Use strict CORS allowlists; do not use wildcard origins with credentials.

---

## 7. Authorization and Tenant Isolation

### 7.1 Authorization model

Use RBAC with explicit resource scope:

- Platform scope.
- Organization scope.
- Store scope.
- Device scope.
- Deployment scope.

Authorization must be checked on the server for every protected operation. Hiding buttons in the Web UI or restricting Flutter screens is not authorization.

### 7.2 Cloud tenant context

Cloud Business Backend must derive `organization_id` from a validated user membership or device assignment. A client-supplied `organization_id` is a selector at most and must never grant access.

Required processing order:

1. Validate credential and session status.
2. Resolve identity class.
3. Resolve active Organization membership or device assignment.
4. Resolve Store scope where the resource is Store-bound.
5. Check permission.
6. Execute tenant-scoped business operation.
7. Record required audit event.

### 7.3 Private Server scope

Private Server has one fixed Organization ID configured during installation. The backend must reject references to another Organization and must not expose Organization creation/switching through normal business APIs.

### 7.4 PostgreSQL Row Level Security

RLS is defense in depth, not a replacement for application authorization.

Implementation requirements:

- Use separate, non-owner application database roles where practical.
- Ensure the application role cannot bypass RLS.
- Set tenant context transaction-locally, never as unscoped persistent connection state.
- Use `SET LOCAL` or transaction-scoped `set_config` on the same connection as the query.
- Reset/re-establish scope safely when using connection pools.
- Define and test policies for every tenant-scoped table.
- Ensure background jobs establish explicit tenant context.
- Test missing tenant context and cross-tenant access fail closed.

Example concept only:

```sql
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders FORCE ROW LEVEL SECURITY;

CREATE POLICY orders_tenant_policy ON orders
USING (
  organization_id = current_setting('app.organization_id', true)::uuid
)
WITH CHECK (
  organization_id = current_setting('app.organization_id', true)::uuid
);
```

The production policy must handle an unset or invalid tenant setting safely. Validate exact behavior in integration tests with the application's actual database role and connection pool.

### 7.5 Store authorization

Store scope must be enforced in addition to Organization scope. A user authorized for Store A must not access Store B merely by changing a URL or request payload. Multi-store roles must have explicit assignments and permissions.

---

## 8. POS Device Security

### 8.1 Device provisioning

- Organization Admin creates a device record and selects one Store.
- Backend issues a short-lived, single-use activation challenge.
- QR code contains endpoint and activation challenge only; no permanent credential.
- APK validates the server TLS certificate before submitting the challenge.
- Backend checks license/device limits, activation expiry, Store status, and device status.
- Successful activation issues device-scoped credentials.

### 8.2 Device credential requirements

- Device tokens must be distinct from user tokens.
- Bind credentials to deployment (where applicable), Organization, Store, and Device ID.
- Device credentials cannot access Organization administration APIs.
- Store only hashes of opaque refresh tokens on the server.
- Store tokens on Android using Android Keystore-backed secure storage where supported.
- Never store device tokens in ordinary preferences, logs, crash reports, or exported backups.
- Support token rotation, revocation, and reactivation.

### 8.3 Device reassignment

Changing Store assignment must be initiated by an authorized Organization user. Before reassignment:

1. Device reports pending Outbox count and synchronization state.
2. Server and admin verify unresolved offline orders are handled or explicitly accepted as a controlled exception.
3. Old device session is revoked.
4. Store binding changes through an audited operation.
5. Device obtains updated configuration and credentials.

Changing deployment endpoint is a separate re-pairing operation and must not silently transfer existing local business data to another deployment.

### 8.4 Lost or stolen device

Admin can revoke the device immediately at the Business Backend. When online, the APK receives or discovers revocation and locks protected functions. While offline, remote revocation cannot be delivered; local data minimization, device screen lock, Android OS security, short token lifetime, and eventual synchronization reduce exposure but do not make revocation instantaneous.

### 8.5 Local data protection

- Minimize personal/customer data cached on the POS.
- Define local retention and cleanup rules for synchronized transactions.
- Use device encryption and OS screen lock.
- Do not store card PAN, CVV, PIN, track data, or raw terminal credentials.
- Consider encrypted SQLite for deployments with elevated endpoint risk; document key storage and recovery behavior before adopting it.
- Do not claim encryption-at-rest protection if the database key is stored beside the database without hardware-backed protection.

---

## 9. Private Deployment Identity and mTLS

### 9.1 Key generation

The Private Server must generate its deployment private key locally during enrollment. The private key must never be transmitted to the provider.

Recommended controls:

- Use an approved cryptographic library and secure random generator.
- Use a unique key pair per deployment.
- Store the private key in an OS-protected secret store, HSM, or restricted file secret where supported.
- Restrict read permissions to the deployment agent/service identity.
- Exclude private keys from source control, container images, installation reports, and ordinary backups unless the recovery design explicitly requires an encrypted protected copy.

### 9.2 Certificate identity

The certificate or credential must bind to:

- `deployment_id`.
- Provider-approved audience/service identity.
- Key ID or certificate serial.
- Validity period.
- Permitted Control Plane machine operations.

Do not allow a deployment credential to call another deployment's APIs.

### 9.3 mTLS requirements

- Validate the provider server certificate chain and hostname.
- Present the deployment certificate for machine authentication.
- Restrict accepted client certificate authorities and identities.
- Do not accept expired, revoked, or untrusted certificates.
- Define certificate renewal before expiry.
- Keep machine API authorization separate from TLS authentication; a valid certificate authenticates a deployment but does not authorize arbitrary provider administration.

### 9.4 Credential rotation

Recommended overlap workflow:

1. Private Server creates a new key pair locally.
2. It submits a certificate signing/rotation request authenticated with the current credential.
3. Control Plane verifies deployment state and rotation authorization.
4. Control Plane issues a new certificate.
5. Private Server validates the new credential and performs a test request.
6. Control Plane and Private Server record the transition.
7. Old credential is revoked after the overlap window.

Emergency revocation may bypass overlap. Every rotation and revocation is audited.

### 9.5 Recovery

If the deployment key is lost:

- The customer/provider must follow a documented identity recovery process.
- Verify customer ownership using the commercial support process.
- Re-enroll or rotate the deployment identity.
- Preserve existing business data and database identity.
- Invalidate the lost credential.
- Audit the recovery and notify designated customer administrators.

Never recover by asking the customer to send an unencrypted private key to support.

---

## 10. Cryptographic Key Management

### 10.1 Key separation

Use different keys for different purposes. At minimum separate:

1. License signing key.
2. Release/artifact signing key.
3. JWT signing key.
4. Deployment mTLS CA/issuance key or certificate service key.
5. Database encryption/backup encryption keys where used.
6. Application secret encryption keys where used.

Never reuse the license signing key as a JWT signing key, release signing key, or TLS key.

### 10.2 License signing key

- Use an approved asymmetric signature scheme such as Ed25519 after library and runtime compatibility review.
- The private signing key must remain in a protected provider signing environment, preferably HSM/KMS-backed or an equivalently controlled isolated signer.
- Only the signing service should have signing permission.
- Super Admin Web must request signing through an authorized backend workflow; it must never access the raw private key.
- Private Servers contain trusted public verification keys only.
- Every signed license includes `key_id` for key selection and rotation.

### 10.3 Release signing key

Release signing is independent from license signing. The artifact pipeline must sign release metadata or artifact provenance and publish immutable image digests. Private Server verifies signatures and digests before installing updates.

### 10.4 JWT signing key

- Keep the JWT signing key in a dedicated secret-management boundary.
- Define accepted algorithms explicitly; do not trust the JWT header to choose arbitrary algorithms.
- Validate issuer, audience, expiry, not-before, token type, and key ID.
- Support overlap rotation with active and retiring verification keys.
- Do not put secrets or unnecessary personal data in JWT claims.

### 10.5 Key inventory

Maintain a key register containing:

- Key ID and purpose.
- Algorithm and parameters.
- Owner and approver.
- Storage location/security boundary.
- Created/activated/retired timestamps.
- Rotation schedule.
- Revocation state.
- Services and versions that trust the key.
- Recovery and compromise procedure.

Do not include private key bytes in the register.

### 10.6 Rotation and emergency response

Rotation must be tested before production. A rotation plan must cover:

- Publishing a new public key to verifiers.
- Supporting old and new key IDs during overlap.
- Issuing new signatures with the new key.
- Re-signing or replacing affected credentials where applicable.
- Retiring and revoking the old key.
- Emergency key compromise, including deployment and customer communication.

If a private signing key is compromised, stop using it, identify potentially affected entitlements/artifacts, publish trusted-key changes, reissue valid licenses, and follow the incident response plan.

---

## 11. License Architecture

### 11.1 License authority

The Cloud Control Plane is the authority for Private Server license issuance, renewal, suspension, and revocation state. A Private Server verifies the signed entitlement locally.

The license is an entitlement snapshot, not a replacement for user/device authorization or business validation.

### 11.2 License binding

A Private Server license must be bound to:

- `license_id`.
- `customer_id`.
- `deployment_id`.
- `organization_id`.
- Product edition.
- Feature entitlements.
- Resource limits.
- Issue time and expiry time.
- License sequence/version.
- Signing `key_id`.

A license for one deployment or Organization must not be accepted by another deployment.

### 11.3 Signed license envelope

Illustrative payload:

```json
{
  "schema_version": 1,
  "license_id": "lic_001",
  "customer_id": "customer_001",
  "deployment_id": "dep_customer_001",
  "organization_id": "org_001",
  "edition": "enterprise",
  "features": ["pos", "inventory", "reports"],
  "limits": {
    "max_stores": 10,
    "max_devices": 50
  },
  "sequence": 3,
  "issued_at": "2026-11-03T00:00:00Z",
  "not_before": "2026-11-03T00:00:00Z",
  "expires_at": "2027-11-03T00:00:00Z",
  "key_id": "license-signing-2026-01"
}
```

The envelope must include a detached or embedded signature over a canonical serialization. Canonicalization rules, character encoding, field ordering/normalization, and signature encoding must be specified and tested across the issuer and validator implementations.

Do not sign a JSON string whose serialization may change between services without an explicit canonicalization procedure.

### 11.4 License validation sequence

Private Server verifies:

1. Envelope parses using the supported schema version.
2. `key_id` maps to a currently trusted public key.
3. Signature is valid over the canonical payload.
4. `deployment_id` matches the local deployment identity.
5. `organization_id` matches the installation binding.
6. `not_before` and expiry policy are satisfied.
7. Sequence is not older than the highest accepted sequence, except through an explicitly authorized recovery workflow.
8. Edition and features are recognized.
9. Resource limits are enforceable by the local backend.
10. Revocation/suspension state from the most recent authenticated Control Plane contact is applied.

The local cache stores the signed envelope and validation metadata. It must not replace the signature-bearing entitlement with a locally editable unsigned copy.

### 11.5 License lifecycle

Recommended states:

- `draft`
- `issued`
- `active`
- `warning`
- `expired`
- `suspended`
- `revoked`
- `superseded`

Commercial contract status, license state, and deployment connectivity must remain separate fields/dimensions.

### 11.6 Refresh and grace policy

Initial engineering defaults from the architecture baseline:

| Policy | Initial value |
|---|---:|
| Deployment heartbeat | Every 5 minutes |
| License refresh attempt | Every 6 hours |
| Connectivity warning | After 24 hours |
| Escalated warning | After 72 hours |
| Cached entitlement grace | 7 days after last successful validation |

These are initial policy defaults, not final contractual service terms.

During a temporary Control Plane outage:

- Continue local authentication and authorized business operations.
- Continue POS sales according to local payment and offline policies.
- Keep existing local device credentials usable until their locally enforced expiry/revocation checks, subject to business security policy.
- Retry heartbeat and license refresh with bounded exponential backoff and jitter.
- Display warnings to administrators.
- Disable new deployment enrollment and other Cloud-dependent operations.

When the configured grace period expires, recommended behavior is to block new device activations, new provisioning, and use beyond licensed limits. Preserve data, reporting access, export, and active transaction completion. The exact policy must be disclosed in the customer contract and configuration.

### 11.7 Revocation semantics

Immediate revocation of an offline Private Server cannot be guaranteed. The Control Plane must distinguish:

- Revocation requested.
- Revocation published/available.
- Revocation delivered to deployment.
- Deployment acknowledgement received.

A provider action must not be shown as “delivered” until the Private Server has acknowledged it. When the Private Server next authenticates, it receives the current policy and applies it. Business data must not be deleted on license revocation.

### 11.8 License limits

Enforce limits server-side for:

- Number of Stores.
- Number of active POS Devices.
- Licensed modules/features.
- Other contract-defined capacities.

Define whether a device in `revoked`, `disabled`, or `decommissioned` state consumes a seat. Define how temporary migration devices and replacement hardware are handled. Do not enforce limits solely in the Flutter UI.

---

## 12. Release and Software Supply-Chain Security

### 12.1 Build pipeline

- Use protected branches and reviewed pull requests.
- Require automated tests and security checks before release.
- Pin dependencies and use lockfiles.
- Scan dependencies and container images for known vulnerabilities.
- Generate a Software Bill of Materials (SBOM) for releases.
- Build artifacts in controlled CI environments.
- Sign release metadata/artifact provenance with a release key separate from license signing.
- Publish immutable images by digest.

### 12.2 Private Server update verification

Before update:

1. Fetch release metadata from an approved registry.
2. Validate release signature/provenance.
3. Verify artifact digest.
4. Check deployment's supported upgrade path.
5. Verify required disk space and health preconditions.
6. Create and verify a backup according to policy.
7. Apply update and migration in a controlled window.
8. Run health and compatibility checks.
9. Record outcome and version.

Never silently replace artifact bytes under an existing version and digest.

### 12.3 Dependency management

- Review open-source licenses for commercial use and distribution obligations.
- Prefer maintained dependencies with active security response.
- Track transitive dependency versions.
- Define patch response targets by severity.
- Remove unused dependencies and development tools from production images.

---

## 13. API and Application Security

### 13.1 General API controls

- Validate request schemas and content types.
- Enforce maximum payload size and upload size.
- Apply rate limits by identity, endpoint, and IP where appropriate.
- Use strict CORS allowlists.
- Prevent mass assignment by explicit request schemas.
- Return safe, stable error codes; do not expose stack traces or secrets.
- Use request IDs and structured audit metadata.
- Reject unsupported content types and malformed identifiers.
- Apply pagination limits and query complexity limits.

### 13.2 Browser security

- Use secure session cookies where applicable: `Secure`, `HttpOnly`, and appropriate `SameSite`.
- Apply CSRF defense for cookie-authenticated state-changing requests.
- Apply a restrictive Content Security Policy (CSP) after validating application requirements.
- Avoid unsafe HTML rendering and untrusted template interpolation.
- Prevent open redirects.
- Do not store long-lived refresh tokens in localStorage.
- Use dependency scanning for frontend packages.

### 13.3 File upload security

- Restrict allowed types and sizes.
- Do not trust file extensions or user-supplied MIME types alone.
- Validate file content where supported.
- Generate server-side object names.
- Store uploads outside executable web roots.
- Scan uploaded files where appropriate.
- Enforce Organization/Store authorization on every file retrieval.
- Use short-lived signed download URLs when object storage is used.

### 13.4 Payment security

- Never store card PAN, CVV, PIN, magnetic-stripe data, or raw terminal credentials.
- Store only safe provider references, tokenized handles, and required reconciliation metadata.
- Do not interpret a locally recorded offline payment as proof of external authorization.
- Verify payment callback signatures and provider event IDs.
- Use idempotency and immutable payment state transitions.
- Restrict access to payment settings and credentials.
- Use a payment provider/terminal architecture whose compliance obligations are independently assessed. Do not claim the POS Platform itself is PCI DSS certified unless formally assessed and certified as applicable.

### 13.5 Business integrity

- Orders and completed payments must be auditable.
- Avoid destructive edits to completed transactions; use void, refund, adjustment, or reversal workflows.
- Inventory changes must be represented by stock movements.
- Price and discount overrides require explicit permissions and audit history.
- Server-side totals and tax calculations are authoritative for accepted online transactions.
- Preserve sale-time price/tax snapshots for historical integrity.

---

## 14. Encryption and Secret Management

### 14.1 Data in transit

- HTTPS required for browser, POS, Business API, and Control Plane communication.
- Support TLS 1.2 or newer; prefer TLS 1.3 where supported by the full client/server environment.
- Validate certificate chain and hostname.
- Do not bypass certificate validation in APK or backend clients.
- Use mTLS for Private Deployment to Control Plane communication where supported.

### 14.2 Data at rest

- Use encrypted storage volumes where supported by the deployment environment.
- Protect database backups with encryption independent from primary disk encryption.
- Restrict database and file permissions.
- Consider field-level encryption only for fields whose threat model requires it, and define key rotation and search implications first.
- Protect SQLite and local POS data according to device risk and local data retention policy.

### 14.3 Secret storage

Secrets include:

- Database passwords.
- Application secret keys.
- JWT signing keys.
- Refresh-token hashes/pepper where used.
- Deployment private keys.
- License signing private keys.
- Release signing keys.
- Payment provider secrets.
- Backup encryption keys.

Use a dedicated secret manager, KMS/HSM, Docker secrets, or tightly permissioned secret files according to environment capability. Do not store secrets in `.env` committed to source control, source maps, frontend bundles, container build args, logs, or installation reports.

### 14.4 Secret rotation

Define owners, expiry, rotation method, overlap window, and emergency revocation for every secret class. Rotate compromised secrets immediately and routine credentials on a defined schedule based on risk and operational support.

---

## 15. Logging, Audit, Monitoring, and Alerting

### 15.1 Security audit events

At minimum record:

- Login success/failure and MFA events.
- Password reset and security setting changes.
- Role/permission changes.
- Organization and Store configuration changes.
- Device activation, reassignment, and revocation.
- License issue, renew, suspend, and revoke.
- Deployment enrollment and credential rotation.
- Release publication and update result.
- Sensitive export and restore operations.
- Backup failures and restore events.

### 15.2 Log redaction

Never log:

- Passwords.
- Access/refresh tokens.
- Activation codes.
- Deployment private keys or private signing keys.
- License signing material.
- Full payment secrets.
- Full authorization headers.
- Unnecessary customer personal data.

Logs should include request ID, actor/identity ID, Organization/Store/deployment scope where applicable, event type, outcome, and timestamp.

### 15.3 Alerting

Recommended alerts:

- Repeated login failures or suspicious refresh-token reuse.
- Privileged role grant or provider admin change.
- Cross-tenant access denial spikes.
- Device activation anomalies.
- Deployment credential expiry/rotation failure.
- License approaching expiry or grace state.
- Deployment heartbeat missing for 24 hours and 72 hours.
- Unexpected deployment version or unverified artifact.
- Failed backup or restore verification.
- Unusual export volume.
- High-severity dependency or container vulnerability.

### 15.4 Time synchronization

All production hosts and devices should use trusted time synchronization. Time is required for TLS, token expiration, license validation, audit ordering, and backup scheduling. Detect and alert on significant clock drift.

---

## 16. Backup, Recovery, and Incident Handling

### 16.1 Backup requirements

- Encrypt backups in transit and at rest.
- Restrict backup read/write identities.
- Separate backup destination from the primary host where possible.
- Maintain documented retention by customer tier and contract.
- Test restoration regularly.
- Include database, uploaded business files, required configuration, and documented deployment recovery material.
- Do not include plaintext secrets or unprotected private keys in ordinary backup archives.

### 16.2 Recovery controls

- Restore to a clean or isolated environment first where practical.
- Verify database integrity and application version compatibility.
- Verify Organization/deployment binding.
- Re-establish deployment identity using the documented recovery workflow if credentials cannot be safely restored.
- Reconcile backup and Outbox/sync state to avoid duplicate or missing transactions.
- Record the recovery and notify designated customer contacts.

### 16.3 Incident severity

| Severity | Example | Response expectation |
|---|---|---|
| Critical | License signing key compromise, confirmed cross-tenant breach, malicious release | Immediate incident command, contain, preserve evidence, customer impact assessment |
| High | Deployment credential compromise, privileged account takeover, payment secret exposure | Urgent containment and credential rotation |
| Medium | Repeated suspicious login attempts, isolated device token abuse | Investigate, revoke affected credentials, monitor |
| Low | Misconfiguration without confirmed data exposure | Correct configuration and record preventive action |

Exact response-time commitments belong in the internal incident response plan and customer agreements.

### 16.4 Incident workflow

1. Detect and classify.
2. Assign incident commander and technical owner.
3. Preserve relevant logs and evidence.
4. Contain access or affected systems without unnecessary business data destruction.
5. Rotate/revoke compromised credentials and keys as appropriate.
6. Assess scope and customer impact.
7. Restore trusted operation.
8. Notify affected parties according to contract and applicable law.
9. Conduct root-cause analysis and track corrective actions.

---

## 17. Privacy and Customer Data Boundary

### 17.1 Private Server boundary

Private Server business records remain in the customer's deployment. Enrollment, heartbeat, license refresh, and release discovery must not automatically transmit order details, customer data, employee data, or product catalog data to the provider.

### 17.2 Support access

Any support process that requires temporary access to customer business data must have:

- Explicit customer authorization.
- Narrowly scoped access.
- Time-bound access.
- Named support operator.
- Audit logging.
- Documented revocation.
- A clear description of what data is accessed and why.

### 17.3 Telemetry

Telemetry must be minimized and documented. The customer contract and privacy documentation must state what is collected, why, retention period, and whether it is optional. Avoid transmitting user identifiers or customer-level business data when aggregate operational metadata is sufficient.

---

## 18. Security Testing and Acceptance Criteria

### 18.1 Authentication tests

- Expired, malformed, wrong-issuer, wrong-audience, and wrong-type JWTs are rejected.
- Refresh-token rotation invalidates the old token.
- Refresh-token reuse triggers token-family revocation and an audit event.
- Disabled users cannot create new sessions.
- MFA is enforced for designated privileged roles.

### 18.2 Authorization and tenant tests

- Organization A cannot read or mutate Organization B records.
- Store-scoped users cannot access unassigned Stores.
- POS Device tokens cannot call Organization administration APIs.
- Private Server requests cannot use a different Organization ID.
- RLS fails closed when tenant context is missing.
- Background jobs cannot accidentally run unscoped across tenants.

### 18.3 Device tests

- Activation codes expire and are single-use.
- Activation cannot exceed license limits.
- Reassignment revokes old credentials and requires explicit authorization.
- Revoked device credentials fail after the revocation reaches the device/backend path.
- Device tokens are never written to logs or ordinary local preferences.

### 18.4 Deployment tests

- Private Server generates its private key locally.
- Deployment private key is never sent to the provider.
- mTLS authenticates only the registered deployment identity.
- A deployment cannot access another deployment's Control Plane resources.
- Certificate rotation and emergency revocation work.
- Heartbeat failure does not masquerade as license revocation.

### 18.5 License tests

- Invalid signature is rejected.
- Unknown key ID is rejected.
- Wrong deployment or Organization binding is rejected.
- Expired and not-yet-valid licenses follow policy.
- Older license sequence is rejected unless a documented recovery exception is used.
- Tampered limits/features are rejected.
- Offline validation works within the defined grace period.
- Expired grace policy preserves data and transaction completion while applying the documented restrictions.
- Revocation delivery is not marked acknowledged until deployment confirmation.

### 18.6 Supply-chain tests

- Release signature verification fails for modified artifacts.
- Digest mismatch prevents installation.
- Unsupported upgrade paths are rejected.
- Production images exclude unnecessary build tools and secrets.
- SBOM is generated and stored with release metadata.

### 18.7 Operational tests

- Backup is encrypted and can be restored.
- Restored Private Server preserves the correct Organization and deployment binding or follows an approved re-enrollment process.
- Incident key rotation can be performed without exposing private key material.
- Logs are checked for token/password/secret leakage.
- Clock drift is detected.

---

## 19. Security Configuration Baseline

The following values are initial engineering defaults and must be validated in staging before production:

| Control | Initial baseline |
|---|---|
| User access JWT | 15 minutes |
| User refresh token | Up to 30 days, rotating |
| Password hashing | Argon2id |
| MFA | Required for provider admins; strongly recommended for Organization admins |
| Transport | HTTPS, TLS 1.2+; prefer TLS 1.3 |
| Private deployment auth | mTLS |
| License signature | Ed25519, subject to library/runtime review |
| Deployment heartbeat | Every 5 minutes |
| License refresh | Every 6 hours |
| Connectivity warning | 24 hours |
| Escalated warning | 72 hours |
| Cached entitlement grace | 7 days after successful validation |
| Authorization | RBAC + Organization/Store/Device/Deployment scope |
| Tenant defense | Tenant-scoped queries + PostgreSQL RLS |
| Audit | Critical security and business actions |
| Backup | Encrypted; schedule and retention per service tier |

These defaults are not contractual guarantees. Exact values must be configurable, versioned, reviewed, and disclosed where they affect customers.

---

## 20. Security Ownership Matrix

| Area | Provider responsibility | Customer responsibility in customer-owned Private Server |
|---|---|---|
| Cloud Control Plane | Full operation and security | None |
| License signing key | Protect and rotate | None |
| Release signing and artifacts | Protect build/release pipeline | Verify and approve installation according to operating agreement |
| Private Server application | Secure code and supported updates | Apply updates under agreed responsibility model |
| Host OS | Only for provider-managed server | Patch, harden, and monitor host |
| Network/firewall | Provider network | Customer network/firewall and DNS |
| Database | Secure application behavior and schema | Host availability, disk and access policy as agreed |
| Backups | Tooling and documented procedures | Destination, retention, monitoring where contract assigns |
| User accounts | Secure authentication implementation | Manage employee accounts and access appropriately |
| POS devices | Secure APK and token lifecycle | Physical protection, OS updates, device access controls |

Provider-managed dedicated infrastructure assigns host/network/backup responsibilities according to the service contract. The contract must avoid ambiguous shared responsibility.

---

## 21. Open Decisions Requiring Product or Security Approval

The following items must be finalized before production release:

1. Whether Organization Admin MFA is mandatory for all customers or configurable by plan.
2. Exact access/refresh token TTLs and session revocation behavior.
3. License grace and post-grace restrictions by commercial edition.
4. License revocation policy for overdue, terminated, or fraud-related contracts.
5. Supported Android versions and use of hardware-backed Keystore features.
6. Whether SQLite encryption is required for all devices or selected higher-risk deployments.
7. Formal cryptographic library and canonical license-envelope format.
8. HSM/KMS provider and key custody operating procedure.
9. Certificate authority and private deployment certificate renewal policy.
10. Customer support access and consent workflow.
11. Backup encryption key ownership and recovery procedure.
12. Data retention and deletion policies per customer agreement and applicable law.
13. Incident notification contacts and contractual notification windows.
14. Security patch severity targets and release windows.
15. Independent penetration testing scope and frequency.

Each decision must be recorded in an ADR or an approved security policy before implementation is treated as production-ready.

---

## 22. Definition of Done

The Security & Licensing baseline is ready for production consideration only when:

- Authentication and identity domains are implemented separately.
- Tenant and Store isolation tests pass.
- Privileged users are protected with MFA and step-up controls.
- Device activation, token rotation, and revocation are tested.
- Private Server enrollment and mTLS are implemented and tested.
- License issuer private keys are protected in a restricted signing environment.
- Private Server validates signed license envelopes offline.
- Key rotation and recovery runbooks have been tested.
- Release artifacts are verifiable and immutable by digest.
- Sensitive information is redacted from logs and reports.
- Backup encryption and restore procedures have been tested.
- Incident response responsibilities are assigned.
- Customer/provider security responsibilities are documented.
- Open decisions that block production are resolved or formally risk-accepted.

---

## 23. Related Documents

- `01-system-architecture.md` — overall architecture and deployment boundaries.
- `02-database-schema.md` — business and Control Plane data model.
- `03-api-specification.md` — user, device, business, and machine API contracts.
- `04-cloud-control-plane.md` — deployment registry, licensing, heartbeat, and release service.
- `05-private-server-deployment.md` — installation, network, backup, and update operations.
- `06-pos-offline-sync.md` — local storage, Outbox, idempotency, and payment synchronization.

---

## Final Security Architecture Statement

The POS Platform uses distinct trust domains for provider administrators, Organization users, POS devices, Private Server deployments, license signing, and release signing.

Cloud SaaS enforces multi-tenant isolation. Private Server isolates one Organization per deployment and authenticates to Cloud Control Plane for commercial and operational lifecycle management. A locally cached signed entitlement supports bounded offline operation during temporary connectivity failures.

Business authorization remains local to the Business Data Plane. License entitlement does not grant user or device permissions. Device authentication does not grant Organization administration. Deployment authentication does not grant provider administrative access.

The provider protects signing and release infrastructure; customer-owned Private Server operators protect their host, network, data, and backups according to the agreed shared-responsibility model.

Security is verified through automated isolation, authentication, license, device, offline, supply-chain, backup, and recovery tests before production release.
