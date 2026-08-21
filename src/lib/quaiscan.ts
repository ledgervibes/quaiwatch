/**
 * lib/quaiscan.ts — Quaiscan API client (Blockscout v6.3.0).
 *
 * CORS "*" has been verified, so it is called directly from the browser (zero backend).
 *
 * TIMEOUT: every request carries a default timeout. Quaiscan is normally fast
 * (~1s across the endpoints used here), but it has been observed to stall for
 * 20-70s on individual requests. Without a deadline a single stall blocks a whole
 * `Promise.all`, so a page can hang with data that is already available.
 *
 * PRICE NOTE: the exchange_rate / circulating_market_cap fields are ALWAYS null in
 * Quaiscan for QRC-20 tokens (checked the top 50 tokens: 0 have a price).
 * So the UI only shows token AMOUNTS, without USD value (until Phase 6, DeFi pools).
 */

import { QUAISCAN_API_V2 } from "./config";

/** Default deadline for a Quaiscan request. */
const DEFAULT_TIMEOUT_MS = 20_000;

async function getV2<T>(path: string, signal?: AbortSignal, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  // Combine the caller's signal with our own deadline.
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${QUAISCAN_API_V2}${path}`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Quaiscan ${path} HTTP ${res.status}`);
    return (await res.json()) as T;
  } catch (cause) {
    // Distinguish our deadline from a caller-initiated cancellation.
    if (controller.signal.aborted && !signal?.aborted) {
      throw new Error(`Quaiscan ${path} timed out after ${timeoutMs / 1000}s`);
    }
    throw cause;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

/** Blockscout pagination parameters (next_page_params) → query string. */
export type PageParams = Record<string, unknown> | null;

function withParams(path: string, params?: PageParams): string {
  if (!params) return path;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== null && v !== undefined) qs.set(k, String(v));
  }
  const sep = path.includes("?") ? "&" : "?";
  const s = qs.toString();
  return s ? `${path}${sep}${s}` : path;
}

// ---------- Stats ----------

export type NetworkStats = {
  average_block_time: number; // ms
  total_addresses: string;
  total_blocks: string;
  total_transactions: string;
  transactions_today: string;
  gas_used_today: string;
  network_utilization_percentage: number;
  coin_price: string | null;
  market_cap: string;
  gas_prices: { average: number | null; fast: number | null; slow: number | null };
  static_gas_price: string | null;
  tvl: string | null;
};

export function getStats(signal?: AbortSignal): Promise<NetworkStats> {
  return getV2<NetworkStats>("/stats", signal);
}

// ---------- Transactions ----------

export type AddressRef = {
  hash: string;
  is_contract: boolean;
  name: string | null;
};

export type Tx = {
  hash: string;
  timestamp: string | null;
  block: number | null;
  status: string | null;
  method: string | null;
  type: number;
  etx_type: string | null;
  from: AddressRef;
  to: AddressRef | null;
  value: string;
  gas_price: string;
};

export function getMainPageTxs(signal?: AbortSignal): Promise<Tx[]> {
  return getV2<Tx[]>("/main-page/transactions", signal);
}

export type Paginated<T> = { items: T[]; next_page_params: Record<string, unknown> | null };

// ---------- Addresses / Rich list ----------

export type AddressListItem = {
  hash: string;
  coin_balance: string;
  tx_count: string;
  is_contract: boolean;
  name: string | null;
};

export function getRichList(
  params?: PageParams,
  signal?: AbortSignal,
): Promise<Paginated<AddressListItem> & { exchange_rate: string | null }> {
  return getV2<Paginated<AddressListItem> & { exchange_rate: string | null }>(
    withParams("/addresses", params),
    signal,
  );
}

// ---------- Single address (Wallet Explorer) ----------

export type AddressInfo = {
  hash: string;
  coin_balance: string | null;
  is_contract: boolean;
  name: string | null;
};

export function getAddress(hash: string, signal?: AbortSignal): Promise<AddressInfo> {
  return getV2<AddressInfo>(`/addresses/${hash}`, signal);
}

export type AddressCounters = {
  transactions_count: string;
  token_transfers_count: string;
  gas_usage_count: string;
  validations_count: string;
};

export function getAddressCounters(hash: string, signal?: AbortSignal): Promise<AddressCounters> {
  return getV2<AddressCounters>(`/addresses/${hash}/counters`, signal);
}

export type TokenInfo = {
  address: string;
  symbol: string;
  name: string;
  decimals: string;
  type: string;
  holders: string;
  total_supply: string;
  exchange_rate: string | null; // always null in Quai
  circulating_market_cap: string | null; // always null
  icon_url: string | null;
};

export type TokenBalance = {
  token: TokenInfo;
  value: string;
  token_id: string | null;
};

export function getAddressTokenBalances(hash: string, signal?: AbortSignal): Promise<TokenBalance[]> {
  return getV2<TokenBalance[]>(`/addresses/${hash}/token-balances`, signal);
}

export function getAddressTxs(
  hash: string,
  params?: PageParams,
  signal?: AbortSignal,
): Promise<Paginated<Tx>> {
  return getV2<Paginated<Tx>>(withParams(`/addresses/${hash}/transactions`, params), signal);
}

// ---------- Token discovery ----------

export function getTokens(params?: PageParams, signal?: AbortSignal): Promise<Paginated<TokenInfo>> {
  return getV2<Paginated<TokenInfo>>(withParams("/tokens?type=ERC-20", params), signal);
}

export function getToken(tokenAddress: string, signal?: AbortSignal): Promise<TokenInfo> {
  return getV2<TokenInfo>(`/tokens/${tokenAddress}`, signal);
}

// ---------- Token holders (Phase 4: holder distribution) ----------

export type TokenHolder = {
  address: AddressRef;
  value: string;
  token: TokenInfo;
};

/** Top holders of a token (Quaiscan returns up to 50 per page). */
export function getTokenHolders(
  tokenAddress: string,
  signal?: AbortSignal,
): Promise<Paginated<TokenHolder>> {
  return getV2<Paginated<TokenHolder>>(`/tokens/${tokenAddress}/holders`, signal);
}

// ---------- Token activity (Phase 5: WQI tracking) ----------

export type TokenTransfer = {
  block_hash: string;
  log_index: string;
  timestamp: string | null;
  tx_hash: string;
  type: "token_transfer" | "token_minting" | "token_burning" | string;
  from: AddressRef;
  to: AddressRef;
  total: { decimals: number; value: string };
  token: TokenInfo;
};

export type TokenCounters = {
  token_holders_count: string;
  transfers_count: string;
};

export function getTokenTransfers(
  tokenAddress: string,
  params?: PageParams,
  signal?: AbortSignal,
): Promise<Paginated<TokenTransfer>> {
  return getV2<Paginated<TokenTransfer>>(
    withParams(`/tokens/${tokenAddress}/transfers`, params),
    signal,
  );
}

export function getTokenCounters(
  tokenAddress: string,
  signal?: AbortSignal,
): Promise<TokenCounters> {
  return getV2<TokenCounters>(`/tokens/${tokenAddress}/counters`, signal);
}
