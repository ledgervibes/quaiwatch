/**
 * worker/scanner.ts — scans new blocks + token Transfer logs, matches them
 * against the watchlist, and sends Telegram alerts.
 *
 * Rules:
 *  - Native QUAI transfer (tx type 0x0, value >= 1 QUAI): alert.
 *  - Any QRC-20 Transfer log: alert (no minimum).
 *  - Coinbase / miner reward (etxType present, type 0x1): ignored.
 *  - Qi: not possible (no public RPC method).
 */

import { rpc, rpcBatch, formatUnits, fmtAmount, hexToNum, numToHex, TRANSFER_TOPIC } from "./rpc";
import {
  getState,
  setState,
  allWatched,
  alreadyAlerted,
  pruneAlerts,
  type Env,
} from "./db";
import { sendMessage, shortAddr, txUrl } from "./telegram";

const CURSOR_KEY = "last_scanned_block";
const MIN_QUAI_WEI = 10n ** 18n; // 1 QUAI
const MAX_BLOCKS_PER_RUN = 60; // safety cap per cron tick
const MAX_ALERTS_PER_RUN = 40; // stay well under 50-subrequest limit
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
  etxType?: string;
};
type Log = {
  address: string;
  topics: string[];
  data: string;
  transactionHash: string;
};

/** Extract a 20-byte address from a 32-byte padded topic. */
function topicToAddress(topic: string): string {
  return ("0x" + topic.slice(-40)).toLowerCase();
}

/** Cache of token symbol/decimals to avoid re-querying every run. */
const tokenMeta = new Map<string, { symbol: string; decimals: number; at: number }>();

async function getTokenMeta(addr: string): Promise<{ symbol: string; decimals: number }> {
  const cached = tokenMeta.get(addr);
  if (cached && Date.now() - cached.at < TOKEN_META_TTL) return cached;
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
  counterparty: string;
  txHash: string;
  block: number;
};

export async function scan(env: Env): Promise<void> {
  const db = env.DB;
  const token = env.TELEGRAM_BOT_TOKEN;

  const watched = await allWatched(db); // address -> chatIds
  const latest = hexToNum(await rpc<string>("quai_blockNumber"));

  const cursorRaw = await getState(db, CURSOR_KEY);
  let from = cursorRaw ? parseInt(cursorRaw, 10) + 1 : latest - 1;
  // Confirm 1 block back to avoid reorg edge; cap the span.
  const to = latest - 1;
  if (to < from) {
    return; // nothing new
  }
  if (to - from + 1 > MAX_BLOCKS_PER_RUN) {
    from = to - MAX_BLOCKS_PER_RUN + 1;
  }

  // If nobody is watching anything, just advance the cursor cheaply.
  if (watched.size === 0) {
    await setState(db, CURSOR_KEY, String(to));
    await pruneAlerts(db);
    return;
  }

  const alerts: Alert[] = [];

  // ---- 1) Native QUAI transfers: batch-fetch blocks with full tx ----
  const blockReqs = [];
  for (let b = from; b <= to; b++) {
    blockReqs.push({ method: "quai_getBlockByNumber", params: [numToHex(b), true], id: b });
  }
  const blocks = await rpcBatch<Block>(blockReqs);
  for (const blk of blocks) {
    if (!blk?.transactions) continue;
    const blkNum = hexToNum(blk.woHeader.number);
    for (const tx of blk.transactions) {
      // Skip coinbase / external miner payouts and any non type-0 tx.
      if (tx.type !== "0x0" || tx.etxType) continue;
      if (!tx.value || tx.value === "0x0") continue;
      const value = BigInt(tx.value);
      if (value < MIN_QUAI_WEI) continue;
      const fromAddr = (tx.from ?? "").toLowerCase();
      const toAddr = (tx.to ?? "").toLowerCase();
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

  // ---- 2) Token transfers: one getLogs for the whole range ----
  try {
    const logs = await rpc<Log[]>("quai_getLogs", [
      { fromBlock: numToHex(from), toBlock: numToHex(to), topics: [TRANSFER_TOPIC] },
    ]);
    // Only fetch metadata for tokens that actually hit a watched address.
    for (const log of logs) {
      if (log.topics.length < 3) continue;
      const fromAddr = topicToAddress(log.topics[1]);
      const toAddr = topicToAddress(log.topics[2]);
      if (!watched.has(fromAddr) && !watched.has(toAddr)) continue;
      const rawVal = log.data && log.data !== "0x" ? BigInt(log.data) : 0n;
      const meta = await getTokenMeta(log.address.toLowerCase());
      pushMatches(alerts, watched, {
        fromAddr,
        toAddr,
        amount: fmtAmount(rawVal, meta.decimals),
        symbol: meta.symbol,
        txHash: log.transactionHash,
        block: to,
      });
    }
  } catch (e) {
    // getLogs failure shouldn't block native alerts; log and continue.
    console.log("getLogs error: " + (e as Error).message);
  }

  // ---- 3) Send alerts (dedup + cap) ----
  let sent = 0;
  for (const a of alerts) {
    if (sent >= MAX_ALERTS_PER_RUN) break;
    const dup = await alreadyAlerted(db, a.txHash, a.address);
    if (dup) continue;
    await sendAlert(token, a);
    sent++;
    // gentle rate limit: 1 msg/sec per chat handled by Telegram; small delay is enough
  }

  await setState(db, CURSOR_KEY, String(to));
  await pruneAlerts(db);
}

function pushMatches(
  out: Alert[],
  watched: Map<string, number[]>,
  m: {
    fromAddr: string;
    toAddr: string;
    amount: string;
    symbol: string;
    txHash: string;
    block: number;
  },
): void {
  const inChats = watched.get(m.toAddr);
  if (inChats) {
    for (const chatId of inChats) {
      out.push({
        chatId,
        direction: "IN",
        amount: m.amount,
        symbol: m.symbol,
        address: m.toAddr,
        counterparty: m.fromAddr,
        txHash: m.txHash,
        block: m.block,
      });
    }
  }
  const outChats = watched.get(m.fromAddr);
  if (outChats) {
    for (const chatId of outChats) {
      out.push({
        chatId,
        direction: "OUT",
        amount: m.amount,
        symbol: m.symbol,
        address: m.fromAddr,
        counterparty: m.toAddr,
        txHash: m.txHash,
        block: m.block,
      });
    }
  }
}

async function sendAlert(token: string, a: Alert): Promise<void> {
  const icon = a.direction === "IN" ? "📥" : "📤";
  const sign = a.direction === "IN" ? "+" : "-";
  const dirWord = a.direction === "IN" ? "From" : "To";
  const text =
    "<b>🔔 Wallet Alert</b>\n\n" +
    `${icon} <b>${a.direction}</b>   ${sign}${a.amount} ${a.symbol}\n` +
    `<code>${shortAddr(a.address)}</code>\n` +
    `${dirWord} <code>${shortAddr(a.counterparty)}</code>\n` +
    `Block #${a.block.toLocaleString("en-US")} · <a href="${txUrl(a.txHash)}">View on Quaiscan</a>`;
  await sendMessage(token, a.chatId, text);
}
