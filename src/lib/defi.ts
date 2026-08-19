/**
 * lib/defi.ts — Phase 6 DeFi & SOAP analytics (100% free: public RPC + Quaiscan).
 *
 * DEX MODEL (verified on-chain, Cyprus-1):
 *   All Uniswap-V2 style pairs discovered on Quaiscan (symbol "UNI-V2") pair a
 *   token against WQUAI (Wrapped Quai). We read `getReserves()`, `token0()`,
 *   `token1()` directly via quai_call and derive:
 *     - Pool TVL in QUAI = 2 × WQUAI-side reserve (both sides are ~equal value in a
 *       constant-product AMM, so total value ≈ 2× the QUAI side).
 *     - Token price in QUAI = (WQUAI reserve / token reserve), decimals-adjusted.
 *   USD values require the live QUAI/USD price (passed in from lib/price.ts).
 *
 * SOAP:
 *   100% of merge-mining subsidies buy QUAI which is burned at SOAP_BURN_ADDRESS.
 *   We read the burn address' native QUAI balance (cumulative buy-and-burn holding)
 *   and its inbound transaction history from Quaiscan — no paid API.
 *
 * All raw amounts stay as bigint until the final display conversion.
 */

import { WQUAI, SOAP_BURN_ADDRESS } from "./config";
import { rpcBatch, formatQuaiAmount, hexToBigInt } from "./quai";
import {
  getToken,
  getTokens,
  getAddress,
  getAddressTxs,
  type TokenInfo,
  type Tx,
  type PageParams,
  type Paginated,
} from "./quaiscan";

// Uniswap-V2 function selectors (keccak256 of the signature, first 4 bytes).
const SELECTOR = {
  token0: "0x0dfe1681",
  token1: "0xd21220a7",
  getReserves: "0x0902f1ac",
} as const;

/** A DEX liquidity pool paired against WQUAI. */
export type Pool = {
  /** Pair (LP token) contract address. */
  pair: string;
  /** The non-WQUAI token in the pair. */
  token: TokenInfo;
  /** Raw reserve of `token` (its own decimals). */
  tokenReserve: bigint;
  /** Raw reserve of WQUAI (18 decimals). */
  wquaiReserve: bigint;
  /** Price of 1 `token` in QUAI, decimals-adjusted. */
  priceInQuai: number;
  /** Pool TVL in QUAI (≈ 2× the WQUAI reserve). */
  tvlQuai: number;
};

const HEX_WORD = 64; // 32 bytes = 64 hex chars

/** Extract an address from a 32-byte ABI word (last 20 bytes). */
function addressFromWord(word: string): string {
  const hex = word.startsWith("0x") ? word.slice(2) : word;
  return "0x" + hex.slice(-40).toLowerCase();
}

/**
 * Decode getReserves() output: (uint112 reserve0, uint112 reserve1, uint32 ts).
 * Returns the first two reserves as bigint.
 */
function decodeReserves(data: string): { reserve0: bigint; reserve1: bigint } {
  const hex = data.startsWith("0x") ? data.slice(2) : data;
  const reserve0 = BigInt("0x" + hex.slice(0, HEX_WORD));
  const reserve1 = BigInt("0x" + hex.slice(HEX_WORD, HEX_WORD * 2));
  return { reserve0, reserve1 };
}

type CallReq = { to: string; data: string };

function callReq(to: string, data: string, id: number) {
  return { method: "quai_call", params: [{ to, data } as CallReq, "latest"], id };
}

/** All Uniswap-V2 LP pairs are listed on Quaiscan with the symbol "UNI-V2". */
async function discoverPairAddresses(signal?: AbortSignal): Promise<string[]> {
  const seen = new Set<string>();
  let params: PageParams = null;
  // Cap at 3 pages — there are only a handful of pairs today, this is defensive.
  for (let page = 0; page < 3; page++) {
    const res: Paginated<TokenInfo> = await getTokens(params, signal);
    for (const t of res.items) {
      if (t.symbol === "UNI-V2") seen.add(t.address);
    }
    if (!res.next_page_params) break;
    params = res.next_page_params;
  }
  return [...seen];
}

/**
 * Build the full pool set: for each pair, read token0/token1/getReserves in one
 * batched RPC call, identify the WQUAI side, resolve the paired token's metadata,
 * and compute price + TVL. Pools whose reserves are zero or that don't include
 * WQUAI are skipped (we only price against the verified WQUAI base asset).
 */
