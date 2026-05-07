CREATE TABLE IF NOT EXISTS rifa_purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  raffle_id TEXT NOT NULL,
  buyer_name TEXT NOT NULL,
  buyer_cpf TEXT NOT NULL,
  buyer_email TEXT NOT NULL,
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

CREATE INDEX IF NOT EXISTS idx_rifa_purchases_raffle ON rifa_purchases (raffle_id, created_at DESC);
