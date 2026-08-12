/**
 * lib/price.ts — QUAI price (CoinGecko) + Qi price (derived from RPC).
 *
 * QUAI: available on CoinGecko (free, no API key, open CORS).
 * Qi:   NOT on CoinGecko. Derived from quai_qiToQuai × QUAI price.
 *       (See lib/quai.ts:getQiPriceInQuai — careful with Qi's 3 decimals.)
 *
 * Called directly from the browser. CoinGecko's free tier has a per-IP rate limit,
 * so results are cached in memory (per range) so that repeated button clicks do not
 * call the API again.
 */

import { COINGECKO_QUAI_ID } from "./config";
import { getQiPriceInQuai } from "./quai";

const CG_BASE = "https://api.coingecko.com/api/v3";

export type QuaiPrice = {
  usd: number;
  usdMarketCap: number;
  usd24hChange: number;
};

export async function getQuaiPrice(signal?: AbortSignal): Promise<QuaiPrice> {
  const url = `${CG_BASE}/simple/price?ids=${COINGECKO_QUAI_ID}&vs_currencies=usd&include_market_cap=true&include_24hr_change=true`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
  const json = (await res.json()) as Record<
    string,
    { usd: number; usd_market_cap: number; usd_24h_change: number }
  >;
  const d = json[COINGECKO_QUAI_ID];
  return {
    usd: d.usd,
    usdMarketCap: d.usd_market_cap,
    usd24hChange: d.usd_24h_change,
  };
}

export type Prices = {
  quaiUsd: number;
  quaiMarketCap: number;
  quai24hChange: number;
  /** 1 Qi in QUAI */
  qiPerQuai: number;
  /** 1 Qi in USD (qiPerQuai × quaiUsd) */
  qiUsd: number;
};

/** Fetch the QUAI price + derive the Qi price. Both in parallel. */
export async function getAllPrices(signal?: AbortSignal): Promise<Prices> {
  const [quai, qiPerQuai] = await Promise.all([
    getQuaiPrice(signal),
    getQiPriceInQuai(),
  ]);
  return {
    quaiUsd: quai.usd,
    quaiMarketCap: quai.usdMarketCap,
    quai24hChange: quai.usd24hChange,
    qiPerQuai,
    qiUsd: qiPerQuai * quai.usd,
  };
}

// ============================================================
// Historical QUAI price chart (CoinGecko market_chart)
// ============================================================

export type ChartRange = "7" | "30" | "90" | "365";

export const CHART_RANGES: { key: ChartRange; label: string }[] = [
  { key: "7", label: "7D" },
  { key: "30", label: "30D" },
  { key: "90", label: "90D" },
  { key: "365", label: "1Y" },
];

/** A single point on the chart: time (ms) + USD price. */
export type PricePoint = { t: number; p: number };

// In-memory cache per range. TTL 5 minutes — fresh enough for a price chart,
// and avoids CoinGecko rate limits when the user presses the button repeatedly.
const CACHE_TTL_MS = 5 * 60 * 1000;
const chartCache = new Map<ChartRange, { at: number; data: PricePoint[] }>();

/**
 * Fetch QUAI price history for a given range.
 * days=7/30/90 → hourly granularity; days=365 → daily (from CoinGecko).
 */
export async function getQuaiPriceChart(
  range: ChartRange,
  signal?: AbortSignal,
): Promise<PricePoint[]> {
  const cached = chartCache.get(range);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.data;
  }

  const url = `${CG_BASE}/coins/${COINGECKO_QUAI_ID}/market_chart?vs_currency=usd&days=${range}`;
  const res = await fetch(url, { signal });
  if (res.status === 429) {
    throw new Error("Rate limited by CoinGecko. Please try again in a moment.");
  }
  if (!res.ok) throw new Error(`CoinGecko chart HTTP ${res.status}`);

  const json = (await res.json()) as { prices: [number, number][] };
  const data: PricePoint[] = json.prices.map(([t, p]) => ({ t, p }));
  chartCache.set(range, { at: Date.now(), data });
  return data;
}
