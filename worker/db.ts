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

/**
 * Atomically claim the right to deliver one alert.
 *
 * WHY INSERT-FIRST AND WHY IT MUST BE ATOMIC: the old implementation ran a
 * SELECT and then an INSERT. Two overlapping cron invocations could both see no
 * row and both send the same alert. `INSERT OR IGNORE` decides the winner inside
 * SQLite, and `meta.changes` tells us whether this invocation is the winner.
 *
 * Returns true when the caller owns delivery. Returns false when another run
 * already claimed it, in which case the caller must NOT send.
 *
 * The claim is provisional: if delivery fails in a way that could succeed later,
 * the caller must call `releaseAlertClaim` so a future run retries instead of
 * dropping the notification.
 */
export async function claimAlert(
  db: D1Database,
  key: string,
  address: string,
): Promise<boolean> {
  const res = await db
    .prepare("INSERT OR IGNORE INTO alert_sent (tx_hash, address, sent_at) VALUES (?, ?, ?)")
    .bind(key, address, Date.now())
    .run();
  return (res.meta?.changes ?? 0) > 0;
}

/**
 * Give up a claim so the alert is retried on a later run.
 *
 * Used when Telegram was unreachable, rate limited, or returned a 5xx — the
 * transfer really happened and the user still needs to hear about it.
 */
export async function releaseAlertClaim(
  db: D1Database,
  key: string,
  address: string,
): Promise<void> {
  await db
    .prepare("DELETE FROM alert_sent WHERE tx_hash = ? AND address = ?")
    .bind(key, address)
    .run();
}

/** Prune alert_sent rows older than 7 days. */
export async function pruneAlerts(db: D1Database): Promise<void> {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  await db.prepare("DELETE FROM alert_sent WHERE sent_at < ?").bind(cutoff).run();
}

// ---- native balance reconciliation ----

/**
 * Last observed native QUAI balance per watched address.
 *
 * WHY THIS EXISTS: scanning `transactions[]` only sees TOP-LEVEL transfers. A
 * contract paying an address out (a faucet/claim/withdraw, a router refund, a
 * cross-shard ETX credit) moves QUAI without any top-level tx whose `to` is the
 * user, so tx scanning alone silently misses real incoming funds. The public RPC
 * is not an archive node (`quai_getBalance` at an old height returns the CURRENT
 * balance, verified live), and the explorer reports
 * `traceCertification: "UNAVAILABLE"` for internal call frames, so neither
 * historical balances nor traces are available for free.
 *
 * What IS available and cheap is the current balance. Storing it per address and
 * diffing it every run detects any credit or debit regardless of mechanism.
 */
export type BalanceRow = { address: string; balance: string; block: number };

export async function getTrackedBalances(
  db: D1Database,
): Promise<Map<string, BalanceRow>> {
  const res = await db
    .prepare("SELECT address, balance, block FROM address_balance")
    .all<BalanceRow>();
  const map = new Map<string, BalanceRow>();
  for (const row of res.results ?? []) map.set(row.address, row);
  return map;
}

export async function setTrackedBalance(
  db: D1Database,
  address: string,
  balance: bigint,
  block: number,
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO address_balance (address, balance, block, updated_at) VALUES (?, ?, ?, ?) " +
        "ON CONFLICT(address) DO UPDATE SET balance = excluded.balance, block = excluded.block, updated_at = excluded.updated_at",
    )
    .bind(address, balance.toString(), block, Date.now())
    .run();
}

/** Drop balance rows for addresses nobody watches any more. */
export async function pruneTrackedBalances(db: D1Database): Promise<void> {
  await db
    .prepare(
      "DELETE FROM address_balance WHERE address NOT IN (SELECT address FROM watchlist)",
    )
    .run();
}
