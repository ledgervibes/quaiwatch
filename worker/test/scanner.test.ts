/**
 * worker/test/scanner.test.ts — regression tests for the alert pipeline.
 *
 * These cover the failures that actually lost a user's notification:
 *  - a contract payout with no top-level transaction,
 *  - a backlog larger than one run being skipped,
 *  - a failed Telegram send being recorded as delivered,
 *  - two concurrent runs double-sending,
 *  - the wrong block number on token alerts,
 *  - token symbols breaking Telegram's HTML parser.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { FakeD1 } from "./fake-d1";
import { scan } from "../scanner";
import { escapeHtml } from "../telegram";
import type { Env } from "../db";

const WATCHED = "0x0045f33e4b34775e0547193433de8b8f3ced8fc8";
const OTHER = "0x000ea12ac834460b54033ddf6e40f2e8c37a9871";
const CHAT = 4242;
const ONE_QUAI = 10n ** 18n;

type Sent = { chatId: number; text: string };

type RpcHandler = (method: string, params: unknown[]) => unknown;

/**
 * Install a fetch stub that answers Quai RPC, the explorer balance surface, and
 * the Telegram API.
 *
 * `balances` maps a lowercase address to its current wei balance. It is served
 * through the explorer's Etherscan-compatible `balancemulti`, which is what the
 * Worker actually calls (the RPC rejects lowercase addresses).
 */
