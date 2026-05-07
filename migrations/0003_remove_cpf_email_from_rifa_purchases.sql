BEGIN TRANSACTION;

DROP TABLE IF EXISTS rifa_purchases_new;

CREATE TABLE rifa_purchases_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  raffle_id TEXT NOT NULL,
  buyer_name TEXT NOT NULL,
  buyer_phone TEXT NOT NULL,
  numbers_csv TEXT NOT NULL,
  numbers_count INTEGER NOT NULL,
  ticket_price REAL NOT NULL,
  total_amount REAL NOT NULL,
  preference_id TEXT NOT NULL,
  payment_id TEXT NOT NULL,
  payment_status TEXT NOT NULL,
  notification_channel TEXT NOT NULL,
  notification_status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  raw_payload_json TEXT NOT NULL,
  inserted_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO rifa_purchases_new (
  id,
  tenant_id,
  raffle_id,
  buyer_name,
  buyer_phone,
  numbers_csv,
  numbers_count,
  ticket_price,
  total_amount,
  preference_id,
  payment_id,
  payment_status,
  notification_channel,
  notification_status,
  created_at,
  raw_payload_json,
  inserted_at
)
SELECT
  id,
  tenant_id,
  raffle_id,
  buyer_name,
  buyer_phone,
  numbers_csv,
  numbers_count,
  ticket_price,
  total_amount,
  preference_id,
  payment_id,
  payment_status,
  notification_channel,
  notification_status,
  created_at,
  raw_payload_json,
  inserted_at
FROM rifa_purchases;

DROP TABLE rifa_purchases;
ALTER TABLE rifa_purchases_new RENAME TO rifa_purchases;

CREATE INDEX IF NOT EXISTS idx_rifa_purchases_raffle ON rifa_purchases (raffle_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rifa_purchases_tenant_raffle_created
  ON rifa_purchases (tenant_id, raffle_id, created_at DESC);

COMMIT;
