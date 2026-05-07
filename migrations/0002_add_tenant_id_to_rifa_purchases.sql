ALTER TABLE rifa_purchases ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default';

CREATE INDEX IF NOT EXISTS idx_rifa_purchases_tenant_raffle_created
  ON rifa_purchases (tenant_id, raffle_id, created_at DESC);
