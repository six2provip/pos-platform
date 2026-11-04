-- POS Platform — Cloud Control Plane Database Role Initialization
-- Reference: docs/02-database-schema.md (Section 17)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'control_app') THEN
        CREATE ROLE control_app LOGIN PASSWORD 'dev_control_app_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
    END IF;
END
$$;

GRANT CONNECT ON DATABASE pos_control TO control_app;
GRANT USAGE ON SCHEMA public TO control_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO control_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO control_app;

