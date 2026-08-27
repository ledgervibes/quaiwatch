/**
 * worker/scanner.ts — scans new blocks + token Transfer logs + native balance
 * changes, matches them against the watchlist, and sends Telegram alerts.
 *
 * ALERT SOURCES
 *  1. Native QUAI top-level transfer (tx type 0x0, value >= 1 QUAI).
 *  2. Any QRC-20 Transfer log touching a watched address (no minimum).
 *  3. Native balance reconciliation — see WHY BALANCE DIFFING below.
 *
 * Ignored: coinbase / miner payouts (ETX type 0x1). Qi is not supported (no
 * public RPC method for UTXO balances).
 *
 * WHY BALANCE DIFFING EXISTS (this is the bug that lost a real claim):
 * A block's `transactions[]` only contains TOP-LEVEL transactions. When a
 * contract pays an address out — a faucet claim, a withdrawal, a reward, a
 * router refund — the QUAI arrives through an internal call, so there is no
 * top-level transaction whose `to` is the user and transaction scanning sees
 * nothing at all. Verified live against the public infrastructure:
 *   - `quai_getBalance` at an old height returns the CURRENT balance, so the
 *     public RPC is not an archive node and historical balances are unavailable.
 *   - The official explorer answers `/address/{a}/internal-txs` with
 *     `traceCertification: "UNAVAILABLE"`, so internal call frames are not
 *     available either.
 * What IS free and reliable is the CURRENT balance. So the scanner stores the
 * last balance per watched address and alerts on any change it cannot account
 * for from the transactions it already saw. Conservative by design: a change is
 * only reported when it exceeds every explained upper bound, so gas costs and
 * locked coinbase rewards cannot produce a false alert.
 *
 * Balances are read through the explorer, NOT `quai_getBalance`: the public RPC
 * rejects lowercase addresses with "address has invalid checksum" (verified
 * live), and the watchlist deliberately stores addresses lowercase. See
 * worker/explorer.ts.
 *
 * DELIVERY GUARANTEES
 *  - The cursor only advances across blocks whose alerts were fully handled, so
 *    a backlog is worked through instead of skipped, and hitting the per-run cap
 *    postpones alerts rather than dropping them.
 *  - A dedup row is an atomic delivery CLAIM. If Telegram fails in a way that
 *    could succeed later, the claim is released so the next run retries.
 */

import { rpc, rpcBatch, fmtAmount, hexToNum, numToHex, TRANSFER_TOPIC } from "./rpc";
import {
  getState,
  setState,
  allWatched,
  claimAlert,
  releaseAlertClaim,
  pruneAlerts,
  getTrackedBalances,
  setTrackedBalance,
  pruneTrackedBalances,
  type Env,
} from "./db";
import { sendMessage, shortAddr, txUrl, escapeHtml } from "./telegram";
import { getNativeBalances, balanceCallCount } from "./explorer";

const CURSOR_KEY = "last_scanned_block";
const MIN_QUAI_WEI = 10n ** 18n; // 1 QUAI

/**
 * Blocks per run. Block time is ~5s, so a 1-minute cron sees ~12 new blocks;
 * 60 lets the bot catch up about 5x faster than the chain after an outage
 * WITHOUT skipping anything. Measured: 60 blocks with full transactions is a
 * single ~0.9 MB batch response in ~2.7s.
 */
const MAX_BLOCKS_PER_RUN = 60;

/**
 * Cloudflare counts every outbound fetch AND every D1 query as a subrequest,
 * with a hard per-invocation ceiling (50 on the free plan). The old code assumed
 * one alert cost one subrequest, but an alert costs a claim, a send, and
 * sometimes a release. Exceeding the ceiling kills the invocation mid-delivery,
 * so the budget is tracked explicitly and the run stops cleanly instead.
 */
const SUBREQUEST_BUDGET = 44;
/** Reserve enough budget to still write the cursor and finish bookkeeping. */
const BUDGET_RESERVE = 4;

