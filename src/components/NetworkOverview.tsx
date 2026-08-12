"use client";

import { useEffect, useState } from "react";
import { getStats, type NetworkStats } from "@/lib/quaiscan";
import { getAllPrices, type Prices } from "@/lib/price";
import { getBlockNumber, getGasPrice, formatQuaiAmount } from "@/lib/quai";
import { StatCard, LiveDot } from "@/components/ui";
import { compactNumber, thousands, usd, pct, trimDecimals } from "@/lib/format";

/**
 * Network Stats + price panel.
 * - Network stats: Quaiscan /stats
 * - Block height: RPC quai_blockNumber (fresher than Quaiscan)
 * - Gas price: RPC quai_gasPrice (Quaiscan gas_prices is null)
 * - QUAI price: CoinGecko; Qi: derived from RPC
 * Refreshes every 15 seconds.
 */
export function NetworkOverview() {
  const [stats, setStats] = useState<NetworkStats | null>(null);
  const [prices, setPrices] = useState<Prices | null>(null);
  const [block, setBlock] = useState<number | null>(null);
  const [gasWei, setGasWei] = useState<bigint | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const ctrl = new AbortController();

    async function load() {
      try {
        const [s, b, g] = await Promise.all([
          getStats(ctrl.signal),
          getBlockNumber(),
          getGasPrice(),
        ]);
        if (!alive) return;
        setStats(s);
        setBlock(b);
        setGasWei(g);
        setErr(null);
      } catch (e) {
        if (alive && !ctrl.signal.aborted) setErr((e as Error).message);
      }
      // price is fetched separately — if CoinGecko is slow/rate-limited, stats still display
      try {
        const p = await getAllPrices(ctrl.signal);
        if (alive) setPrices(p);
      } catch {
        /* ignore: price is optional */
      }
    }

    load();
    const iv = setInterval(load, 15_000);
    return () => {
      alive = false;
      ctrl.abort();
      clearInterval(iv);
    };
  }, []);

  const avgBlockSec = stats ? (stats.average_block_time / 1000).toFixed(2) : null;
  // TPS ~ transactions today / seconds in a day
  const tps =
    stats && Number(stats.transactions_today) > 0
      ? (Number(stats.transactions_today) / 86400).toFixed(2)
      : null;
  const gasGwei = gasWei != null ? Number(gasWei) / 1e9 : null;

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Network Overview
        </h2>
        <LiveDot />
      </div>

      {err && (
        <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          Failed to load some data: {err}. Retrying automatically every 15s.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        <StatCard
          label="QUAI Price"
          loading={!prices}
          value={prices ? usd(prices.quaiUsd) : "-"}
          sub={
            prices ? (
              <span className={prices.quai24hChange >= 0 ? "text-emerald-500" : "text-rose-500"}>
                {pct(prices.quai24hChange)} (24h)
              </span>
            ) : null
          }
        />
        <StatCard
          label="Qi Price (derived)"
          loading={!prices}
          value={prices ? usd(prices.qiUsd) : "-"}
          sub={prices ? `1 Qi = ${trimDecimals(String(prices.qiPerQuai), 4)} QUAI` : null}
        />
        <StatCard
          label="Market Cap"
          loading={!prices}
          value={prices ? usd(prices.quaiMarketCap, 0) : "-"}
          sub="QUAI, via CoinGecko"
        />
        <StatCard
          label="Block Height"
          loading={block == null}
          value={block != null ? `#${thousands(block)}` : "-"}
          sub={avgBlockSec ? `~${avgBlockSec}s / block` : null}
        />
        <StatCard
          label="TPS (24h avg)"
          loading={!stats}
          value={tps ?? "-"}
          sub={stats ? `${thousands(stats.transactions_today)} tx today` : null}
        />
        <StatCard
          label="Gas Price"
          loading={gasGwei == null}
          value={gasGwei != null ? `${gasGwei.toFixed(2)} Gwei` : "-"}
          sub={gasWei != null ? `${trimDecimals(formatQuaiAmount(gasWei), 9)} QUAI` : null}
        />
        <StatCard
          label="Total Transactions"
          loading={!stats}
          value={stats ? compactNumber(stats.total_transactions) : "-"}
          sub={stats ? `${thousands(stats.total_transactions)} all-time` : null}
        />
        <StatCard
          label="Total Addresses"
          loading={!stats}
          value={stats ? compactNumber(stats.total_addresses) : "-"}
          sub={
            stats
              ? `${stats.network_utilization_percentage.toFixed(1)}% net utilization`
              : null
          }
        />
      </div>
    </section>
  );
}
