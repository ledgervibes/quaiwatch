"use client";

import { useEffect, useState } from "react";
import { getPools, totalTvlQuai, getSoapStats, getSoapTxs, type Pool, type SoapStats } from "@/lib/defi";
import { getAllPrices, type Prices } from "@/lib/price";
import { type Tx, type PageParams } from "@/lib/quaiscan";
import { QUAISCAN_BASE, SOAP_BURN_ADDRESS } from "@/lib/config";
import { shortAddress, thousands, trimDecimals, usd, compactNumber, timeAgo } from "@/lib/format";
import { formatQuaiAmount } from "@/lib/quai";
import { StatCard } from "@/components/ui";

export function DefiAnalytics() {
  const [pools, setPools] = useState<Pool[]>([]);
  const [prices, setPrices] = useState<Prices | null>(null);
  const [soap, setSoap] = useState<SoapStats | null>(null);
  const [soapTxs, setSoapTxs] = useState<Tx[]>([]);
  const [soapNext, setSoapNext] = useState<PageParams>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    Promise.all([
      getPools(ctrl.signal),
      getSoapStats(ctrl.signal),
      getSoapTxs(null, ctrl.signal),
    ])
      .then(([poolList, soapStats, soapTxPage]) => {
        setPools(poolList);
        setSoap(soapStats);
        setSoapTxs(soapTxPage.items);
        setSoapNext(soapTxPage.next_page_params);
      })
      .catch((e) => {
        if (!ctrl.signal.aborted) setErr((e as Error).message);
      })
      .finally(() => setLoading(false));

    // Price is optional; if CoinGecko is slow, USD columns just stay blank.
    getAllPrices(ctrl.signal)
      .then((p) => setPrices(p))
      .catch(() => {
        /* ignore — QUAI-denominated values still render */
      });

    return () => ctrl.abort();
  }, []);

  async function loadMoreSoap() {
    if (!soapNext || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await getSoapTxs(soapNext);
      setSoapTxs((prev) => [...prev, ...page.items]);
      setSoapNext(page.next_page_params);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoadingMore(false);
    }
  }

  const tvlQuai = totalTvlQuai(pools);
  const quaiUsd = prices?.quaiUsd ?? null;

  return (
    <div className="space-y-5">
      {err && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          Failed to load some DeFi data: {err}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Total DEX TVL"
          loading={loading}
          value={loading ? "" : quaiUsd != null ? usd(tvlQuai * quaiUsd, 0) : `${compactNumber(tvlQuai)} QUAI`}
          sub={quaiUsd != null ? `${compactNumber(tvlQuai)} QUAI` : "USD pending price"}
        />
        <StatCard label="Liquidity Pools" loading={loading} value={thousands(pools.length)} sub="WQUAI-paired" />
        <StatCard
          label="QUAI Burned (SOAP)"
          loading={loading}
          value={soap ? compactNumber(soap.burnedQuai) : "-"}
          sub={soap && quaiUsd != null ? usd(soap.burnedQuai * quaiUsd, 0) : "Buy-and-burn"}
        />
        <StatCard
          label="QUAI Price"
          loading={!prices}
          value={prices ? usd(prices.quaiUsd) : "-"}
          sub="via CoinGecko"
        />
      </div>

      <section className="card overflow-hidden p-0">
        <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <h2 className="text-sm font-semibold">Liquidity Pools</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Token prices derived from WQUAI pool reserves. Live from Quai RPC.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-xs uppercase text-slate-500 dark:border-slate-800">
              <tr>
                <th className="px-4 py-3">Token</th>
                <th className="px-4 py-3 text-right">Price (QUAI)</th>
                <th className="px-4 py-3 text-right">Price (USD)</th>
                <th className="px-4 py-3 text-right">TVL</th>
                <th className="px-4 py-3">Pair</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={5} className="px-4 py-3">
                      <div className="h-5 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
                    </td>
                  </tr>
                ))
              ) : pools.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-500">
                    No liquidity pools found.
                  </td>
                </tr>
              ) : (
                pools.map((pool) => <PoolRow key={pool.pair} pool={pool} quaiUsd={quaiUsd} />)
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card overflow-hidden p-0">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <div>
            <h2 className="text-sm font-semibold">SOAP Buyback &amp; Burn</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Merge-mining subsidies buy QUAI, which is burned here (100%).
            </p>
          </div>
          <a
            className="link mono shrink-0 text-xs"
            href={`${QUAISCAN_BASE}/address/${SOAP_BURN_ADDRESS}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Burn address
          </a>
        </div>
        {loading ? (
          <div className="p-4">
            <div className="space-y-1.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-4 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
              ))}
            </div>
          </div>
        ) : soapTxs.length === 0 ? (
          <div className="p-4 text-xs text-slate-500">No buyback transactions found.</div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {soapTxs.map((tx) => (
              <SoapTxRow key={tx.hash} tx={tx} quaiUsd={quaiUsd} />
            ))}
          </div>
        )}
      </section>

      {soapNext && (
        <div className="flex justify-center">
          <button
            onClick={loadMoreSoap}
            disabled={loadingMore}
            className="rounded-lg border border-slate-200 px-5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {loadingMore ? "Loading..." : "Load more buybacks"}
          </button>
        </div>
      )}
    </div>
  );
}

function PoolRow({ pool, quaiUsd }: { pool: Pool; quaiUsd: number | null }) {
  const priceUsd = quaiUsd != null ? pool.priceInQuai * quaiUsd : null;
  const tvlUsd = quaiUsd != null ? pool.tvlQuai * quaiUsd : null;
  return (
    <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
      <td className="px-4 py-3">
        <div className="font-medium">{pool.token.symbol || "?"}</div>
        <div className="text-xs text-slate-400">{pool.token.name}</div>
      </td>
      <td className="px-4 py-3 text-right tabular-nums">{trimDecimals(String(pool.priceInQuai), 8)}</td>
      <td className="px-4 py-3 text-right tabular-nums">{priceUsd != null ? usd(priceUsd) : "-"}</td>
      <td className="px-4 py-3 text-right tabular-nums">
        {tvlUsd != null ? usd(tvlUsd, 0) : `${compactNumber(pool.tvlQuai)} QUAI`}
      </td>
      <td className="px-4 py-3">
        <a
          href={`${QUAISCAN_BASE}/address/${pool.pair}`}
          target="_blank"
          rel="noopener noreferrer"
          className="link mono text-xs"
        >
          {shortAddress(pool.pair)}
        </a>
      </td>
    </tr>
  );
}

function SoapTxRow({ tx, quaiUsd }: { tx: Tx; quaiUsd: number | null }) {
  const quai = Number(formatQuaiAmount(tx.value));
  const valueUsd = quaiUsd != null ? quai * quaiUsd : null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-xs">
      <span className="mono text-slate-500">{shortAddress(tx.from.hash)}</span>
      <span className="text-slate-400">{timeAgo(tx.timestamp)}</span>
      <span className="ml-auto tabular-nums font-medium">
        {trimDecimals(String(quai), 4)} QUAI
      </span>
      {valueUsd != null && <span className="tabular-nums text-slate-400">{usd(valueUsd)}</span>}
      <a
        href={`${QUAISCAN_BASE}/tx/${tx.hash}`}
        target="_blank"
        rel="noopener noreferrer"
        className="link mono"
      >
        {shortAddress(tx.hash)}
      </a>
    </div>
  );
}