const TOKEN_META_TTL = 24 * 60 * 60 * 1000;

type Block = {
  woHeader: { number: string };
  transactions: Tx[];
};
type Tx = {
  hash: string;
  from: string | null;
  to: string | null;
  value: string;
  type: string;
  gas?: string;
  gasPrice?: string;
  etxType?: string;
};
type Log = {
  address: string;
  topics: string[];
  data: string;
  transactionHash: string;
  blockNumber?: string;
};

/** Tracks how many subrequests this invocation has spent. */
class Budget {
  private used = 0;
  private readonly limit: number;

  constructor(limit: number) {
    this.limit = limit;
  }

  /** Spend n subrequests. Returns false when that would exceed the budget. */
  spend(n = 1): boolean {
    if (this.used + n > this.limit) return false;
    this.used += n;
    return true;
  }
  /** True when at least n subrequests remain above the reserve. */
  has(n: number): boolean {
    return this.used + n <= this.limit - BUDGET_RESERVE;
  }
  get spent(): number {
    return this.used;
  }
}

/** Extract a 20-byte address from a 32-byte padded topic. */
function topicToAddress(topic: string): string {
  return ("0x" + topic.slice(-40)).toLowerCase();
}

/** Cache of token symbol/decimals to avoid re-querying every run. */
const tokenMeta = new Map<string, { symbol: string; decimals: number; at: number }>();

async function getTokenMeta(
  addr: string,
  budget: Budget,
): Promise<{ symbol: string; decimals: number }> {
  const cached = tokenMeta.get(addr);
  if (cached && Date.now() - cached.at < TOKEN_META_TTL) return cached;
  // Unknown token and no budget left to look it up: alert with a placeholder
  // rather than skipping a real transfer.
  if (!budget.spend()) return { symbol: "???", decimals: 18 };
  // symbol() = 0x95d89b41, decimals() = 0x313ce567
  const [symHex, decHex] = await rpcBatch<string>([
    { method: "quai_call", params: [{ to: addr, data: "0x95d89b41" }, "latest"], id: 1 },
    { method: "quai_call", params: [{ to: addr, data: "0x313ce567" }, "latest"], id: 2 },
  ]);
  let symbol = "???";
  try {
    if (symHex && symHex.length > 130) {
      const len = parseInt(symHex.slice(66, 130), 16);
      const hex = symHex.slice(130, 130 + len * 2);
      symbol = decodeUtf8(hex) || "???";
    }
  } catch {
    /* keep default */
  }
  const decimals = decHex ? hexToNum(decHex) : 18;
  const meta = { symbol, decimals };
  tokenMeta.set(addr, { ...meta, at: Date.now() });
  return meta;
}

function decodeUtf8(hex: string): string {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return new TextDecoder().decode(bytes).replace(/\0+$/, "").trim();
}

type Alert = {
  chatId: number;
  direction: "IN" | "OUT";
  amount: string;
  symbol: string;
  address: string;
  /** Null for balance-derived alerts, where no single counterparty exists. */
  counterparty: string | null;
  /** Null for balance-derived alerts, which have no single transaction. */
  txHash: string | null;
  block: number;
  /** Dedup key: the tx hash, or a synthetic key for balance alerts. */
  dedupKey: string;
  /** Explains a balance-derived alert to the user. */
  note?: string;
};

/** Per-address ledger of what the scanned transactions can account for. */
type Explained = {
  /** Upper bound of credits we already know about (incl. coinbase). */
  creditUpper: bigint;
  /** Upper bound of debits we already know about (value + max gas cost). */
  debitUpper: bigint;
};

