"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMediaQuery } from "@/lib/hooks";
import { getTokens, type TokenInfo, type PageParams } from "@/lib/quaiscan";
import { formatTokenAmount } from "@/lib/quai";
import { shortAddress, thousands, compactNumber, trimDecimals } from "@/lib/format";
import { QUAISCAN_BASE } from "@/lib/config";
import { HolderPanel } from "@/components/HolderPanel";
import { CardRow } from "@/components/ui";

/** Token Discovery: list of all QRC-20 (without price — not available). */
export default function TokensPage() {
  const [tokens, setTokens] = useState<TokenInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextParams, setNextParams] = useState<PageParams>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const isMobile = useMediaQuery("(max-width: 768px)");

  useEffect(() => {
    const ctrl = new AbortController();
    getTokens(null, ctrl.signal)
      .then((r) => {
        setTokens(r.items);
        setNextParams(r.next_page_params);
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
      const r = await getTokens(nextParams);
      setTokens((prev) => [...prev, ...r.items]);
      setNextParams(r.next_page_params);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoadingMore(false);
    }
  }

  const filtered = q
    ? tokens.filter(
        (t) =>
          t.symbol?.toLowerCase().includes(q.toLowerCase()) ||
          t.name?.toLowerCase().includes(q.toLowerCase()),
      )
    : tokens;

  const canLoadMore = !q && !!nextParams;

  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Token Discovery</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            All QRC-20 tokens on Quai. USD value not available (no free price source).
          </p>
        </div>
      </div>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Filter by symbol / name..."
        className="w-full max-w-sm rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-brand-500 dark:border-slate-700 dark:bg-slate-800"
      />

      {err && <div className="text-sm text-rose-500">{err}</div>}

      {isMobile ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {loading
            ? Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-20 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
              ))
            : filtered.map((t) => (
                <Link key={t.address} href={`/tokens/${t.address}`} className="block">
                  <TokenCard token={t} />
                </Link>
              ))}
        </div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-xs uppercase text-slate-500 dark:border-slate-800">
              <tr>
                <th className="px-4 py-3">Token</th>
                <th className="px-4 py-3 text-right">Holders</th>
                <th className="px-4 py-3 text-right">Total Supply</th>
                <th className="px-4 py-3">Contract</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading
                ? Array.from({ length: 10 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={4} className="px-4 py-3">
                        <div className="h-5 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
                      </td>
                    </tr>
                  ))
                : filtered.map((t) => (
                    <FragmentRow key={t.address} t={t} expanded={expanded} setExpanded={setExpanded} />
                  ))}
            </tbody>
          </table>
        </div>
      )}

      {canLoadMore && (
        <div className="flex justify-center">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="rounded-lg border border-slate-200 px-5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}

function TokenCard({ token }: { token: TokenInfo }) {
  const supply = Number(trimDecimals(formatTokenAmount(token.total_supply, Number(token.decimals || 18)), 0));
  return (
    <CardRow
      label={token.symbol || "?"}
      value={compactNumber(supply)}
      sub={`${thousands(token.holders)} holders`}
      href={`/tokens/${token.address}`}
    />
  );
}

function FragmentRow({
  t,
  expanded,
  setExpanded,
}: {
  t: TokenInfo;
  expanded: string | null;
  setExpanded: (v: string | null) => void;
}) {
  const isOpen = expanded === t.address;
  return (
    <>
      <tr
        onClick={() => setExpanded(isOpen ? null : t.address)}
        className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">{isOpen ? "▾" : "▸"}</span>
            <Link href={`/tokens/${t.address}`} className="font-medium hover:text-brand-600">
              {t.symbol || "?"}
            </Link>
          </div>
          <div className="text-xs text-slate-400">{t.name}</div>
        </td>
        <td className="px-4 py-3 text-right tabular-nums">{thousands(t.holders)}</td>
        <td className="px-4 py-3 text-right tabular-nums">
          {compactNumber(
            Number(trimDecimals(formatTokenAmount(t.total_supply, Number(t.decimals || 18)), 0)),
          )}
        </td>
        <td className="px-4 py-3">
          <a
            href={`${QUAISCAN_BASE}/token/${t.address}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="link mono text-xs"
          >
            {shortAddress(t.address)}
          </a>
        </td>
      </tr>
      {isOpen && (
        <tr>
          <td colSpan={4} className="p-0">
            <HolderPanel token={t} />
          </td>
        </tr>
      )}
    </>
  );
}