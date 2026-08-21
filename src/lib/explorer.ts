/**
 * lib/explorer.ts — client for the official Quai Explorer, via same-origin proxy.
 *
 * IMPORTANT: never fetch https://explorer.qu.ai directly from the browser — that
 * host sends no CORS headers. Every call here goes to `/api/explorer/*`, a
 * Cloudflare Pages Function that proxies the explorer server-side. See
 * functions/api/explorer/[[path]].ts and QUAI_EXPLORER_PROXY in config.ts.
 *
 * The explorer uses a custom indexed API, so its response types stay isolated
 * from the Blockscout-compatible client in quaiscan.ts.
 *
 * ENDPOINT STATUS (verified live 2026-08): some address sub-resources return
 * HTTP 503 while the explorer's exact-trace repair is still running:
 *   - /address/{a}/balance-history      → 503 for every address tested
 *   - /address/{a}/lockups(+/summary)   → 503 for every address tested
 *   - /address/{a}/transactions         → 503 for LOW-activity wallets,
 *                                          200 for high-activity ones
 * These are treated as "not ready yet": callers should fall back (quaiscan) or
 * hide the section rather than surface a raw error. See ExplorerUnavailableError.
 */
import { QUAI_EXPLORER_PROXY } from "./config";

type FetchOptions = { signal?: AbortSignal; timeoutMs?: number; retries?: number };

const DEFAULT_TIMEOUT_MS = 12_000;

/** Thrown when the explorer indicates an endpoint isn't ready (503/502/504). */
export class ExplorerUnavailableError extends Error {
  status: number;
  constructor(path: string, status: number) {
    super(`Quai Explorer ${path} is not available yet (HTTP ${status})`);
    this.name = "ExplorerUnavailableError";
    this.status = status;
  }
}

/** True if this error means "endpoint not ready", so the caller can fall back. */
export function isExplorerUnavailable(error: unknown): boolean {
  return error instanceof ExplorerUnavailableError;
}