export async function scan(env: Env): Promise<void> {
  const db = env.DB;
  const token = env.TELEGRAM_BOT_TOKEN;
  const budget = new Budget(SUBREQUEST_BUDGET);

  if (!budget.spend()) return;
  const watched = await allWatched(db); // address -> chatIds

  if (!budget.spend()) return;
  const latest = hexToNum(await rpc<string>("quai_blockNumber"));

  if (!budget.spend()) return;
  const cursorRaw = await getState(db, CURSOR_KEY);

  const from = cursorRaw ? parseInt(cursorRaw, 10) + 1 : latest - 1;
  // Confirm 1 block back to avoid a reorg edge.
  const head = latest - 1;
  if (head < from) return; // nothing new

  // Work through a backlog oldest-first instead of jumping to the newest window.
  // Skipping ahead is what silently lost every alert in the gap.
  const to = Math.min(head, from + MAX_BLOCKS_PER_RUN - 1);

  // Nobody is watching anything: just advance the cursor cheaply.
  if (watched.size === 0) {
    if (budget.spend()) await setState(db, CURSOR_KEY, String(to));
    if (budget.spend()) await pruneAlerts(db);
    return;
  }

  const alerts: Alert[] = [];
  const explained = new Map<string, Explained>();
  const bump = (addr: string, patch: Partial<Explained>) => {
    const cur = explained.get(addr) ?? { creditUpper: 0n, debitUpper: 0n };
    explained.set(addr, {
      creditUpper: cur.creditUpper + (patch.creditUpper ?? 0n),
      debitUpper: cur.debitUpper + (patch.debitUpper ?? 0n),
    });
  };

  // ---- 1) Native QUAI transfers: batch-fetch blocks with full tx ----
  let blocksScanned = false;
  if (budget.spend()) {
    const blockReqs = [];
    for (let b = from; b <= to; b++) {
      blockReqs.push({ method: "quai_getBlockByNumber", params: [numToHex(b), true], id: b });
    }
    try {
      const blocks = await rpcBatch<Block>(blockReqs);
      blocksScanned = true;
      for (const blk of blocks) {
        if (!blk?.transactions) continue;
        const blkNum = hexToNum(blk.woHeader.number);
        for (const tx of blk.transactions) {
          const fromAddr = (tx.from ?? "").toLowerCase();
          const toAddr = (tx.to ?? "").toLowerCase();
          const value = tx.value ? BigInt(tx.value) : 0n;

          // Coinbase / miner payout: never alerted, but it DOES move the
          // balance, so it must still be accounted for or the reconciliation
          // below would report it as an unexplained credit.
          if (tx.etxType === "0x1") {
            if (watched.has(toAddr)) bump(toAddr, { creditUpper: value });
            continue;
          }
          // Other ETX types are left unexplained on purpose: the balance
          // reconciliation reports them rather than dropping them.
          if (tx.type !== "0x0") continue;

          // Account for every transfer, including ones below the alert
          // threshold, so small transfers can't look like unexplained drift.
          if (watched.has(toAddr)) bump(toAddr, { creditUpper: value });
          if (watched.has(fromAddr)) {
            // Upper bound: the fee cannot exceed gas limit * gas price.
            const maxFee =
              tx.gas && tx.gasPrice ? BigInt(tx.gas) * BigInt(tx.gasPrice) : 0n;
            bump(fromAddr, { debitUpper: value + maxFee });
          }

          if (value < MIN_QUAI_WEI) continue;
          pushMatches(alerts, watched, {
            fromAddr,
            toAddr,
            amount: fmtAmount(value, 18),
            symbol: "QUAI",
            txHash: tx.hash,
            block: blkNum,
          });
        }
      }
    } catch (e) {
      console.log("block batch error: " + (e as Error).message);
    }
  }

  // A failed block scan means the range was not inspected. Stop without moving
  // the cursor so the same range is retried, instead of skipping it forever.
  if (!blocksScanned) return;

  // ---- 2) Token transfers: one getLogs for the whole range ----
  if (budget.spend()) {
    try {
      const logs = await rpc<Log[]>("quai_getLogs", [
        { fromBlock: numToHex(from), toBlock: numToHex(to), topics: [TRANSFER_TOPIC] },
      ]);
      for (const log of logs) {
        if (log.topics.length < 3) continue;
        const fromAddr = topicToAddress(log.topics[1]);
        const toAddr = topicToAddress(log.topics[2]);
        if (!watched.has(fromAddr) && !watched.has(toAddr)) continue;
        const rawVal = log.data && log.data !== "0x" ? BigInt(log.data) : 0n;
        const meta = await getTokenMeta(log.address.toLowerCase(), budget);
        pushMatches(alerts, watched, {
          fromAddr,
          toAddr,
          amount: fmtAmount(rawVal, meta.decimals),
          symbol: meta.symbol,
          txHash: log.transactionHash,
          // Use the log's own block, not the end of the range: reporting the
          // range end put the wrong block number on every token alert.
          block: log.blockNumber ? hexToNum(log.blockNumber) : to,
        });
      }
    } catch (e) {
      // getLogs failure shouldn't block native alerts; log and continue.
      console.log("getLogs error: " + (e as Error).message);
    }
  }

  // ---- 3) Native balance reconciliation (catches contract payouts) ----
  const addresses = [...watched.keys()];
  let balanceRows: Map<string, { balance: string; block: number }> | null = null;
  const freshBalances = new Map<string, bigint>();
  // 1 D1 read + one explorer call per address chunk.
  if (budget.spend(1 + balanceCallCount(addresses.length))) {
    try {
      balanceRows = await getTrackedBalances(db);
      const current = await getNativeBalances(addresses);
      for (const [addr, value] of current) freshBalances.set(addr, value);

      for (const addr of addresses) {
        const now = freshBalances.get(addr);
        if (now == null) continue;
        const prev = balanceRows.get(addr);
        // First sighting: record a baseline, never alert (the balance predates
        // the watch, so it is not news).
        if (!prev) continue;

        const delta = now - BigInt(prev.balance);
        if (delta === 0n) continue;
        const acct = explained.get(addr) ?? { creditUpper: 0n, debitUpper: 0n };

        if (delta > 0n) {
          const unexplained = delta - acct.creditUpper;
          if (unexplained >= MIN_QUAI_WEI) {
            pushMatches(alerts, watched, {
              fromAddr: "",
              toAddr: addr,
              amount: fmtAmount(unexplained, 18),
              symbol: "QUAI",
              txHash: null,
              block: to,
              dedupKey: `bal:${addr}:${to}`,
              note: "Contract payout or internal transfer",
            });
          }
        } else {
          const drop = -delta;
          const unexplained = drop - acct.debitUpper;
          if (unexplained >= MIN_QUAI_WEI) {
            pushMatches(alerts, watched, {
              fromAddr: addr,
              toAddr: "",
              amount: fmtAmount(unexplained, 18),
              symbol: "QUAI",
              txHash: null,
              block: to,
              dedupKey: `bal:${addr}:${to}`,
              note: "Contract call or internal transfer",
            });
          }
        }
      }
    } catch (e) {
      console.log("balance reconcile error: " + (e as Error).message);
    }
  }

  // ---- 4) Deliver, oldest block first ----
  alerts.sort((a, b) => a.block - b.block);

  // A block counts as done only when every alert in it was handled, so the
  // cursor can never move past an undelivered alert.
  let lastCompleteBlock = to;
  let stopped = false;

  for (const alert of alerts) {
    // 1 claim + 1 send + possible 1 release.
    if (!budget.has(3)) {
      lastCompleteBlock = alert.block - 1;
      stopped = true;
      break;
    }

    budget.spend();
    const owned = await claimAlert(db, alert.dedupKey, alert.address);
    if (!owned) continue; // already delivered by an earlier run

    budget.spend();
    const result = await sendMessage(token, alert.chatId, renderAlert(alert));
    if (!result.ok) {
      if (result.retryable) {
        // Give the claim back so this alert is retried instead of vanishing.
        budget.spend();
        await releaseAlertClaim(db, alert.dedupKey, alert.address);
        lastCompleteBlock = alert.block - 1;
        stopped = true;
        console.log(`telegram retryable failure: ${result.description ?? "unknown"}`);
        break;
      }
      // Permanent failure (bot blocked, chat gone). The claim stays so we don't
      // retry forever, but it is recorded rather than silently swallowed.
      console.log(
        `telegram permanent failure chat=${alert.chatId} code=${result.errorCode ?? "?"}: ${
          result.description ?? "unknown"
        }`,
      );
    }
  }

  // Persist balances only for the range the cursor actually advances over, so a
  // postponed alert is still detectable on the next run.
  if (!stopped) {
    for (const [addr, value] of freshBalances) {
      if (!budget.spend()) break;
      await setTrackedBalance(db, addr, value, to);
    }
  } else if (balanceRows) {
    // Seed only addresses with no baseline yet; leave existing baselines intact
    // so the unexplained delta is re-detected next run.
    for (const [addr, value] of freshBalances) {
      if (balanceRows.has(addr)) continue;
      if (!budget.spend()) break;
      await setTrackedBalance(db, addr, value, to);
    }
  }

  if (lastCompleteBlock >= from) {
    await setState(db, CURSOR_KEY, String(lastCompleteBlock));
  }

  // Housekeeping is cheap but not free: run it about once every 20 minutes.
  if (to % 240 < MAX_BLOCKS_PER_RUN) {
    await pruneAlerts(db);
    await pruneTrackedBalances(db);
  }
}

