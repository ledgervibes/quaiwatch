/**
 * lib/quai.ts — the ONLY file allowed to import from `quais`.
 *
 * Why it is confined here: `quais` is still in alpha status (1.0.0-alpha.56, already 2 yrs
 * in alpha). Its API can change between alpha releases. By confining all of its
 * usage to this file, if there is a breaking change we only fix 1 file,
 * instead of combing through every component. The rest of the app imports from here.
 *
 * For simple JSON-RPC operations we use `fetch` directly (lighter,
 * immune to alpha breaking changes). `quais` is used only where genuinely
 * needed: high-precision unit formatting, WebSocket provider, event decoding, Pelagus.
 */

import { formatUnits, formatQi, WebSocketProvider } from "quais";
import { DEFAULT_ZONE, type ZoneConfig } from "./config";

// ============================================================
// JSON-RPC via fetch (primary path, no SDK dependency)
// ============================================================

type RpcParam = string | number | boolean | object | null;

let rpcId = 0;

export async function rpcCall<T = unknown>(
  method: string,
  params: RpcParam[] = [],
  zone: ZoneConfig = DEFAULT_ZONE,
  signal?: AbortSignal,
): Promise<T> {
  const res = await fetch(zone.rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method, params, id: ++rpcId }),
    signal,
  });
  if (!res.ok) {
    throw new Error(`RPC ${method} HTTP ${res.status}`);
  }
  const json = (await res.json()) as {
    result?: T;
    error?: { code: number; message: string };
  };
  if (json.error) {
    throw new Error(`RPC ${method} error ${json.error.code}: ${json.error.message}`);
  }
  return json.result as T;
}

// ---- RPC helpers ----

export async function getBlockNumber(zone: ZoneConfig = DEFAULT_ZONE): Promise<number> {
  const hex = await rpcCall<string>("quai_blockNumber", [], zone);
  return hexToNumber(hex);
}

export async function getGasPrice(zone: ZoneConfig = DEFAULT_ZONE): Promise<bigint> {
  const hex = await rpcCall<string>("quai_gasPrice", [], zone);
  return hexToBigInt(hex);
}

export type QuaiBlock = {
  hash: string;
  header: Record<string, unknown>;
  woHeader: {
    number: string;
    difficulty: string;
    primaryCoinbase: string;
    timestamp: string;
    [k: string]: unknown;
  };
  transactions: unknown[];
  size: string;
};

export async function getBlockByNumber(
  blockNumber: number | "latest",
  withTx = false,
  zone: ZoneConfig = DEFAULT_ZONE,
  signal?: AbortSignal,
): Promise<QuaiBlock | null> {
  const tag = blockNumber === "latest" ? "latest" : numberToHex(blockNumber);
  return rpcCall<QuaiBlock | null>("quai_getBlockByNumber", [tag, withTx], zone, signal);
}

export type QuaiLog = {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  transactionHash: string;
  logIndex: string;
};

/**
 * quai_getLogs — tested to withstand a 10,000 block range in a single call.
 * Used by the alert scanner (Phase 3) to capture ALL token transfers at once.
 */
export async function getLogs(
  fromBlock: number,
  toBlock: number,
  topics?: (string | null)[],
  zone: ZoneConfig = DEFAULT_ZONE,
  signal?: AbortSignal,
): Promise<QuaiLog[]> {
  return rpcCall<QuaiLog[]>(
    "quai_getLogs",
    [{ fromBlock: numberToHex(fromBlock), toBlock: numberToHex(toBlock), ...(topics ? { topics } : {}) }],
    zone,
    signal,
  );
}

// ============================================================
// Qi <-> QUAI conversion (Qi price is derived from here)
// ============================================================

/**
 * quai_qiToQuai: how many QUAI (wei) for a given amount of Qi (in "qits").
 *
 * IMPORTANT DECIMAL NOTE:
 *   1 QUAI = 1e18 wei   (18 decimals, formatQuai)
 *   1 Qi   = 1e3  qits  (3 decimals,  formatQi)   <-- NOT 18!
 * Source: quais/src/utils/units.ts (formatQi uses 3 decimals).
 *
 * The rate is linear (tested at 1..1e9 qits, per-unit identical), so we
 * query a large amount then divide for maximum precision. We use the
 * qiToQuai direction (NOT quaiToQi) because quaiToQi returns coarse integer qits
 * (1 QUAI -> 14 qits, ~3% error).
 */
const QI_DECIMALS = 3;
const QUAI_DECIMALS = 18;

/** 1 Qi in qits = 10^3 */
const ONE_QI_IN_QITS = 10n ** BigInt(QI_DECIMALS);

/**
 * Returns how many QUAI (float) for 1 Qi, at a given block.
 * Query 1_000_000 Qi for precision, then divide.
 */
export async function getQiPriceInQuai(
  zone: ZoneConfig = DEFAULT_ZONE,
): Promise<number> {
  const sampleQi = 1_000_000n; // 1 million Qi
  const sampleQits = sampleQi * ONE_QI_IN_QITS;
  const hexWei = await rpcCall<string>(
    "quai_qiToQuai",
    [numberToHex(sampleQits), "latest"],
    zone,
  );
  const wei = hexToBigInt(hexWei);
  // wei -> QUAI (float), then divide by the number of Qi
  const quaiTotal = Number(formatUnits(wei, QUAI_DECIMALS));
  return quaiTotal / Number(sampleQi);
}

// ============================================================
// Format helpers (use quais utils for 512-bit precision)
// ============================================================

export function formatQuaiAmount(wei: bigint | string): string {
  return formatUnits(typeof wei === "string" ? hexOrDecToBigInt(wei) : wei, QUAI_DECIMALS);
}

export function formatQiAmount(qits: bigint | string): string {
  return formatQi(typeof qits === "string" ? hexOrDecToBigInt(qits) : qits);
}

/** Format a generic ERC-20/QRC-20 token with arbitrary `decimals`. */
export function formatTokenAmount(raw: bigint | string, decimals: number): string {
  return formatUnits(typeof raw === "string" ? hexOrDecToBigInt(raw) : raw, decimals);
}

// ============================================================
// WebSocket provider (live feed — Phase 1 dashboard)
// ============================================================

/**
 * Creates a quais WebSocketProvider with usePathing (required for Quai zone routing).
 * Used in the browser for the live tx feed. If it disconnects, the feed just pauses briefly —
 * a minor consequence, so WS is safe here (unlike alerts which need gap-free coverage).
 */
export function createWsProvider(zone: ZoneConfig = DEFAULT_ZONE): WebSocketProvider {
  return new WebSocketProvider(zone.wss, undefined, { usePathing: true });
}

// ============================================================
// hex/number utils (pure, no SDK)
// ============================================================

export function hexToNumber(hex: string): number {
  return parseInt(hex, 16);
}

export function hexToBigInt(hex: string): bigint {
  return BigInt(hex);
}

export function numberToHex(n: number | bigint): string {
  return "0x" + n.toString(16);
}

function hexOrDecToBigInt(v: string): bigint {
  return v.startsWith("0x") ? BigInt(v) : BigInt(v);
}

/** keccak256("Transfer(address,address,uint256)") topic — QRC-20 standard. */
export const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