async function get<T>(path: string, options?: FetchOptions): Promise<T> {
  const retries = options?.retries ?? 1;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let lastError: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    // Compose an abort signal that fires on either the caller's signal or the timeout.
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    options?.signal?.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${QUAI_EXPLORER_PROXY}${path}`, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      if (response.status === 503 || response.status === 502 || response.status === 504) {
        // Transient/not-ready: retry once, then surface a typed error.
        if (attempt < retries) {
          lastError = new ExplorerUnavailableError(path, response.status);
          continue;
        }
        throw new ExplorerUnavailableError(path, response.status);
      }
      if (!response.ok) throw new Error(`Quai Explorer ${path} HTTP ${response.status}`);
      return (await response.json()) as T;
    } catch (cause) {
      lastError = cause;
      // Don't retry a caller-initiated abort.
      if (options?.signal?.aborted) throw cause;
      if (attempt >= retries) throw cause;
    } finally {
      clearTimeout(timer);
      options?.signal?.removeEventListener("abort", onAbort);
    }
  }
  throw lastError ?? new Error(`Quai Explorer ${path} failed`);
}

export type ExplorerPrice = {
  quai: { usd: number; takenAt: string; source: string };
  qi: { usd: number; takenAt: string; source: string };
};

export type ExplorerTokenBalance = {
  id: string;
  address: string;
  token_address: string;
  balance: string;
  last_updated_block: string;
  token: {
    contract_address: string;
    name: string;
    symbol: string;
    decimals: number;
    type: string;
    icon_url: string | null;
  };
};

export type ExplorerTokenBalancesResponse = {
  items: ExplorerTokenBalance[];
  total: number;
  limit: number;
  offset: number;
};

export type ExplorerAddress = {
  address: string;
  info: {
    address: string;
    type: string | null;
    label: string | null;
    first_seen?: string | null;
    last_seen?: string | null;
    balance_quai: string;
    locked_balance_quai: string;
    balance_qi: string;
    locked_balance_qi: string;
    nonce: string;
    tx_count: string;
    internal_tx_count: string;
    token_transfer_count: string;
    last_balance_block: string;
  };
  txs: unknown[];
};

export function getExplorerPrice(options?: FetchOptions) {
  return get<ExplorerPrice>("/api/price/current", options);
}

export function getExplorerAddress(address: string, options?: FetchOptions) {
  return get<ExplorerAddress>(`/api/address/${encodeURIComponent(address)}`, options);
}

export function getExplorerTokenBalances(address: string, options?: FetchOptions) {
  return get<ExplorerTokenBalancesResponse>(
    `/api/address/${encodeURIComponent(address)}/token-balances`,
    options,
  );
}

/**
 * One row from the Etherscan-compatible txlist surface.
 * Values are decimal strings (not hex), timeStamp is unix seconds.
 */
export type ExplorerTxListItem = {
  blockNumber: string;
  timeStamp: string;
  hash: string;
  from: string;
  to: string;
  value: string;
  gasUsed: string;
  gasPrice: string;
  isError: string;
  txreceipt_status: string;
  contractAddress: string;
  input: string;
};

type EtherscanEnvelope<T> = { status: string; message: string; result: T };

/**
 * Address transaction history via the explorer's Etherscan-compatible endpoint.
 *
 * WHY NOT /api/address/{a}/transactions: that native endpoint returns HTTP 503
 * for low-activity wallets (verified live) — exactly the common case for a
 * personal wallet. WHY NOT Quaiscan: measured 23-73s for the same data, and its
 * v1 txlist returned 522/timeout. This surface answers in well under 2s for
 * every address tested, including the ones the native endpoint 503s on.
 *
 * Cross-checked against Quaiscan v2 for the same address: identical block
 * numbers, hashes, and values for the 10 most recent transactions.
 *
 * `page` is 1-based and verified to work for deep paging (page 2 and 3 return
 * older, non-overlapping rows).
 */
export async function getExplorerAddressTxList(
  address: string,
  limit = 15,
  page = 1,
  options?: FetchOptions,
): Promise<ExplorerTxListItem[]> {
  const params = new URLSearchParams({
    module: "account",
    action: "txlist",
    address,
    sort: "desc",
    page: String(page),
    offset: String(limit),
  });
  const envelope = await get<EtherscanEnvelope<ExplorerTxListItem[] | string>>(
    `/api?${params.toString()}`,
    options,
  );
  // The envelope uses status "0" with a string result for "no transactions found".
  if (envelope.status !== "1" || !Array.isArray(envelope.result)) return [];
  return envelope.result;
}

/**
 * Official Quainance TVL / DEX statistics.
 *
 * This is the same data the Quai Explorer publishes on its TVL & DeFi page, so
 * QuaiWatch reports exactly the numbers Quai itself reports. `source` names the
 * factory the figures are attributed to, and `reserve0`/`reserve1` are already
 * decimal-adjusted (unlike raw on-chain reserves).
 */
export type ExplorerTvlPool = {
  address: string;
  name: string;
  token0: { address: string; symbol: string };
  token1: { address: string; symbol: string };
  reserve0: string;
  reserve1: string;
  tvlUsd: string;
  totalVolumeUsd: string;
  volume24hUsd: string;
  estimatedFees24hUsd: string;
  txCount: string;
  volume24hCoverage: string;
};

export type ExplorerTvl = {
  days: number;
  stale: boolean;
  source: {
    id: string;
    kind: string;
    factoryAddress: string;
    feeRateBps: string;
    feesAreEstimated: boolean;
  };
  freshness: { observedAt: string; ageSeconds: number; staleAfterSeconds: number };
  current: {
    observedAt: string;
    tvlUsd: string;
    totalVolumeUsd: string;
    volume24hUsd: string;
    estimatedFees24hUsd: string;
    pairCount: string;
    txCount: string;
    indexedPoolCount: number;
  };
  pools: ExplorerTvlPool[];
};

/** Official DEX/TVL stats. `days` selects the history window (1, 7, or 30). */
export function getExplorerTvl(days: 1 | 7 | 30 = 7, options?: FetchOptions) {
  return get<ExplorerTvl>(`/api/stats/tvl?days=${days}`, options);
}

// ============================================================
// Mining (official)
// ============================================================

/**
 * Per-algorithm hashrate and difficulty.
 *
 * `measurement.semantics` is "observed_share_work" from
 * `quai_getMiningInfo` on go-quai v0.55 — this is a real hashrate figure, unlike
 * a per-miner block count, which only describes block distribution.
 */
export type ExplorerHashrate = {
  asOf: string;
  avgBlockTime: number;
  blockCount: number;
  hashratesExact: { kawpow: string; sha: string; scrypt: string };
  difficultiesExact: { kawpow: string; sha: string; scrypt: string };
  measurement: {
    source: string;
    semantics: string;
    trailingWindowSeconds: number;
    blockNumber: string;
  };
};

export function getExplorerHashrate(options?: FetchOptions) {
  return get<ExplorerHashrate>("/api/stats/hashrate", options);
}

/**
 * Mining summary. `minerCounts` maps miner address -> blocks mined in the window.
 *
 * IMPORTANT: only `minutes=1440` returns a populated result. Verified live —
 * minutes=60 and minutes=360 both return a single miner and an empty
 * `minerCoverage.blocks.sampledRows`, so shorter windows are not usable.
 *
 * `hashrateHistory` returns a single point, so it cannot drive a trend chart.
 * (For an hourly hashrate series, see the SOAP endpoint's `history` instead.)
 */
export type ExplorerMiningSummary = {
  minutes: number;
  asOf: string;
  indexedTip: { height: string; timestamp: string };
  minerCounts: Record<string, number>;
  minerCoverage: {
    blocks: { available: boolean; sampledRows: number; truncated: boolean };
    workshares: { available: boolean; sampledRows: number; truncated: boolean };
  };
  lastQuaiReward: string | null;
  lastQiReward: string | null;
};

/** Mining summary for the only supported window (24h). */
export function getExplorerMiningSummary(options?: FetchOptions) {
  return get<ExplorerMiningSummary>("/api/mining/summary?minutes=1440", options);
}

// ============================================================
// Daily aggregates (Quai <-> Qi conversions)
// ============================================================

/**
 * One day of chain aggregates. QuaiWatch uses the conversion fields, which are
 * what reopened conversion monitoring: 26 of the last 30 days show activity.
 *
 * Units: `quai*` amounts are wei (1e18), `qi*` amounts are qits (1e3).
 */
export type ExplorerDailyItem = {
  date: string;
  txCountTotal: number;
  quaiToQiTxCount: number;
  qiToQuaiTxCount: number;
  quaiSentForConversion: string;
  qiSentForConversion: string;
  quaiReceivedFromConversion: string;
  qiReceivedFromConversion: string;
  activeAddresses: number;
  blockCount: number;
};

export function getExplorerDaily(options?: FetchOptions) {
  return get<{ items: ExplorerDailyItem[] }>("/api/stats/daily", options);
}

// ============================================================
// SOAP merged-mining participation
// ============================================================

/**
 * One donor chain's SOAP participation.
 *
 * `participationPct` is Quai's hashrate as a share of the donor chain's, derived
 * from signed AuxPoW evidence. When a donor's target is not committed on-chain
 * the explorer sets the numbers to null and explains why in `unavailableReason`
 * — DOGE is in that state (verified: 168/168 history buckets null), so it must be
 * shown as unavailable rather than as 0%.
 */
export type ExplorerSoapNetwork = {
  id: string;
  algorithm: string;
  asOf: string | null;
  quaiHashrate: string | null;
  donorHashrate: string | null;
  participationPct: string | null;
  targetBlockSeconds: number | null;
  proofCount: string | null;
  unavailableReason: string | null;
};

/** One hourly bucket of the participation series. */
export type ExplorerSoapBucket = {
  bucket: string;
  quaiHashrate: string | null;
  donorHashrate: string | null;
  participationPct: string | null;
};

export type ExplorerSoap = {
  days: number;
  asOf: string;
  source: { authority: string };
  projection: { status: string; selectedWindowComplete: boolean };
  networks: ExplorerSoapNetwork[];
  /** Hourly series per donor chain. Verified: 168 points each over 7 days. */
  history: Record<string, ExplorerSoapBucket[]>;
};

export function getExplorerSoap(days: 1 | 7 | 30 = 7, options?: FetchOptions) {
  return get<ExplorerSoap>(`/api/stats/soap?days=${days}`, options);
}

/** Convert explorer decimal/scientific strings to a display-safe number. */
export function explorerNumber(value: string | number | null | undefined): number {
  if (value == null || value === "") return 0;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatExplorerAmount(
  value: string | number | null | undefined,
  decimals: number,
  fractionDigits = 4,
): string {
  const amount = explorerNumber(value) / 10 ** decimals;
  return amount.toLocaleString("en-US", {
    maximumFractionDigits: fractionDigits,
  });
}
