-- ============================================================================
-- Migration: 0001_initial_business_schema_and_rls.sql
-- Scope: Business Data Plane (Cloud Multi-Tenant & Private Single-Tenant)
-- Reference: docs/02-database-schema.md (Sections 7, 10, 12, 13)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Helper function to evaluate transaction-local tenant context safely
CREATE OR REPLACE FUNCTION app_current_organization_id() RETURNS varchar AS $$
    SELECT NULLIF(current_setting('app.organization_id', true), '');
$$ LANGUAGE sql STABLE;

-- Enable & Force PostgreSQL Row-Level Security across all tenant-scoped tables
DO $$
DECLARE
    tbl text;
    tenant_tables text[] := ARRAY[
        'stores',
        'store_counters',
        'users',
        'organization_memberships',
        'roles',
        'user_role_assignments',
        'user_store_assignments',
        'auth_sessions',
        'devices',
        'device_activations',
        'device_tokens',
        'device_events',
        'categories',
        'products',
        'product_variants',
        'product_barcodes',
        'price_lists',
        'price_list_items',
        'store_price_list_assignments',
        'tax_rates',
        'inventories',
        'stock_movements',
        'stock_adjustments',
        'stock_adjustment_items',
        'orders',
        'order_items',
        'order_discounts',
        'order_tax_lines',
        'payment_methods',
        'payments',
        'refunds',
        'refund_items',
        'cash_drawers',
        'cash_sessions',
        'cash_movements',
        'audit_logs',
        'idempotency_records',
        'sync_checkpoints',
        'catalog_change_logs'
    ];
BEGIN
    FOREACH tbl IN ARRAY tenant_tables LOOP
        IF EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = tbl
        ) THEN
            EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', tbl);
            EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', tbl);
            EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_policy ON %I;', tbl);
            EXECUTE format(
                'CREATE POLICY tenant_isolation_policy ON %I '
                'USING (organization_id = app_current_organization_id()) '
                'WITH CHECK (organization_id = app_current_organization_id());',
                tbl
            );
        END IF;
    END LOOP;
END $$;