export async function getPools(signal?: AbortSignal): Promise<Pool[]> {
  const pairs = await discoverPairAddresses(signal);
  if (pairs.length === 0) return [];

  // One batch: 3 calls per pair.
  const reqs = pairs.flatMap((pair, i) => [
    callReq(pair, SELECTOR.token0, i * 3 + 0),
    callReq(pair, SELECTOR.token1, i * 3 + 1),
    callReq(pair, SELECTOR.getReserves, i * 3 + 2),
  ]);
  const results = await rpcBatch<string>(reqs, undefined, signal);

  type Raw = {
    pair: string;
    tokenAddr: string;
    tokenReserve: bigint;
    wquaiReserve: bigint;
  };
  const raws: Raw[] = [];

  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i];
    const token0Res = results[i * 3 + 0];
    const token1Res = results[i * 3 + 1];
    const reservesRes = results[i * 3 + 2];
    if (!token0Res || !token1Res || !reservesRes) continue;

    const token0 = addressFromWord(token0Res);
    const token1 = addressFromWord(token1Res);
    const { reserve0, reserve1 } = decodeReserves(reservesRes);

    let tokenAddr: string;
    let tokenReserve: bigint;
    let wquaiReserve: bigint;
    if (token0 === WQUAI.addressLower) {
      wquaiReserve = reserve0;
      tokenAddr = token1;
      tokenReserve = reserve1;
    } else if (token1 === WQUAI.addressLower) {
      wquaiReserve = reserve1;
      tokenAddr = token0;
      tokenReserve = reserve0;
    } else {
      continue; // not a WQUAI pair — skip (no verified base to price against)
    }

    if (wquaiReserve === 0n || tokenReserve === 0n) continue;
    raws.push({ pair, tokenAddr, tokenReserve, wquaiReserve });
  }

  // Resolve token metadata (decimals/symbol) for each paired token, in parallel.
  const tokens = await Promise.all(
    raws.map((r) =>
      getToken(r.tokenAddr, signal).catch(() => null),
    ),
  );

  const pools: Pool[] = [];
  for (let i = 0; i < raws.length; i++) {
    const r = raws[i];
    const token = tokens[i];
    if (!token) continue;

    const tokenDecimals = Number(token.decimals || 18);
    const wquaiHuman = Number(formatQuaiAmount(r.wquaiReserve)); // 18 decimals
    const tokenHuman = Number(formatUnitsFloat(r.tokenReserve, tokenDecimals));

    // Constant-product AMM: price of token in QUAI = WQUAI reserve / token reserve.
    const priceInQuai = tokenHuman > 0 ? wquaiHuman / tokenHuman : 0;
    // Total pool value ≈ 2× the QUAI-denominated side.
    const tvlQuai = wquaiHuman * 2;

    pools.push({
      pair: r.pair,
      token,
      tokenReserve: r.tokenReserve,
      wquaiReserve: r.wquaiReserve,
      priceInQuai,
      tvlQuai,
    });
  }

  // Highest TVL first.
  pools.sort((a, b) => b.tvlQuai - a.tvlQuai);
  return pools;
}

/** Sum of all pool TVLs, in QUAI. */
export function totalTvlQuai(pools: Pool[]): number {
  return pools.reduce((sum, p) => sum + p.tvlQuai, 0);
}

/** Lightweight float unit formatter (avoids quais dependency for arbitrary decimals). */
function formatUnitsFloat(raw: bigint, decimals: number): string {
  const s = raw.toString().padStart(decimals + 1, "0");
  const int = s.slice(0, s.length - decimals) || "0";
  const frac = s.slice(s.length - decimals);
  return `${int}.${frac}`;
}

// ============================================================
// SOAP buyback-and-burn
// ============================================================

export type SoapStats = {
  /** Cumulative QUAI held at the burn address (buy-and-burn holding), as bigint wei. */
  burnedWei: bigint;
  /** Human-readable QUAI amount. */
  burnedQuai: number;
  /** Number of transactions to the burn address (Quaiscan counter proxy). */
  txCount: number | null;
};

/** Read the SOAP burn address' native QUAI balance from Quaiscan. */
export async function getSoapStats(signal?: AbortSignal): Promise<SoapStats> {
  const addr = await getAddress(SOAP_BURN_ADDRESS, signal);
  const burnedWei = addr.coin_balance ? hexToBigIntSafe(addr.coin_balance) : 0n;
  return {
    burnedWei,
    burnedQuai: Number(formatQuaiAmount(burnedWei)),
    txCount: null,
  };
}

/** Recent transactions into the SOAP burn address (buyback deposits). */
export function getSoapTxs(
  params?: PageParams,
  signal?: AbortSignal,
): Promise<Paginated<Tx>> {
  return getAddressTxs(SOAP_BURN_ADDRESS, params, signal);
}

/** Quaiscan returns coin_balance as a decimal string, not hex. */
function hexToBigIntSafe(v: string): bigint {
  return v.startsWith("0x") ? hexToBigInt(v) : BigInt(v);
}
