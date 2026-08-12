"use client";

import { useState } from "react";
import {
  getAddress,
  getAddressCounters,
  getAddressTokenBalances,
  getAddressTxs,
  type AddressInfo,
  type AddressCounters,
  type TokenBalance,
  type Tx,
  type PageParams,
} from "@/lib/quaiscan";
import { formatQuaiAmount, formatTokenAmount } from "@/lib/quai";
import { shortAddress, timeAgo, trimDecimals, thousands } from "@/lib/format";
import { QUAISCAN_BASE } from "@/lib/config";

/**
 * Wallet Explorer: search an address → QUAI balance + all QRC-20 (without USD) + history.
 * QRC-20 tokens intentionally do NOT show USD value (no free price source).
 */
export function WalletExplorer() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<AddressInfo | null>(null);
  const [counters, setCounters] = useState<AddressCounters | null>(null);
  const [tokens, setTokens] = useState<TokenBalance[]>([]);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [txNext, setTxNext] = useState<PageParams>(null);
  const [current, setCurrent] = useState<string>("");

  async function search(e: React.FormEvent) {
    e.preventDefault();
    const addr = query.trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) {
      setErr("Invalid address format. Must be 0x + 40 hex characters.");
      return;
    }
    setLoading(true);
    setErr(null);
    setInfo(null);
    setTxs([]);
    setTxNext(null);
    try {
      const [i, c, tb, tx] = await Promise.all([
        getAddress(addr),
        getAddressCounters(addr).catch(() => null),
        getAddressTokenBalances(addr).catch(() => []),
        getAddressTxs(addr, null).catch(() => ({ items: [], next_page_params: null })),
      ]);
      setInfo(i);
      setCounters(c);
      setTokens(tb);
      setTxs(tx.items);
      setTxNext(tx.next_page_params);
      setCurrent(addr);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function loadMoreTxs() {
    if (!txNext || loadingMore || !current) return;
    setLoadingMore(true);
    try {
      const tx = await getAddressTxs(current, txNext);
      setTxs((prev) => [...prev, ...tx.items]);
      setTxNext(tx.next_page_params);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <section className="card">
      <form onSubmit={search} className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search address (0x...)"
          className="mono flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-brand-500 dark:border-slate-700 dark:bg-slate-800"
          spellCheck={false}
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-50"
        >
          {loading ? "..." : "Search"}
        </button>
      </form>

      {err && <div className="mt-2 text-xs text-rose-500">{err}</div>}

      {info && (
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <div className="stat-label">QUAI Balance</div>
              <div className="mt-1 text-xl font-semibold tabular-nums">
                {info.coin_balance ? trimDecimals(formatQuaiAmount(info.coin_balance), 6) : "0"}{" "}
                <span className="text-sm text-slate-400">QUAI</span>
              </div>
            </div>
            <div>
              <div className="stat-label">Transactions</div>
              <div className="mt-1 text-xl font-semibold tabular-nums">
                {counters ? thousands(counters.transactions_count) : "-"}
              </div>
            </div>
            <div>
              <div className="stat-label">Type</div>
              <div className="mt-1 text-xl font-semibold">
                {info.is_contract ? "Contract" : "Wallet"}
              </div>
            </div>
          </div>

          {/* QRC-20 tokens — without USD value */}
          <div>
            <div className="mb-2 flex items-center gap-2">
              <h3 className="text-sm font-semibold">Tokens (QRC-20)</h3>
              <span className="text-[11px] text-slate-400">USD value not available</span>
            </div>
            {tokens.length === 0 ? (
              <div className="text-sm text-slate-500">No tokens.</div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {tokens.map((t) => (
                      <tr key={t.token.address}>
                        <td className="px-3 py-2">
                          <span className="font-medium">{t.token.symbol || "?"}</span>
                          <span className="ml-2 text-xs text-slate-400">{t.token.name}</span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {trimDecimals(formatTokenAmount(t.value, Number(t.token.decimals || 18)), 4)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Transaction history */}
          <div>
            <h3 className="mb-2 text-sm font-semibold">Recent Transactions</h3>
            {txs.length === 0 ? (
              <div className="text-sm text-slate-500">No transactions.</div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {txs.map((tx) => {
                  const outgoing = info.hash.toLowerCase() === tx.from.hash.toLowerCase();
                  const val =
                    tx.value && tx.value !== "0" ? trimDecimals(formatQuaiAmount(tx.value), 4) : null;
                  return (
                    <div key={tx.hash} className="flex items-center justify-between py-2 text-sm">
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className={
                            "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase " +
                            (outgoing
                              ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-400"
                              : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400")
                          }
                        >
                          {outgoing ? "OUT" : "IN"}
                        </span>
                        <a
                          href={`${QUAISCAN_BASE}/tx/${tx.hash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="link mono truncate text-xs"
                        >
                          {shortAddress(tx.hash, 10, 6)}
                        </a>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        {val && <span className="tabular-nums">{val} QUAI</span>}
                        <span className="w-14 text-right text-xs text-slate-400">
                          {timeAgo(tx.timestamp)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {txNext && (
              <div className="mt-3 flex justify-center">
                <button
                  onClick={loadMoreTxs}
                  disabled={loadingMore}
                  className="rounded-lg border border-slate-200 px-5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  {loadingMore ? "Loading…" : "Load more"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
