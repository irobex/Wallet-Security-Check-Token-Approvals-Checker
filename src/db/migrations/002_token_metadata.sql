-- Token metadata cache (best-effort)
-- Used by approvals report engine to avoid repeated on-chain calls.

CREATE TABLE IF NOT EXISTS token_metadata (
  chain_id INTEGER NOT NULL,
  token_address VARCHAR(42) NOT NULL,
  symbol TEXT,
  name TEXT,
  decimals INTEGER,
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  PRIMARY KEY (chain_id, token_address)
);