function pushMatches(
  out: Alert[],
  watched: Map<string, number[]>,
  m: {
    fromAddr: string;
    toAddr: string;
    amount: string;
    symbol: string;
    txHash: string | null;
    block: number;
    dedupKey?: string;
    note?: string;
  },
): void {
  const key = m.dedupKey ?? m.txHash ?? `blk:${m.block}`;
  const inChats = m.toAddr ? watched.get(m.toAddr) : undefined;
  if (inChats) {
    for (const chatId of inChats) {
      out.push({
        chatId,
        direction: "IN",
        amount: m.amount,
        symbol: m.symbol,
        address: m.toAddr,
        counterparty: m.fromAddr || null,
        txHash: m.txHash,
        block: m.block,
        dedupKey: key,
        note: m.note,
      });
    }
  }
  const outChats = m.fromAddr ? watched.get(m.fromAddr) : undefined;
  if (outChats) {
    for (const chatId of outChats) {
      out.push({
        chatId,
        direction: "OUT",
        amount: m.amount,
        symbol: m.symbol,
        address: m.fromAddr,
        counterparty: m.toAddr || null,
        txHash: m.txHash,
        block: m.block,
        dedupKey: key,
        note: m.note,
      });
    }
  }
}

/** Build the alert message. Token symbols are untrusted, so they are escaped. */
function renderAlert(a: Alert): string {
  const icon = a.direction === "IN" ? "📥" : "📤";
  const sign = a.direction === "IN" ? "+" : "-";
  const dirWord = a.direction === "IN" ? "From" : "To";

  const lines = [
    "<b>🔔 Wallet Alert</b>",
    "",
    `${icon} <b>${a.direction}</b>   ${sign}${escapeHtml(a.amount)} ${escapeHtml(a.symbol)}`,
    `<code>${shortAddr(a.address)}</code>`,
  ];
  if (a.counterparty) {
    lines.push(`${dirWord} <code>${shortAddr(a.counterparty)}</code>`);
  }
  if (a.note) {
    lines.push(`<i>${escapeHtml(a.note)}</i>`);
  }
  const blockLine = `Block #${a.block.toLocaleString("en-US")}`;
  lines.push(
    a.txHash
      ? `${blockLine} · <a href="${txUrl(a.txHash)}">View on Quaiscan</a>`
      : blockLine,
  );
  return lines.join("\n");
}
