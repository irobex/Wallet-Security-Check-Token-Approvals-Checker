-- Wallet Guard schema (MVP)
-- Based on docs/project.md

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id BIGINT UNIQUE NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  wallet_address VARCHAR(42) NOT NULL,
  plan VARCHAR(10) NOT NULL CHECK (plan IN ('LITE','PRO','MAX')),
  price_usdt NUMERIC(10,2) NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('CREATED','PENDING_PAYMENT','PAID','REPORTING','DELIVERED','EXPIRED','FAILED')),
  payment_provider VARCHAR(32) NOT NULL DEFAULT 'nowpayments',
  provider_payment_id TEXT,
  provider_status TEXT,
  pay_address VARCHAR(128),
  pay_currency VARCHAR(32),
  pay_amount NUMERIC(36, 18),
  invoice_url TEXT,
  tx_hash VARCHAR(128),
  paid_amount NUMERIC(18,6),
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  paid_at TIMESTAMP,
  delivered_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS orders_status_idx ON orders(status);
CREATE INDEX IF NOT EXISTS orders_pay_address_idx ON orders(pay_address);
CREATE INDEX IF NOT EXISTS orders_user_created_at_idx ON orders(user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS orders_provider_payment_id_uniq
  ON orders(provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL UNIQUE REFERENCES orders(id),
  risk_level VARCHAR(10) CHECK (risk_level IN ('LOW','MEDIUM','HIGH')),
  summary_text TEXT NOT NULL,
  csv_path TEXT,
  html_path TEXT,
  pdf_path TEXT,
  data_json JSONB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS monitoring_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  wallet_address VARCHAR(42) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMP NOT NULL,
  last_snapshot_json JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

-- payments are handled by a payment aggregator (NOWPayments), so we no longer store TRON HD state here.