function install(opts: {
  rpc: RpcHandler;
  balances?: Record<string, bigint>;
  telegram?: () => { status?: number; body?: unknown };
}) {
  const sent: Sent[] = [];
  const original = globalThis.fetch;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : null;

    if (url.includes("api.telegram.org")) {
      if (url.endsWith("/sendMessage")) {
        sent.push({ chatId: body.chat_id, text: body.text });
      }
      const res = opts.telegram?.() ?? { status: 200, body: { ok: true } };
      return new Response(JSON.stringify(res.body ?? { ok: true }), {
        status: res.status ?? 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url.includes("explorer.qu.ai")) {
      const requested = new URL(url).searchParams.get("address") ?? "";
      const result = requested
        .split(",")
        .filter(Boolean)
        .flatMap((account) => {
          const value = opts.balances?.[account.toLowerCase()];
          return value == null ? [] : [{ account, balance: value.toString() }];
        });
      return new Response(JSON.stringify({ status: "1", message: "OK", result }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Quai JSON-RPC, single or batch.
    const answer = (req: { method: string; params: unknown[]; id: number }) => {
      const result = opts.rpc(req.method, req.params ?? []);
      return { jsonrpc: "2.0", id: req.id, result };
    };
    const payload = Array.isArray(body) ? body.map(answer) : answer(body);
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  return {
    sent,
    restore() {
      globalThis.fetch = original;
    },
  };
}

function makeEnv(db: FakeD1): Env {
  return {
    DB: db as unknown as D1Database,
    TELEGRAM_BOT_TOKEN: "test-token",
    PUBLIC_URL: "https://example.invalid",
  };
}

function seedWatch(db: FakeD1, address = WATCHED) {
  db.watchlist.push({ chat_id: CHAT, address, created_at: Date.now() });
}

const hex = (n: number | bigint) => "0x" + n.toString(16);

/** Build a block whose woHeader.number matches the requested height. */
function block(height: number, transactions: unknown[] = []) {
  return { woHeader: { number: hex(height) }, transactions };
}

function nativeTx(over: Record<string, unknown> = {}) {
  return {
    hash: "0x" + "ab".repeat(32),
    from: OTHER,
    to: WATCHED,
    value: hex(2n * ONE_QUAI),
    type: "0x0",
    gas: "0x8fa0",
    gasPrice: "0x1",
    ...over,
  };
}

test("alerts a plain incoming native transfer", async () => {
  const db = new FakeD1();
  seedWatch(db);
  db.scanState.set("last_scanned_block", "100");

  const h = install({
    rpc: (method, params) => {
      if (method === "quai_blockNumber") return hex(103);
      if (method === "quai_getBlockByNumber") {
        const height = parseInt(String((params as string[])[0]), 16);
        return block(height, height === 101 ? [nativeTx()] : []);
      }
      if (method === "quai_getLogs") return [];
      return null;
    },
    balances: { [WATCHED]: 0n },
  });

  try {
    await scan(makeEnv(db));
  } finally {
    h.restore();
  }

  assert.equal(h.sent.length, 1);
  assert.match(h.sent[0].text, /IN/);
  assert.match(h.sent[0].text, /2 QUAI/);
  assert.match(h.sent[0].text, /Block #101/);
  assert.equal(db.scanState.get("last_scanned_block"), "102");
});

test("detects a contract payout that has no top-level transaction", async () => {
  // This is the reported miss: QUAI arrives from a claim contract, so no block
  // transaction has `to` = the user, and the old scanner saw nothing.
  const db = new FakeD1();
  seedWatch(db);
  db.scanState.set("last_scanned_block", "200");
  db.balances.set(WATCHED, { balance: (5n * ONE_QUAI).toString(), block: 200 });

  const h = install({
    rpc: (method) => {
      if (method === "quai_blockNumber") return hex(203);
      if (method === "quai_getBlockByNumber") return block(201, []);
      if (method === "quai_getLogs") return [];
      return null;
    },
    // 5 QUAI -> 11.5 QUAI with no matching transaction.
    balances: { [WATCHED]: 11n * ONE_QUAI + ONE_QUAI / 2n },
  });

  try {
    await scan(makeEnv(db));
  } finally {
    h.restore();
  }

  assert.equal(h.sent.length, 1);
  assert.match(h.sent[0].text, /IN/);
  assert.match(h.sent[0].text, /6\.5 QUAI/);
  assert.match(h.sent[0].text, /Contract payout or internal transfer/);
  assert.equal(db.balances.get(WATCHED)?.balance, (11n * ONE_QUAI + ONE_QUAI / 2n).toString());
});

test("does not double-count a transfer it already alerted", async () => {
  // Balance grew by exactly the transfer amount, so reconciliation must stay quiet.
  const db = new FakeD1();
  seedWatch(db);
  db.scanState.set("last_scanned_block", "300");
  db.balances.set(WATCHED, { balance: "0", block: 300 });

  const h = install({
    rpc: (method, params) => {
      if (method === "quai_blockNumber") return hex(303);
      if (method === "quai_getBlockByNumber") {
        const height = parseInt(String((params as string[])[0]), 16);
        return block(height, height === 301 ? [nativeTx()] : []);
      }
      if (method === "quai_getLogs") return [];
      return null;
    },
    // Exactly the transferred amount, so nothing is unexplained.
    balances: { [WATCHED]: 2n * ONE_QUAI },
  });

  try {
    await scan(makeEnv(db));
  } finally {
    h.restore();
  }

  assert.equal(h.sent.length, 1, "only the transaction alert, no balance alert");
});

test("ignores coinbase rewards without reporting them as unexplained credit", async () => {
  const db = new FakeD1();
  seedWatch(db);
  db.scanState.set("last_scanned_block", "400");
  db.balances.set(WATCHED, { balance: "0", block: 400 });

  const coinbase = nativeTx({
    type: "0x1",
    etxType: "0x1",
    from: WATCHED,
    to: WATCHED,
    value: hex(9n * ONE_QUAI),
  });

  const h = install({
    rpc: (method, params) => {
      if (method === "quai_blockNumber") return hex(403);
      if (method === "quai_getBlockByNumber") {
        const height = parseInt(String((params as string[])[0]), 16);
        return block(height, height === 401 ? [coinbase] : []);
      }
      if (method === "quai_getLogs") return [];
      return null;
    },
    // The coinbase reward is accounted for, so it must not be alerted.
    balances: { [WATCHED]: 9n * ONE_QUAI },
  });

  try {
    await scan(makeEnv(db));
  } finally {
    h.restore();
  }

  assert.equal(h.sent.length, 0);
});

test("works through a backlog instead of skipping to the newest blocks", async () => {
  const db = new FakeD1();
  seedWatch(db);
  db.scanState.set("last_scanned_block", "1000");
  const seen: number[] = [];

  const h = install({
    rpc: (method, params) => {
      if (method === "quai_blockNumber") return hex(1500);
      if (method === "quai_getBlockByNumber") {
        const height = parseInt(String((params as string[])[0]), 16);
        seen.push(height);
        return block(height, []);
      }
      if (method === "quai_getLogs") return [];
      return null;
    },
    balances: { [WATCHED]: 0n },
  });

  try {
    await scan(makeEnv(db));
  } finally {
    h.restore();
  }

  assert.equal(Math.min(...seen), 1001, "resumes at the oldest unscanned block");
  assert.equal(Math.max(...seen), 1060, "advances by at most one run's worth");
  assert.equal(db.scanState.get("last_scanned_block"), "1060");
});

test("retries a Telegram failure instead of marking it delivered", async () => {
  const db = new FakeD1();
  seedWatch(db);
  db.scanState.set("last_scanned_block", "500");

  const rpc: RpcHandler = (method, params) => {
    if (method === "quai_blockNumber") return hex(503);
    if (method === "quai_getBlockByNumber") {
      const height = parseInt(String((params as string[])[0]), 16);
      return block(height, height === 501 ? [nativeTx()] : []);
    }
    if (method === "quai_getLogs") return [];
    return null;
  };

  // First run: Telegram is rate limited (HTTP 200 with ok:false, code 429).
  const fail = install({
    rpc,
    balances: { [WATCHED]: 2n * ONE_QUAI },
    telegram: () => ({ status: 200, body: { ok: false, error_code: 429, description: "retry" } }),
  });
  try {
    await scan(makeEnv(db));
  } finally {
    fail.restore();
  }

  assert.equal(db.alertSent.size, 0, "claim released so the alert is retried");
  assert.equal(
    db.scanState.get("last_scanned_block"),
    "500",
    "cursor stays put so the block is rescanned",
  );

  // Second run: Telegram recovers and the alert is delivered.
  const ok = install({ rpc, balances: { [WATCHED]: 2n * ONE_QUAI } });
  try {
    await scan(makeEnv(db));
  } finally {
    ok.restore();
  }

  assert.equal(ok.sent.length, 1, "the postponed alert is delivered later");
  assert.equal(db.scanState.get("last_scanned_block"), "502");
});

test("does not retry forever when the bot is blocked", async () => {
  const db = new FakeD1();
  seedWatch(db);
  db.scanState.set("last_scanned_block", "600");

  const h = install({
    rpc: (method, params) => {
      if (method === "quai_blockNumber") return hex(603);
      if (method === "quai_getBlockByNumber") {
        const height = parseInt(String((params as string[])[0]), 16);
        return block(height, height === 601 ? [nativeTx()] : []);
      }
      if (method === "quai_getLogs") return [];
      return null;
    },
    balances: { [WATCHED]: 2n * ONE_QUAI },
    telegram: () => ({ status: 403, body: { ok: false, error_code: 403, description: "blocked" } }),
  });

  try {
    await scan(makeEnv(db));
  } finally {
    h.restore();
  }

  assert.equal(db.alertSent.size, 1, "claim kept: a blocked bot will never accept it");
  assert.equal(db.scanState.get("last_scanned_block"), "602");
});

test("two concurrent runs never send the same alert twice", async () => {
  const db = new FakeD1();
  seedWatch(db);
  db.scanState.set("last_scanned_block", "700");

  const rpc: RpcHandler = (method, params) => {
    if (method === "quai_blockNumber") return hex(703);
    if (method === "quai_getBlockByNumber") {
      const height = parseInt(String((params as string[])[0]), 16);
      return block(height, height === 701 ? [nativeTx()] : []);
    }
    if (method === "quai_getLogs") return [];
    return null;
  };

  const h = install({ rpc, balances: { [WATCHED]: 2n * ONE_QUAI } });
  try {
    await Promise.all([scan(makeEnv(db)), scan(makeEnv(db))]);
  } finally {
    h.restore();
  }

  assert.equal(h.sent.length, 1, "the atomic claim lets exactly one run deliver");
});

test("reads balances through the explorer, not the checksum-strict RPC", async () => {
  // The public RPC rejects lowercase addresses with "address has invalid
  // checksum" (verified live), and the watchlist stores them lowercase. Calling
  // quai_getBalance would therefore fail for every watched address and silently
  // disable contract-payout detection.
  const db = new FakeD1();
  seedWatch(db);
  db.scanState.set("last_scanned_block", "1100");
  db.balances.set(WATCHED, { balance: "0", block: 1100 });

  const rpcMethods: string[] = [];
  const explorerUrls: string[] = [];
  const original = globalThis.fetch;
  const sent: string[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : null;

    if (url.includes("api.telegram.org")) {
      if (url.endsWith("/sendMessage")) sent.push(body.text);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    if (url.includes("explorer.qu.ai")) {
      explorerUrls.push(url);
      const requested = new URL(url).searchParams.get("address") ?? "";
      return new Response(
        JSON.stringify({
          status: "1",
          message: "OK",
          result: requested
            .split(",")
            .filter(Boolean)
            .map((account) => ({ account, balance: (7n * ONE_QUAI).toString() })),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    const answer = (req: { method: string; params: unknown[]; id: number }) => {
      rpcMethods.push(req.method);
      // Reproduce the real RPC's checksum rejection so a regression fails here.
      if (req.method === "quai_getBalance") {
        const addr = String((req.params ?? [])[0] ?? "");
        if (addr !== addr.toLowerCase().replace(/^0x/, (m) => m) || /^0x[0-9a-f]+$/.test(addr)) {
          return {
            jsonrpc: "2.0",
            id: req.id,
            error: { code: -32000, message: "address has invalid checksum" },
          };
        }
      }
      if (req.method === "quai_blockNumber") return { jsonrpc: "2.0", id: req.id, result: hex(1103) };
      if (req.method === "quai_getBlockByNumber") {
        return { jsonrpc: "2.0", id: req.id, result: block(1101, []) };
      }
      if (req.method === "quai_getLogs") return { jsonrpc: "2.0", id: req.id, result: [] };
      return { jsonrpc: "2.0", id: req.id, result: null };
    };
    const payload = Array.isArray(body) ? body.map(answer) : answer(body);
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    await scan(makeEnv(db));
  } finally {
    globalThis.fetch = original;
  }

  assert.ok(
    !rpcMethods.includes("quai_getBalance"),
    "must not call the checksum-strict RPC for balances",
  );
  assert.equal(explorerUrls.length, 1, "one batched balancemulti call");
  assert.match(explorerUrls[0], /action=balancemulti/);
  assert.match(explorerUrls[0], new RegExp(WATCHED));
  assert.equal(sent.length, 1, "the 7 QUAI credit is detected and alerted");
  assert.match(sent[0], /7 QUAI/);
});

test("token alerts carry the log's own block number", async () => {
  const db = new FakeD1();
  seedWatch(db);
  db.scanState.set("last_scanned_block", "800");

  const pad = (addr: string) => "0x" + "0".repeat(24) + addr.slice(2);
  const log = {
    address: "0x00" + "11".repeat(19),
    topics: [
      "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
      pad(OTHER),
      pad(WATCHED),
    ],
    data: hex(5n * 10n ** 18n),
    transactionHash: "0x" + "cd".repeat(32),
    blockNumber: hex(802),
  };

  const h = install({
    rpc: (method) => {
      if (method === "quai_blockNumber") return hex(861);
      if (method === "quai_getBlockByNumber") return block(801, []);
      if (method === "quai_getLogs") return [log];
      // symbol() then decimals()
      if (method === "quai_call") return "0x";
      return null;
    },
    balances: { [WATCHED]: 0n },
  });

  try {
    await scan(makeEnv(db));
  } finally {
    h.restore();
  }

  assert.equal(h.sent.length, 1);
  assert.match(h.sent[0].text, /Block #802/, "not the end of the scanned range");
});

test("escapes token symbols so hostile metadata cannot break the message", () => {
  assert.equal(escapeHtml("<b>evil</b> & co"), "&lt;b&gt;evil&lt;/b&gt; &amp; co");
  assert.equal(escapeHtml("QUAI"), "QUAI");
});

test("advances the cursor cheaply when nobody is watching", async () => {
  const db = new FakeD1();
  db.scanState.set("last_scanned_block", "900");

  const h = install({
    rpc: (method) => {
      if (method === "quai_blockNumber") return hex(910);
      throw new Error("should not fetch blocks with an empty watchlist");
    },
  });

  try {
    await scan(makeEnv(db));
  } finally {
    h.restore();
  }

  assert.equal(db.scanState.get("last_scanned_block"), "909");
});

test("keeps the cursor when the block fetch fails", async () => {
  const db = new FakeD1();
  seedWatch(db);
  db.scanState.set("last_scanned_block", "950");

  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    if (!Array.isArray(body) && body?.method === "quai_blockNumber") {
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: hex(960) }), {
        status: 200,
      });
    }
    return new Response("upstream down", { status: 503 });
  }) as typeof fetch;

  try {
    await scan(makeEnv(db));
  } finally {
    globalThis.fetch = original;
  }

  assert.equal(
    db.scanState.get("last_scanned_block"),
    "950",
    "an unscanned range must be retried, not skipped",
  );
});
