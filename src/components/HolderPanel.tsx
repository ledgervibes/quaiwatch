"use client";

import { useEffect, useState } from "react";
import { getTokenHolders, type TokenHolder, type TokenInfo } from "@/lib/quaiscan";
import { formatTokenAmount } from "@/lib/quai";
import { shortAddress, trimDecimals } from "@/lib/format";
import { QUAISCAN_BASE } from "@/lib/config";

/**
 * Top-50 holder distribution for a token. Loaded on demand when a token row
 * is expanded. One Quaiscan call (up to 50 holders).
 */
export function HolderPanel({ token }: { token: TokenInfo }) {
  const [holders, setHolders] = useState<TokenHolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const ctrl = new AbortController();
    getTokenHolders(token.address, ctrl.signal)
      .then((r) => {
        if (alive) setHolders(r.items);
      })
      .catch((e) => {
        if (alive && !ctrl.signal.aborted) setErr((e as Error).message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
      ctrl.abort();
    };
  }, [token.address]);

  const decimals = Number(token.decimals || 18);
  const supply = token.total_supply ? BigInt(token.total_supply) : 0n;

  function pctOfSupply(value: string): number {
    if (supply === 0n) return 0;
    // integer-safe percentage with 2 decimals
    const v = BigInt(value);
    return Number((v * 10000n) / supply) / 100;
  }

  const top10Pct = holders.slice(0, 10).reduce((acc, h) => acc + pctOfSupply(h.value), 0);

  return (
    <div className="bg-slate-50 px-4 py-3 dark:bg-slate-800/40">
      {err ? (
        <div className="text-xs text-amber-600 dark:text-amber-400">{err}</div>
      ) : loading ? (
        <div className="space-y-1.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-4 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
          ))}
        </div>
      ) : holders.length === 0 ? (
        <div className="text-xs text-slate-500">No holder data.</div>
      ) : (
        <>
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-600 dark:text-slate-300">
              Top {holders.length} holders
            </span>
            <span className="text-slate-400">
              top 10 hold {top10Pct.toFixed(1)}% of supply
            </span>
          </div>
          <div className="space-y-1">
            {holders.slice(0, 50).map((h, i) => {
              const pct = pctOfSupply(h.value);
              return (
                <div key={h.address.hash} className="flex items-center gap-2 text-xs">
                  <span className="w-5 shrink-0 tabular-nums text-slate-400">{i + 1}</span>
                  <a
                    href={`${QUAISCAN_BASE}/address/${h.address.hash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="link mono w-28 shrink-0"
                  >
                    {shortAddress(h.address.hash)}
                  </a>
                  <div className="relative h-3.5 flex-1 overflow-hidden rounded bg-slate-200 dark:bg-slate-700">
                    <div className="h-full rounded bg-brand-500/60" style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                  <span className="w-24 shrink-0 text-right tabular-nums text-slate-500">
                    {trimDecimals(formatTokenAmount(h.value, decimals), 2)}
                  </span>
                  <span className="w-12 shrink-0 text-right tabular-nums text-slate-400">
                    {pct.toFixed(1)}%
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
