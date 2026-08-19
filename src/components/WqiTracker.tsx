"use client";

import { useEffect, useState } from "react";
import {
  getTokenCounters,
  getTokenHolders,
  getToken,
  getTokenTransfers,
  type PageParams,
  type TokenCounters,
  type TokenHolder,
  type TokenInfo,
  type TokenTransfer,
} from "@/lib/quaiscan";
import { formatTokenAmount } from "@/lib/quai";
import { WQI, QUAISCAN_BASE } from "@/lib/config";
import { shortAddress, thousands, trimDecimals } from "@/lib/format";
import { StatCard } from "@/components/ui";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export function WqiTracker() {
  const [token, setToken] = useState<TokenInfo | null>(null);
  const [counters, setCounters] = useState<TokenCounters | null>(null);
  const [holders, setHolders] = useState<TokenHolder[]>([]);
  const [transfers, setTransfers] = useState<TokenTransfer[]>([]);
  const [nextParams, setNextParams] = useState<PageParams>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    Promise.all([
      getToken(WQI.address, ctrl.signal),
      getTokenHolders(WQI.address, ctrl.signal),
      getTokenTransfers(WQI.address, null, ctrl.signal),
      getTokenCounters(WQI.address, ctrl.signal),
    ])
      .then(([tokenInfo, holderPage, transferPage, tokenCounters]) => {
        setToken(tokenInfo);
        setHolders(holderPage.items);
        setTransfers(transferPage.items);
        setNextParams(transferPage.next_page_params);
        setCounters(tokenCounters);
      })
      .catch((e) => {
        if (!ctrl.signal.aborted) setErr((e as Error).message);
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, []);

  async function loadMore() {
    if (!nextParams || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await getTokenTransfers(WQI.address, nextParams);
      setTransfers((prev) => [...prev, ...page.items]);
      setNextParams(page.next_page_params);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoadingMore(false);
    }
  }

  const totalSupply = token?.total_supply ? formatTokenAmount(token.total_supply, WQI.decimals) : "-";
  const top10Pct = token ? holders.slice(0, 10).reduce((sum, holder) => sum + pctOfSupply(holder.value, token.total_supply), 0) : 0;

  return (
    <div className="space-y-5">
      {err && <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">Failed to load WQI data: {err}</div>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="WQI Supply" loading={loading} value={trimDecimals(totalSupply, 2)} sub="18 decimals" />
        <StatCard label="Holders" loading={loading} value={counters ? thousands(counters.token_holders_count) : "-"} sub="Quaiscan indexed" />
        <StatCard label="Transfers" loading={loading} value={counters ? thousands(counters.transfers_count) : "-"} sub="All-time indexed" />
        <StatCard label="Top 10 Supply" loading={loading} value={`${top10Pct.toFixed(1)}%`} sub="Based on top 50 holders" />
      </div>

      <section className="card">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">WQI Holder Distribution</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Top {holders.length || 50} holders from Quaiscan.</p>
          </div>
          <a className="link mono text-xs" href={`${QUAISCAN_BASE}/token/${WQI.address}`} target="_blank" rel="noopener noreferrer">Contract</a>
        </div>
        {loading ? <SkeletonRows count={5} /> : holders.length === 0 ? <EmptyState text="No holder data." /> : (
          <div className="space-y-1.5">
            {holders.slice(0, 50).map((holder, index) => {
              const pct = token ? pctOfSupply(holder.value, token.total_supply) : 0;
              return <HolderRow key={holder.address.hash} holder={holder} index={index} pct={pct} />;
            })}
          </div>
        )}
      </section>

      <section className="card overflow-hidden p-0">
        <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <h2 className="text-sm font-semibold">Recent WQI Activity</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Mint, burn, and token transfers indexed by Quaiscan.</p>
        </div>
        {loading ? <div className="p-4"><SkeletonRows count={5} /></div> : transfers.length === 0 ? <div className="p-4"><EmptyState text="No transfer data." /></div> : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {transfers.map((transfer) => <TransferRow key={`${transfer.tx_hash}-${transfer.log_index}`} transfer={transfer} />)}
          </div>
        )}
      </section>

      {nextParams && <div className="flex justify-center"><button onClick={loadMore} disabled={loadingMore} className="rounded-lg border border-slate-200 px-5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800">{loadingMore ? "Loading..." : "Load more activity"}</button></div>}
    </div>
  );
}

function HolderRow({ holder, index, pct }: { holder: TokenHolder; index: number; pct: number }) {
  return <div className="flex items-center gap-2 text-xs"><span className="w-5 shrink-0 tabular-nums text-slate-400">{index + 1}</span><a href={`${QUAISCAN_BASE}/address/${holder.address.hash}`} target="_blank" rel="noopener noreferrer" className="link mono w-28 shrink-0">{shortAddress(holder.address.hash)}</a><div className="relative h-3.5 flex-1 overflow-hidden rounded bg-slate-200 dark:bg-slate-700"><div className="h-full rounded bg-brand-500/60" style={{ width: `${Math.min(pct, 100)}%` }} /></div><span className="w-24 shrink-0 text-right tabular-nums text-slate-500">{trimDecimals(formatTokenAmount(holder.value, WQI.decimals), 2)}</span><span className="w-12 shrink-0 text-right tabular-nums text-slate-400">{pct.toFixed(1)}%</span></div>;
}

function TransferRow({ transfer }: { transfer: TokenTransfer }) {
  const from = transfer.from.hash.toLowerCase();
  const to = transfer.to.hash.toLowerCase();
  const kind = from === ZERO_ADDRESS ? "Mint" : to === ZERO_ADDRESS ? "Burn" : "Transfer";
  const tone = kind === "Mint" ? "text-emerald-600 dark:text-emerald-400" : kind === "Burn" ? "text-rose-600 dark:text-rose-400" : "text-slate-500 dark:text-slate-400";
  return <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-xs"><span className={`w-14 font-semibold ${tone}`}>{kind}</span><span className="mono text-slate-500">{shortAddress(transfer.from.hash)} → {shortAddress(transfer.to.hash)}</span><span className="ml-auto tabular-nums">{trimDecimals(formatTokenAmount(transfer.total.value, WQI.decimals), 4)} WQI</span><a href={`${QUAISCAN_BASE}/tx/${transfer.tx_hash}`} target="_blank" rel="noopener noreferrer" className="link mono">{shortAddress(transfer.tx_hash)}</a></div>;
}

function pctOfSupply(value: string, supply: string): number {
  if (!supply) return 0;
  return Number((BigInt(value) * 10000n) / BigInt(supply)) / 100;
}

function SkeletonRows({ count }: { count: number }) {
  return <div className="space-y-1.5">{Array.from({ length: count }).map((_, index) => <div key={index} className="h-4 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />)}</div>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="text-xs text-slate-500">{text}</div>;
}
