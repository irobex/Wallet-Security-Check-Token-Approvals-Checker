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
  pay_address VARCHAR(64) NOT NULL,
  hd_index INTEGER NOT NULL,
  tx_hash VARCHAR(128),
  paid_amount NUMERIC(18,6),
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  paid_at TIMESTAMP,
  delivered_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS orders_status_idx ON orders(status);
CREATE INDEX IF NOT EXISTS orders_pay_address_idx ON orders(pay_address);
CREATE INDEX IF NOT EXISTS orders_user_created_at_idx ON orders(user_id, created_at DESC);

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

-- Single-row table to allocate unique TRON HD indices atomically.
CREATE TABLE IF NOT EXISTS tron_hd_state (
  id INTEGER PRIMARY KEY,
  next_index INTEGER NOT NULL
);

INSERT INTO tron_hd_state (id, next_index)
VALUES (1, 0)
ON CONFLICT (id) DO NOTHING;


