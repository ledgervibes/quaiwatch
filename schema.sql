-- QuaiWatch Telegram bot — D1 schema
-- Applied with: wrangler d1 execute quaiwatch --file=schema.sql
-- Safe to re-run: every statement is IF NOT EXISTS.

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
-- A row is an atomic DELIVERY CLAIM, inserted with INSERT OR IGNORE before
-- sending and deleted again if Telegram failed in a retryable way, so a failed
-- send is retried instead of silently dropped.
-- Rows older than 7 days are pruned by the cron job.
CREATE TABLE IF NOT EXISTS alert_sent (
  tx_hash TEXT NOT NULL,        -- tx hash, or "bal:<address>:<block>" for balance alerts
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

-- Last observed native QUAI balance per watched address.
--
-- WHY: scanning a block's `transactions[]` only sees TOP-LEVEL transfers. When a
-- contract pays an address out (a claim, a withdrawal, a reward, a router
-- refund), QUAI arrives with no top-level transaction whose `to` is the user, so
-- transaction scanning alone misses real incoming funds. Verified live: the
-- public RPC is not an archive node (quai_getBalance at an old height returns
-- the current balance) and the explorer reports internal call frames as
-- traceCertification "UNAVAILABLE", so neither historical balances nor traces
-- are available for free. The current balance IS available and cheap, so the bot
-- stores it and alerts on the difference.
CREATE TABLE IF NOT EXISTS address_balance (
  address    TEXT PRIMARY KEY,  -- lowercase 0x...
  balance    TEXT NOT NULL,     -- wei, decimal string (exceeds INTEGER range)
  block      INTEGER NOT NULL,  -- head height the balance was read at
  updated_at INTEGER NOT NULL
);
