/**
 * lib/quaiscan.ts — client Quaiscan API (Blockscout v6.3.0).
 *
 * CORS "*" sudah diverifikasi, jadi dipanggil langsung dari browser (nol backend).
 * API v2 = utama. API v1 (etherscan-compatible) = fallback bila v2 error.
 *
 * CATATAN HARGA: field exchange_rate / circulating_market_cap SELALU null di
 * Quaiscan untuk token QRC-20 (dicek 50 token teratas: 0 yang punya harga).
 * Jadi UI hanya menampilkan JUMLAH token, tanpa nilai USD (Fase 1-3).
 */

import { QUAISCAN_API_V2 } from "./config";

async function getV2<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${QUAISCAN_API_V2}${path}`, {
    headers: { Accept: "application/json" },
    signal,
  });
  if (!res.ok) throw new Error(`Quaiscan ${path} HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** Parameter pagination Blockscout (next_page_params) → query string. */
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

export type TxChartPoint = { date: string; tx_count: number };
export function getTxChart(signal?: AbortSignal): Promise<{ chart_data: TxChartPoint[] }> {
  return getV2<{ chart_data: TxChartPoint[] }>("/stats/charts/transactions", signal);
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

export function getTxs(signal?: AbortSignal): Promise<Paginated<Tx>> {
  return getV2<Paginated<Tx>>("/transactions", signal);
}

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
  exchange_rate: string | null; // selalu null di Quai
  circulating_market_cap: string | null; // selalu null
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
