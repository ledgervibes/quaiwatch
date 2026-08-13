-- QuaiWatch Telegram bot — D1 schema
-- Applied with: wrangler d1 execute quaiwatch --file=schema.sql

-- Scanner cursor + small key/value flags (e.g. webhook registration).
CREATE TABLE IF NOT EXISTS scan_state (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- Addresses a user wants to be alerted about.
CREATE TABLE IF NOT EXISTS watchlist (
  chat_id    INTEGER NOT NULL,
  address    TEXT NOT NULL,     -- lowercase 0x...
  label      TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (chat_id, address)
);
CREATE INDEX IF NOT EXISTS idx_watchlist_address ON watchlist(address);

-- Dedup guard so a transaction is never alerted twice for the same address.
-- Rows older than 7 days are pruned by the cron job.
CREATE TABLE IF NOT EXISTS alert_sent (
  tx_hash TEXT NOT NULL,
  address TEXT NOT NULL,
  sent_at INTEGER NOT NULL,
  PRIMARY KEY (tx_hash, address)
);
CREATE INDEX IF NOT EXISTS idx_alert_sent_at ON alert_sent(sent_at);

-- Per-chat conversation state (e.g. "waiting for an address to add").
CREATE TABLE IF NOT EXISTS user_state (
  chat_id    INTEGER PRIMARY KEY,
  awaiting   TEXT,              -- 'address' | NULL
  updated_at INTEGER NOT NULL
);
