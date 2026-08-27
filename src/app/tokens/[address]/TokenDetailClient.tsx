"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  getToken,
  getTokenHolders,
  getTokenTransfers,
  type TokenInfo,
  type TokenHolder,
  type TokenTransfer,
  type Paginated,
  type PageParams,
} from "@/lib/quaiscan";
import { getExplorerTvl, type ExplorerTvlPool } from "@/lib/explorer";
import { formatTokenAmount } from "@/lib/quai";
import { shortAddress, thousands, compactNumber, trimDecimals, timeAgo, usd } from "@/lib/format";
import { QUAISCAN_BASE, WQUAI } from "@/lib/config";
import { StatCard, CardRow } from "@/components/ui";
import { ExternalLinkIcon, CopyIcon } from "@/components/ui";

interface Props {
  params: Promise<{ address: string }>;
}

export function TokenDetailClient({ params }: Props) {
  const [address, setAddress] = useState("");
  const [token, setToken] = useState<TokenInfo | null>(null);
  const [holders, setHolders] = useState<TokenHolder[]>([]);
  const [transfers, setTransfers] = useState<TokenTransfer[]>([]);
  const [holdersNext, setHoldersNext] = useState<PageParams>(null);
  const [transfersNext, setTransfersNext] = useState<PageParams>(null);
  const [pricePoints, setPricePoints] = useState<{ t: number; p: number }[]>([]);
  const [poolInfo, setPoolInfo] = useState<ExplorerTvlPool | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingHolders, setLoadingHolders] = useState(false);
  const [loadingTransfers, setLoadingTransfers] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const copyAddr = async (addr: string) => {
    try {
      await navigator.clipboard.writeText(addr);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    let alive = true;
    params.then(({ address: addr }) => {
      if (!alive) return;
      setAddress(addr.toLowerCase());
    });

    async function load() {
      setLoading(true);
      setErr(null);
      params.then(async ({ address: addr }) => {
        try {
          const [t, h, tx, tvl] = await Promise.all([
            getToken(addr),
            getTokenHolders(addr),
            getTokenTransfers(addr),
            getExplorerTvl(7),
          ]);
          if (!alive) return;
          setToken(t);
          setHolders(h.items ?? []);
          setHoldersNext(h.next_page_params ?? null);
          setTransfers(tx.items ?? []);
          setTransfersNext(tx.next_page_params ?? null);

          // Find WQUAI pair for price chart
          const pair = tvl.pools?.find(
            (p) =>
              (p.token0.address.toLowerCase() === addr.toLowerCase() &&
                p.token1.address.toLowerCase() === WQUAI.addressLower) ||
              (p.token1.address.toLowerCase() === addr.toLowerCase() &&
                p.token0.address.toLowerCase() === WQUAI.addressLower),
          );
          if (pair) {
            setPoolInfo(pair);
            const isToken0 = pair.token0.address.toLowerCase() === addr.toLowerCase();
            const reserveToken = isToken0 ? pair.reserve0 : pair.reserve1;
            const reserveWquai = isToken0 ? pair.reserve1 : pair.reserve0;
            const price = Number(reserveWquai) / Number(reserveToken);
            setPricePoints([{ t: Date.now(), p: price }]);
          }
        } catch (e) {
          if (alive) setErr((e as Error).message);
        } finally {
          if (alive) setLoading(false);
        }
      });
    }

    load();
    return () => {
      alive = false;
    };
  }, [params]);

  async function loadMoreHolders() {
    if (!holdersNext || loadingHolders) return;
    setLoadingHolders(true);
    try {
      const r = await getTokenHolders(address);
      setHolders((prev) => [...prev, ...r.items]);
      setHoldersNext(r.next_page_params);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoadingHolders(false);
    }
  }

  async function loadMoreTransfers() {
    if (!transfersNext || loadingTransfers) return;
    setLoadingTransfers(true);
    try {
      const r = await getTokenTransfers(address, transfersNext);
      setTransfers((prev) => [...prev, ...r.items]);
      setTransfersNext(r.next_page_params);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoadingTransfers(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse">
          <div className="h-8 w-64 bg-slate-200 dark:bg-slate-700 rounded" />
          <div className="mt-4 h-4 w-96 bg-slate-200 dark:bg-slate-700 rounded" />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-slate-200 dark:bg-slate-700 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500">Gagal memuat token: {err ?? "Unknown error"}</p>
      </div>
    );
  }

  const decimals = Number(token.decimals || 18);
  const totalSupply = formatTokenAmount(token.total_supply, decimals);
  const isWquaiPair = poolInfo !== null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/tokens" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 mb-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="m19 12-7 7-7-7" />
            </svg>
            Kembali ke Tokens
          </Link>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            {token.symbol ?? "?"}
            <span className="text-slate-500 dark:text-slate-400 text-lg font-normal">{token.name}</span>
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Contract:{" "}
            <button onClick={() => copyAddr(address)} className="inline-flex items-center gap-1 mono text-xs hover:text-brand-600">
              {shortAddress(address, 10, 8)}
              <CopyIcon className="text-slate-400" />
            </button>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`${QUAISCAN_BASE}/token/${address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <ExternalLinkIcon /> Quaiscan
          </a>
        </div>
      </div>

      {err && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          {err}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Holders" value={thousands(token.holders)} />
        <StatCard label="Total Supply" value={compactNumber(Number(totalSupply))} sub={`${token.decimals} decimals`} />
        <StatCard label="Type" value={token.type ?? "ERC-20"} />
        <StatCard
          label={isWquaiPair ? "Price (QUAI)" : "Price"}
          value={isWquaiPair && poolInfo ? trimDecimals(String(Number(poolInfo.reserve1) / Number(poolInfo.reserve0)), 8) : "N/A"}
          sub={isWquaiPair ? "Via Quainance WQUAI pool" : "No WQUAI pair on Quainance"}
        />
      </div>

      {isWquaiPair && poolInfo && (
        <section className="card">
          <h2 className="mb-3 text-sm font-semibold">Price Chart (QUAI)</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={pricePoints} margin={{ top: 5, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="tokenPriceFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="t"
                  type="number"
                  domain={["dataMin", "dataMax"]}
                  scale="time"
                  tickFormatter={(t) => new Date(t).toLocaleTimeString()}
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v) => trimDecimals(v.toFixed(8), 6)}
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  width={70}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(v: number) => [trimDecimals(v.toFixed(8), 6), "QUAI"]}
                  contentStyle={{
                    background: "#0f172a",
                    border: "1px solid #334155",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="p"
                  stroke="#6366f1"
                  strokeWidth={2}
                  fill="url(#tokenPriceFill)"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Harga diambil dari pool Quainance {poolInfo.name} (WQUAI reserve). Data historis membutuhkan indexer tambahan.
          </p>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold">Top Holders</h2>
            {holdersNext && (
              <button
                onClick={loadMoreHolders}
                disabled={loadingHolders}
                className="text-xs text-brand-600 hover:underline disabled:opacity-50"
              >
                {loadingHolders ? "Loading..." : "Load more"}
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-xs uppercase text-slate-500 dark:border-slate-800">
                <tr>
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Address</th>
                  <th className="px-3 py-2 text-right">Balance</th>
                  <th className="px-3 py-2 text-right">%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {holders.map((h, i) => (
                  <tr key={h.address.hash} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-3 py-2 tabular-nums text-slate-400">{i + 1}</td>
                    <td className="px-3 py-2">
                      <Link
                        href={`${QUAISCAN_BASE}/address/${h.address.hash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mono text-xs hover:text-brand-600"
                      >
                        {shortAddress(h.address.hash, 10, 8)}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatTokenAmount(h.value, decimals)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                      {(Number(h.value) / Number(token.total_supply || 1) * 100).toFixed(2)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold">Recent Transfers</h2>
            {transfersNext && (
              <button
                onClick={loadMoreTransfers}
                disabled={loadingTransfers}
                className="text-xs text-brand-600 hover:underline disabled:opacity-50"
              >
                {loadingTransfers ? "Loading..." : "Load more"}
              </button>
            )}
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {transfers.length === 0 ? (
              <div className="py-6 text-center text-sm text-slate-500">Tidak ada transfer.</div>
            ) : (
              transfers.map((tx) => (
                <div key={tx.tx_hash} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-xs">
                  <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                    {tx.type}
                  </span>
                  <span className="text-slate-400">{timeAgo(tx.timestamp)}</span>
                  <Link
                    href={`${QUAISCAN_BASE}/tx/${tx.tx_hash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mono text-slate-500 hover:text-brand-600 truncate max-w-[120px]"
                  >
                    {shortAddress(tx.tx_hash)}
                  </Link>
                  <span className="ml-auto tabular-nums font-medium">
                    {formatTokenAmount(tx.total.value, tx.total.decimals)} {token.symbol}
                  </span>
                  <div className="flex gap-1 text-slate-400">
                    <span>From:</span>
                    <Link href={`${QUAISCAN_BASE}/address/${tx.from.hash}`} target="_blank" rel="noopener noreferrer" className="mono hover:text-brand-600">{shortAddress(tx.from.hash)}</Link>
                    <span>→</span>
                    <Link href={`${QUAISCAN_BASE}/address/${tx.to.hash}`} target="_blank" rel="noopener noreferrer" className="mono hover:text-brand-600">{shortAddress(tx.to.hash)}</Link>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <section className="card">
        <h2 className="mb-3 text-sm font-semibold">Contract Info</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <CardRow label="Contract Address" value={<span className="mono text-xs">{address}</span>} onCopy={() => copyAddr(address)} copyText={address} />
          <CardRow label="Symbol" value={token.symbol ?? "-"} />
          <CardRow label="Name" value={token.name ?? "-"} />
          <CardRow label="Decimals" value={String(decimals)} />
          <CardRow label="Type" value={token.type ?? "ERC-20"} />
          <CardRow label="Total Supply" value={totalSupply} />
          <CardRow label="Holders" value={thousands(token.holders)} />
          <CardRow
            label="Icon"
            value={token.icon_url ? (
              <img src={token.icon_url} alt={token.symbol ?? ""} className="h-6 w-6 rounded" />
            ) : (
              "-"
            )}
          />
        </div>
      </section>
    </div>
  );
}