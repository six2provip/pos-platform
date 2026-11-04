// Local SQLite / Drift schema for Offline-First POS Mobile Application
// Reference: docs/06-pos-offline-sync.md (Section 6.2 & 9.2)

/// Outbox queue item statuses (`pending` -> `sending` -> `accepted` | `retry_wait` | `conflict` | `rejected` | `dead_letter`).
enum OutboxStatus {
  pending,
  sending,
  accepted,
  retryWait,
  conflict,
  rejected,
  deadLetter,
}

/// Canonical SQLite DDL statements executed by the Drift database initializer on the Android POS terminal.
const List<String> kPosLocalSqliteSchemaStatements = [
  '''
  CREATE TABLE IF NOT EXISTS local_device_binding (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    organization_id TEXT NOT NULL,
    store_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    device_code TEXT NOT NULL,
    server_base_url TEXT NOT NULL,
    deployment_mode TEXT NOT NULL,
    activated_at TEXT NOT NULL
  );
  ''',
  '''
  CREATE TABLE IF NOT EXISTS local_products (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    category_id TEXT,
    product_code TEXT NOT NULL,
    name TEXT NOT NULL,
    product_type TEXT NOT NULL,
    track_inventory INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL,
    version INTEGER NOT NULL,
    updated_at TEXT NOT NULL
  );
  ''',
  '''
  CREATE TABLE IF NOT EXISTS local_product_variants (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    variant_code TEXT NOT NULL,
    variant_name TEXT NOT NULL,
    sku TEXT,
    unit_name TEXT NOT NULL,
    default_price TEXT NOT NULL,
    currency_code TEXT NOT NULL,
    status TEXT NOT NULL,
    version INTEGER NOT NULL,
    updated_at TEXT NOT NULL
  );
  ''',
  '''
  CREATE TABLE IF NOT EXISTS local_product_barcodes (
    barcode TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    product_variant_id TEXT NOT NULL,
    is_primary INTEGER NOT NULL DEFAULT 0
  );
  ''',
  '''
  CREATE TABLE IF NOT EXISTS local_orders (
    client_order_id TEXT PRIMARY KEY,
    server_order_id TEXT,
    organization_id TEXT NOT NULL,
    store_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    cashier_user_id TEXT NOT NULL,
    local_order_number TEXT NOT NULL,
    idempotency_key TEXT NOT NULL UNIQUE,
    subtotal_amount TEXT NOT NULL,
    discount_amount TEXT NOT NULL,
    tax_amount TEXT NOT NULL,
    total_amount TEXT NOT NULL,
    paid_amount TEXT NOT NULL,
    change_amount TEXT NOT NULL,
    sync_status TEXT NOT NULL DEFAULT 'pending',
    occurred_at TEXT NOT NULL
  );
  ''',
  '''
  CREATE TABLE IF NOT EXISTS local_outbox_events (
    event_id TEXT PRIMARY KEY,
    sequence_no INTEGER NOT NULL,
    organization_id TEXT NOT NULL,
    store_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    cashier_user_id TEXT,
    event_type TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_local_id TEXT NOT NULL,
    idempotency_key TEXT NOT NULL UNIQUE,
    depends_on_event_id TEXT,
    payload_json TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'sending', 'accepted', 'retry_wait', 'conflict', 'rejected', 'dead_letter')),
    attempt_count INTEGER NOT NULL DEFAULT 0,
    next_retry_at TEXT,
    last_error_code TEXT,
    last_error_message TEXT,
    server_resource_id TEXT,
    occurred_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    synced_at TEXT
  );
  ''',
  '''
  CREATE TABLE IF NOT EXISTS local_sync_cursors (
    stream_name TEXT PRIMARY KEY,
    cursor_value TEXT NOT NULL,
    last_pull_at TEXT NOT NULL
  );
  ''',
];

