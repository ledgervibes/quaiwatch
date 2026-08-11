"use client";

import { useEffect, useState } from "react";
import { getRichList, type AddressListItem, type PageParams } from "@/lib/quaiscan";
import { formatQuaiAmount } from "@/lib/quai";
import { shortAddress, thousands, trimDecimals, compactNumber } from "@/lib/format";
import { QUAISCAN_BASE } from "@/lib/config";

/** Rich List / Top holders QUAI native. */
export default function RichListPage() {
  const [items, setItems] = useState<AddressListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextParams, setNextParams] = useState<PageParams>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    getRichList(null, ctrl.signal)
      .then((r) => {
        setItems(r.items);
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
      const r = await getRichList(nextParams);
      setItems((prev) => [...prev, ...r.items]);
      setNextParams(r.next_page_params);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Rich List</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Top native QUAI holders on Cyprus-1.
        </p>
      </div>

      {err && <div className="text-sm text-rose-500">{err}</div>}

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 text-left text-xs uppercase text-slate-500 dark:border-slate-800">
            <tr>
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Address</th>
              <th className="px-4 py-3 text-right">Balance (QUAI)</th>
              <th className="px-4 py-3 text-right">Txns</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading
              ? Array.from({ length: 12 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={4} className="px-4 py-3">
                      <div className="h-5 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
                    </td>
                  </tr>
                ))
              : items.map((a, idx) => (
                  <tr key={a.hash} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-3 tabular-nums text-slate-400">{idx + 1}</td>
                    <td className="px-4 py-3">
                      <a
                        href={`${QUAISCAN_BASE}/address/${a.hash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="link mono text-xs"
                      >
                        {shortAddress(a.hash, 10, 8)}
                      </a>
                      {a.name && <span className="ml-2 text-xs text-slate-400">{a.name}</span>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">
                      {compactNumber(
                        Number(trimDecimals(formatQuaiAmount(a.coin_balance), 0)),
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-500">
                      {thousands(a.tx_count)}
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      {!loading && nextParams && (
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
