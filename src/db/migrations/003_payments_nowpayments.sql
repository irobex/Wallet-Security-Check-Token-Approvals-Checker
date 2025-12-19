-- Switch payments system from custom TRON monitoring to a payment aggregator (NOWPayments).
-- We keep orders table but change fields:
-- - pay_address becomes nullable (deposit address is created by provider after order creation)
-- - hd_index + tron_hd_state are removed
-- - provider fields are added

ALTER TABLE orders
  ALTER COLUMN pay_address DROP NOT NULL;

ALTER TABLE orders
  DROP COLUMN IF EXISTS hd_index;

DROP TABLE IF EXISTS tron_hd_state;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_provider VARCHAR(32) NOT NULL DEFAULT 'nowpayments',
  ADD COLUMN IF NOT EXISTS provider_payment_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_status TEXT,
  ADD COLUMN IF NOT EXISTS pay_currency VARCHAR(32),
  ADD COLUMN IF NOT EXISTS pay_amount NUMERIC(36, 18),
  ADD COLUMN IF NOT EXISTS invoice_url TEXT;

-- Prevent one provider payment id from being linked to multiple orders.
CREATE UNIQUE INDEX IF NOT EXISTS orders_provider_payment_id_uniq
  ON orders(provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;


