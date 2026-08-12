"use client";

import { useEffect, useMemo, useState } from "react";
import { getMainPageTxs, type Tx } from "@/lib/quaiscan";
import { LiveDot } from "@/components/ui";
import { shortAddress, timeAgo, classifyTx, trimDecimals, type TxKind } from "@/lib/format";
import { formatQuaiAmount } from "@/lib/quai";
import { QUAISCAN_BASE } from "@/lib/config";

/**
 * Live Transaction Feed.
 *
 * Catatan implementasi: rencana awal pakai WebSocket (wss). Untuk Fase 1 kita
 * pakai polling Quaiscan /main-page/transactions tiap 5 detik (block time ~4s).
 * Alasan: lebih tahan banting untuk static export (WS provider quais alpha butuh
 * penanganan reconnect yang lebih ribet), dan konsekuensi "telat 5 detik" di feed
 * dashboard itu kecil. Upgrade ke WebSocket bisa dilakukan tanpa mengubah UI ini.
 */

const FILTERS: { key: TxKind | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "native", label: "Native" },
  { key: "contract", label: "Contract" },
  { key: "coinbase", label: "Coinbase" },
];

export function TransactionFeed() {
  const [txs, setTxs] = useState<Tx[]>([]);
  const [filter, setFilter] = useState<TxKind | "all">("all");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const ctrl = new AbortController();

    async function load() {
      try {
        const data = await getMainPageTxs(ctrl.signal);
        if (!alive) return;
        setTxs(data);
        setErr(null);
      } catch (e) {
        if (alive && !ctrl.signal.aborted) setErr((e as Error).message);
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    const iv = setInterval(load, 5_000);
    return () => {
      alive = false;
      ctrl.abort();
      clearInterval(iv);
    };
  }, []);

  const filtered = useMemo(() => {
    if (filter === "all") return txs;
    return txs.filter((t) => classifyTx(t) === filter);
  }, [txs, filter]);

  return (
    <section className="card">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Live Transactions</h2>
          <LiveDot />
        </div>
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={
                "rounded-md px-2 py-1 text-xs font-medium " +
                (filter === f.key
                  ? "bg-brand-600 text-white"
                  : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800")
              }
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {err && (
        <div className="mb-2 text-xs text-amber-600 dark:text-amber-400">
          {err}
        </div>
      )}

      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {loading && txs.length === 0
          ? Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse" />
            ))
          : filtered.slice(0, 10).map((tx) => <TxRow key={tx.hash} tx={tx} />)}
        {!loading && filtered.length === 0 && (
          <div className="py-6 text-center text-sm text-slate-500">
            No transactions for this filter.
          </div>
        )}
      </div>
    </section>
  );
}

function TxRow({ tx }: { tx: Tx }) {
  const kind = classifyTx(tx);
  const valQuai = tx.value && tx.value !== "0" ? trimDecimals(formatQuaiAmount(tx.value), 4) : null;

  return (
    <div className="flex items-center justify-between gap-2 py-2.5 text-sm">
      <div className="flex min-w-0 items-center gap-2">
        <KindBadge kind={kind} />
        <a
          href={`${QUAISCAN_BASE}/tx/${tx.hash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="link mono truncate text-xs"
          title={tx.hash}
        >
          {shortAddress(tx.hash, 10, 6)}
        </a>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {valQuai && <span className="tabular-nums font-medium">{valQuai} QUAI</span>}
        <span className="w-14 text-right text-xs text-slate-400">{timeAgo(tx.timestamp)}</span>
      </div>
    </div>
  );
}

function KindBadge({ kind }: { kind: TxKind }) {
  const map: Record<TxKind, string> = {
    native: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
    contract: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
    coinbase: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400",
    other: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  };
  return (
    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${map[kind]}`}>
      {kind}
    </span>
  );
}
