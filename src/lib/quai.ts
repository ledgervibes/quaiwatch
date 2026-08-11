/**
 * lib/quai.ts — SATU-SATUNYA file yang boleh impor dari `quais`.
 *
 * Kenapa dikurung di sini: `quais` masih status alpha (1.0.0-alpha.56, sudah 2 thn
 * di alpha). API-nya bisa berubah antar rilis alpha. Dengan mengurung semua
 * pemakaiannya di file ini, kalau ada breaking change kita cuma perbaiki 1 file,
 * bukan menyisir seluruh komponen. Sisa aplikasi impor dari sini.
 *
 * Untuk operasi JSON-RPC sederhana kita pakai `fetch` langsung (lebih ringan,
 * kebal breaking change alpha). `quais` dipakai hanya di tempat yang beneran
 * butuh: format unit presisi tinggi, WebSocket provider, decode event, Pelagus.
 */

import { formatUnits, formatQi, WebSocketProvider } from "quais";
import { DEFAULT_ZONE, type ZoneConfig } from "./config";

// ============================================================
// JSON-RPC via fetch (jalur utama, tanpa dependency SDK)
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
 * quai_getLogs — sudah dites tahan rentang 10.000 block sekali panggil.
 * Dipakai scanner alert (Fase 3) untuk menangkap SEMUA token transfer sekaligus.
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
// Konversi Qi <-> QUAI (harga Qi diturunkan dari sini)
// ============================================================

/**
 * quai_qiToQuai: berapa QUAI (wei) untuk sejumlah Qi (dalam "qits").
 *
 * CATATAN DESIMAL PENTING:
 *   1 QUAI = 1e18 wei   (18 desimal, formatQuai)
 *   1 Qi   = 1e3  qits  (3 desimal,  formatQi)   <-- BUKAN 18!
 * Sumber: quais/src/utils/units.ts (formatQi pakai 3 desimal).
 *
 * Rate-nya linear (sudah dites di 1..1e9 qits, per-unit identik), jadi kita
 * query jumlah besar lalu bagi untuk presisi maksimum. Kita pakai arah
 * qiToQuai (BUKAN quaiToQi) karena quaiToQi mengembalikan bilangan bulat qits
 * yang kasar (1 QUAI -> 14 qits, error ~3%).
 */
const QI_DECIMALS = 3;
const QUAI_DECIMALS = 18;

/** 1 Qi dalam qits = 10^3 */
const ONE_QI_IN_QITS = 10n ** BigInt(QI_DECIMALS);

/**
 * Mengembalikan berapa QUAI (float) untuk 1 Qi, pada block tertentu.
 * Query 1_000_000 Qi biar presisi, lalu bagi.
 */
export async function getQiPriceInQuai(
  zone: ZoneConfig = DEFAULT_ZONE,
): Promise<number> {
  const sampleQi = 1_000_000n; // 1 juta Qi
  const sampleQits = sampleQi * ONE_QI_IN_QITS;
  const hexWei = await rpcCall<string>(
    "quai_qiToQuai",
    [numberToHex(sampleQits), "latest"],
    zone,
  );
  const wei = hexToBigInt(hexWei);
  // wei -> QUAI (float), lalu bagi jumlah Qi
  const quaiTotal = Number(formatUnits(wei, QUAI_DECIMALS));
  return quaiTotal / Number(sampleQi);
}

// ============================================================
// Format helpers (pakai quais utils biar presisi 512-bit)
// ============================================================

export function formatQuaiAmount(wei: bigint | string): string {
  return formatUnits(typeof wei === "string" ? hexOrDecToBigInt(wei) : wei, QUAI_DECIMALS);
}

export function formatQiAmount(qits: bigint | string): string {
  return formatQi(typeof qits === "string" ? hexOrDecToBigInt(qits) : qits);
}

/** Format token ERC-20/QRC-20 generik dengan `decimals` sembarang. */
export function formatTokenAmount(raw: bigint | string, decimals: number): string {
  return formatUnits(typeof raw === "string" ? hexOrDecToBigInt(raw) : raw, decimals);
}

// ============================================================
// WebSocket provider (live feed — Fase 1 dashboard)
// ============================================================

/**
 * Membuat WebSocketProvider quais dengan usePathing (wajib buat routing zone Quai).
 * Dipakai di browser untuk live tx feed. Kalau putus, feed cuma berhenti sebentar —
 * konsekuensi kecil, jadi WS di sini aman (beda dgn alert yang butuh anti-bolong).
 */
export function createWsProvider(zone: ZoneConfig = DEFAULT_ZONE): WebSocketProvider {
  return new WebSocketProvider(zone.wss, undefined, { usePathing: true });
}

// ============================================================
// Utils hex/number (murni, tanpa SDK)
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

/** Topic keccak256("Transfer(address,address,uint256)") — standar QRC-20. */
export const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
