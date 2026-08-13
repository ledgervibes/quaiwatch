/**
 * worker/db.ts — thin D1 helpers for the bot.
 */

export interface Env {
  DB: D1Database;
  TELEGRAM_BOT_TOKEN: string;
  PUBLIC_URL?: string;
}

// ---- scan cursor & flags ----

export async function getState(db: D1Database, key: string): Promise<string | null> {
  const row = await db
    .prepare("SELECT value FROM scan_state WHERE key = ?")
    .bind(key)
    .first<{ value: string }>();
  return row?.value ?? null;
}

export async function setState(db: D1Database, key: string, value: string): Promise<void> {
  await db
    .prepare(
      "INSERT INTO scan_state (key, value) VALUES (?, ?) " +
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .bind(key, value)
    .run();
}

// ---- watchlist ----

export type WatchRow = { chat_id: number; address: string; label: string | null };

export async function addWatch(
  db: D1Database,
  chatId: number,
  address: string,
): Promise<void> {
  await db
    .prepare(
      "INSERT OR IGNORE INTO watchlist (chat_id, address, label, created_at) VALUES (?, ?, NULL, ?)",
    )
    .bind(chatId, address.toLowerCase(), Date.now())
    .run();
}

export async function removeWatch(
  db: D1Database,
  chatId: number,
  address: string,
): Promise<void> {
  await db
    .prepare("DELETE FROM watchlist WHERE chat_id = ? AND address = ?")
    .bind(chatId, address.toLowerCase())
    .run();
}

export async function listWatch(db: D1Database, chatId: number): Promise<string[]> {
  const res = await db
    .prepare("SELECT address FROM watchlist WHERE chat_id = ? ORDER BY created_at")
    .bind(chatId)
    .all<{ address: string }>();
  return (res.results ?? []).map((r) => r.address);
}

export async function countWatch(db: D1Database, chatId: number): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM watchlist WHERE chat_id = ?")
    .bind(chatId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/** All watched addresses across every user → set of lowercase addresses + which chats watch each. */
export async function allWatched(
  db: D1Database,
): Promise<Map<string, number[]>> {
  const res = await db
    .prepare("SELECT chat_id, address FROM watchlist")
    .all<{ chat_id: number; address: string }>();
  const map = new Map<string, number[]>();
  for (const r of res.results ?? []) {
    const arr = map.get(r.address) ?? [];
    arr.push(r.chat_id);
    map.set(r.address, arr);
  }
  return map;
}

// ---- user conversation state ----

export async function setAwaiting(
  db: D1Database,
  chatId: number,
  awaiting: string | null,
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO user_state (chat_id, awaiting, updated_at) VALUES (?, ?, ?) " +
        "ON CONFLICT(chat_id) DO UPDATE SET awaiting = excluded.awaiting, updated_at = excluded.updated_at",
    )
    .bind(chatId, awaiting, Date.now())
    .run();
}

export async function getAwaiting(db: D1Database, chatId: number): Promise<string | null> {
  const row = await db
    .prepare("SELECT awaiting FROM user_state WHERE chat_id = ?")
    .bind(chatId)
    .first<{ awaiting: string | null }>();
  return row?.awaiting ?? null;
}

// ---- dedup ----

/** Returns true if this (tx, address) was already alerted. Records it if not. */
export async function alreadyAlerted(
  db: D1Database,
  txHash: string,
  address: string,
): Promise<boolean> {
  const row = await db
    .prepare("SELECT 1 FROM alert_sent WHERE tx_hash = ? AND address = ?")
    .bind(txHash, address)
    .first();
  if (row) return true;
  await db
    .prepare("INSERT OR IGNORE INTO alert_sent (tx_hash, address, sent_at) VALUES (?, ?, ?)")
    .bind(txHash, address, Date.now())
    .run();
  return false;
}

/** Prune alert_sent rows older than 7 days. */
export async function pruneAlerts(db: D1Database): Promise<void> {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  await db.prepare("DELETE FROM alert_sent WHERE sent_at < ?").bind(cutoff).run();
}
