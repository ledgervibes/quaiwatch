/**
 * lib/defi.ts — Phase 6 DeFi & SOAP analytics (100% free, official Quai sources only).
 *
 * DATA SOURCE — OFFICIAL EXPLORER, NOT LOCAL DERIVATION:
 *   DEX figures come from the official Quai Explorer's TVL endpoint
 *   (`GET /api/stats/tvl`, proxied same-origin), which publishes the numbers Quai
 *   itself shows on its TVL & DeFi page. It attributes them to the Quainance
 *   factory (`source.id: "quainance"`, `source.kind: "subgraph"`) and returns
 *   per-pool TVL, 24h volume, estimated fees, and decimal-adjusted reserves.
 *
 * WHY THIS REPLACED THE LOCAL POOL SCAN:
 *   The earlier implementation discovered pools by scanning the token registry
 *   for the LP symbol "UNI-V2", then priced them from raw reserves via RPC. Two
 *   problems, both verified live:
 *     1. Every "UNI-V2" token on Cyprus-1 belongs to an unrelated Uniswap-V2
 *        deployment (factory 0x0006112e...bc57a9, 18 pairs). Quainance LP tokens
 *        are "QNCE-V2" and were never matched. QuaiWatch was reporting ~$75.8k
 *        TVL from third-party pools while the official figure was ~$10.5k.
 *     2. Discovery depended on Quaiscan's /tokens feed, which stops after ~51
 *        tokens, so results were incomplete regardless.
 *   Reading the explorer directly removes both the wrong-source risk and ~46 RPC
 *   calls per page load, and guarantees QuaiWatch agrees with Quai's own site.
 *
 * TOKEN PRICES:
 *   Derived from each pool's WQUAI-side reserve (WQUAI ≈ 1 QUAI) using the
 *   explorer's decimal-adjusted reserves. Pools not paired against WQUAI (e.g.
 *   WQI/USDT) carry no QUAI-denominated price and are reported without one.
 *
 * SOAP:
 *   100% of merge-mining subsidies buy QUAI which is burned at SOAP_BURN_ADDRESS.
 *   We read the burn address' native QUAI balance (cumulative buy-and-burn
 *   holding) and its inbound transaction history — no paid API.
 */

import { WQUAI, SOAP_BURN_ADDRESS } from "./config";
import { formatQuaiAmount, hexToBigInt } from "./quai";
import { getExplorerTvl, explorerNumber, type ExplorerTvlPool } from "./explorer";
import {
  getAddress,
  getAddressTxs,
  type Tx,
  type PageParams,
  type Paginated,
} from "./quaiscan";

/** A Quainance liquidity pool, as published by the official explorer. */
export type Pool = {
  /** Pair contract address. */
  pair: string;
  /** Human-readable pair name from the explorer, e.g. "USDT/WQUAI". */
  name: string;
  /** The non-WQUAI token of the pair (or token0 when neither side is WQUAI). */
  token: { address: string; symbol: string };
  /** Price of 1 `token` in QUAI. Null when the pool is not WQUAI-paired. */
  priceInQuai: number | null;
  /** Pool TVL in USD, straight from the explorer. */
  tvlUsd: number;
  /** 24h traded volume in USD. */
  volume24hUsd: number;
  /** Estimated 24h fees in USD (explorer flags these as estimates). */
  estimatedFees24hUsd: number;
  /** Lifetime transaction count for the pool. */
  txCount: number;
};

/** Aggregate DEX statistics, straight from the official explorer. */
export type DexStats = {
  pools: Pool[];
  tvlUsd: number;
  totalVolumeUsd: number;
  volume24hUsd: number;
  estimatedFees24hUsd: number;
  pairCount: number;
  txCount: number;
  /** Which factory / indexer the explorer attributes these figures to. */
  sourceId: string;
  factoryAddress: string;
  /** True when the explorer considers its own snapshot stale. */
  stale: boolean;
  observedAt: string;
};

/** Derive the token price in QUAI from a pool's WQUAI-side reserve. */
function priceFromPool(pool: ExplorerTvlPool): {
  token: { address: string; symbol: string };
  priceInQuai: number | null;
} {
  const isToken0Wquai = pool.token0.address.toLowerCase() === WQUAI.addressLower;
  const isToken1Wquai = pool.token1.address.toLowerCase() === WQUAI.addressLower;

  // Reserves from this endpoint are already decimal-adjusted.
  const reserve0 = explorerNumber(pool.reserve0);
  const reserve1 = explorerNumber(pool.reserve1);

  if (isToken1Wquai && reserve0 > 0) {
    return { token: pool.token0, priceInQuai: reserve1 / reserve0 };
  }
  if (isToken0Wquai && reserve1 > 0) {
    return { token: pool.token1, priceInQuai: reserve0 / reserve1 };
  }
  // Not WQUAI-paired — no verified QUAI-denominated base to price against.
  return { token: pool.token0, priceInQuai: null };
}

/** Official Quainance DEX statistics. */
export async function getDexStats(signal?: AbortSignal): Promise<DexStats> {
  const tvl = await getExplorerTvl(7, { signal });

  const pools: Pool[] = (tvl.pools ?? []).map((pool) => {
    const { token, priceInQuai } = priceFromPool(pool);
    return {
      pair: pool.address,
      name: pool.name,
      token,
      priceInQuai,
      tvlUsd: explorerNumber(pool.tvlUsd),
      volume24hUsd: explorerNumber(pool.volume24hUsd),
      estimatedFees24hUsd: explorerNumber(pool.estimatedFees24hUsd),
      txCount: Number(pool.txCount) || 0,
    };
  });

  pools.sort((a, b) => b.tvlUsd - a.tvlUsd);

  return {
    pools,
    tvlUsd: explorerNumber(tvl.current?.tvlUsd),
    totalVolumeUsd: explorerNumber(tvl.current?.totalVolumeUsd),
    volume24hUsd: explorerNumber(tvl.current?.volume24hUsd),
    estimatedFees24hUsd: explorerNumber(tvl.current?.estimatedFees24hUsd),
    pairCount: Number(tvl.current?.pairCount) || pools.length,
    txCount: Number(tvl.current?.txCount) || 0,
    sourceId: tvl.source?.id ?? "unknown",
    factoryAddress: tvl.source?.factoryAddress ?? "",
    stale: tvl.stale ?? false,
    observedAt: tvl.current?.observedAt ?? tvl.freshness?.observedAt ?? "",
  };
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

/** Read the SOAP burn address' native QUAI balance. */
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
