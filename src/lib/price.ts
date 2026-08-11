/**
 * lib/price.ts — harga QUAI (CoinGecko) + harga Qi (diturunkan dari RPC).
 *
 * QUAI: ada di CoinGecko (gratis, tanpa API key).
 * Qi:   TIDAK ada di CoinGecko. Diturunkan dari quai_qiToQuai × harga QUAI.
 *       (Lihat lib/quai.ts:getQiPriceInQuai — hati-hati 3 desimal Qi.)
 *
 * Di produksi nanti, endpoint CoinGecko dipanggil lewat Worker /api/price dgn
 * cache KV 60s (1 key) biar hemat kuota. Untuk Fase 1 dashboard statis, kita
 * panggil langsung dari browser — rate limit CoinGecko per-IP, jadi aman.
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
  /** 1 Qi dalam QUAI */
  qiPerQuai: number;
  /** 1 Qi dalam USD (qiPerQuai × quaiUsd) */
  qiUsd: number;
};

/** Ambil harga QUAI + turunkan harga Qi. Dua-duanya paralel. */
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
