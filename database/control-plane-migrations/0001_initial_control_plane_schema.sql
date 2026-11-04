-- ============================================================================
-- Migration: 0001_initial_control_plane_schema.sql
-- Scope: Cloud Control Plane Database (pos_control_plane)
-- Reference: docs/02-database-schema.md (Section 8) & docs/04-cloud-control-plane.md
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- The Control Plane schema is managed separately from the Business Data Plane
-- and runs under the non-superuser `control_app` PostgreSQL role.
-- All 13 `control_*` tables are defined in `apps/control-plane/control_app/models.py`:
--   1. control_admin_users
--   2. control_customers
--   3. control_plans
--   4. control_subscriptions
--   5. control_deployments
--   6. control_deployment_instances
--   7. control_enrollment_authorizations
--   8. control_deployment_credentials
--   9. control_licenses
--  10. control_license_revocations
--  11. control_heartbeats
--  12. control_releases
--  13. control_audit_logs

