/**
 * worker/test/fake-d1.ts — in-memory stand-in for the D1 bindings the bot uses.
 *
 * It is not a SQL engine: it recognises exactly the statements in db.ts and
 * applies them to plain Maps. That keeps the tests honest about behaviour
 * (atomic claim, release, cursor writes) without pulling in a database.
 */

type Row = Record<string, unknown>;

export class FakeD1 {
  scanState = new Map<string, string>();
  watchlist: Array<{ chat_id: number; address: string; created_at: number }> = [];
  userState = new Map<number, string | null>();
  alertSent = new Map<string, number>(); // `${tx_hash}|${address}` -> sent_at
  balances = new Map<string, { balance: string; block: number }>();
  /** Every statement executed, for assertions about what the scanner did. */
  log: string[] = [];

  prepare(sql: string) {
    const normalized = sql.replace(/\s+/g, " ").trim();
    return new FakeStatement(this, normalized);
  }
}

class FakeStatement {
  // Fields are declared explicitly rather than as constructor parameter
  // properties, because Node's type-stripping test runner does not support that
  // syntax (it rewrites types away instead of compiling them).
  private args: unknown[] = [];
  private readonly db: FakeD1;
  private readonly sql: string;

  constructor(db: FakeD1, sql: string) {
    this.db = db;
    this.sql = sql;
  }

  bind(...args: unknown[]) {
    this.args = args;
    return this;
  }

  async first<T>(): Promise<T | null> {
    this.db.log.push(this.sql);
    if (this.sql.startsWith("SELECT value FROM scan_state")) {
      const value = this.db.scanState.get(this.args[0] as string);
      return value == null ? null : ({ value } as T);
    }
    if (this.sql.startsWith("SELECT COUNT(*) AS n FROM watchlist")) {
      const n = this.db.watchlist.filter((r) => r.chat_id === this.args[0]).length;
      return { n } as T;
    }
    if (this.sql.startsWith("SELECT awaiting FROM user_state")) {
      const awaiting = this.db.userState.get(this.args[0] as number) ?? null;
      return { awaiting } as T;
    }
    throw new Error(`FakeD1: unhandled first() for ${this.sql}`);
  }

  async all<T>(): Promise<{ results: T[] }> {
    this.db.log.push(this.sql);
    if (this.sql.startsWith("SELECT chat_id, address FROM watchlist")) {
      return { results: this.db.watchlist as unknown as T[] };
    }
    if (this.sql.startsWith("SELECT address FROM watchlist")) {
      const rows = this.db.watchlist
        .filter((r) => r.chat_id === this.args[0])
        .map((r) => ({ address: r.address }));
      return { results: rows as unknown as T[] };
    }
    if (this.sql.startsWith("SELECT address, balance, block FROM address_balance")) {
      const rows = [...this.db.balances.entries()].map(([address, v]) => ({
        address,
        balance: v.balance,
        block: v.block,
      }));
      return { results: rows as unknown as T[] };
    }
    throw new Error(`FakeD1: unhandled all() for ${this.sql}`);
  }

  async run(): Promise<{ meta: { changes: number } }> {
    this.db.log.push(this.sql);
    const changes = this.apply();
    return { meta: { changes } };
  }

  private apply(): number {
    const a = this.args;
    if (this.sql.startsWith("INSERT INTO scan_state")) {
      this.db.scanState.set(a[0] as string, a[1] as string);
      return 1;
    }
    if (this.sql.startsWith("INSERT OR IGNORE INTO watchlist")) {
      const address = a[1] as string;
      const chatId = a[0] as number;
      if (this.db.watchlist.some((r) => r.chat_id === chatId && r.address === address)) return 0;
      this.db.watchlist.push({ chat_id: chatId, address, created_at: a[2] as number });
      return 1;
    }
    if (this.sql.startsWith("DELETE FROM watchlist")) {
      const before = this.db.watchlist.length;
      this.db.watchlist = this.db.watchlist.filter(
        (r) => !(r.chat_id === a[0] && r.address === a[1]),
      );
      return before - this.db.watchlist.length;
    }
    if (this.sql.startsWith("INSERT INTO user_state")) {
      this.db.userState.set(a[0] as number, a[1] as string | null);
      return 1;
    }
    if (this.sql.startsWith("INSERT OR IGNORE INTO alert_sent")) {
      const key = `${a[0]}|${a[1]}`;
      if (this.db.alertSent.has(key)) return 0; // atomic: loser gets 0 changes
      this.db.alertSent.set(key, a[2] as number);
      return 1;
    }
    if (this.sql.startsWith("DELETE FROM alert_sent WHERE tx_hash = ?")) {
      return this.db.alertSent.delete(`${a[0]}|${a[1]}`) ? 1 : 0;
    }
    if (this.sql.startsWith("DELETE FROM alert_sent WHERE sent_at <")) {
      let n = 0;
      for (const [k, sentAt] of this.db.alertSent) {
        if (sentAt < (a[0] as number)) {
          this.db.alertSent.delete(k);
          n++;
        }
      }
      return n;
    }
    if (this.sql.startsWith("INSERT INTO address_balance")) {
      this.db.balances.set(a[0] as string, {
        balance: a[1] as string,
        block: a[2] as number,
      });
      return 1;
    }
    if (this.sql.startsWith("DELETE FROM address_balance WHERE address NOT IN")) {
      let n = 0;
      const watched = new Set(this.db.watchlist.map((r) => r.address));
      for (const addr of [...this.db.balances.keys()]) {
        if (!watched.has(addr)) {
          this.db.balances.delete(addr);
          n++;
        }
      }
      return n;
    }
    throw new Error(`FakeD1: unhandled run() for ${this.sql}`);
  }
}

export type { Row };
