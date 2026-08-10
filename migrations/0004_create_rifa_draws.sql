CREATE TABLE IF NOT EXISTS rifa_draws (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  raffle_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  winning_number INTEGER NOT NULL,
  buyer_name TEXT,
  buyer_phone TEXT,
  drawn_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rifa_draws_tenant_raffle
  ON rifa_draws (tenant_id, raffle_id);
