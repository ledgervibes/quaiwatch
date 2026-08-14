"use client";

import { useEffect, useState } from "react";
import { getRecentBlocks, type QuaiBlock } from "@/lib/quai";
import { shortAddress } from "@/lib/format";
import { QUAISCAN_BASE } from "@/lib/config";

/**
 * Mining distribution + network composition, computed from recent block
 * headers via a single batch RPC call. See lib/quai.ts:getRecentBlocks.
 */

type MinerRow = { address: string; blocks: number; pct: number };
type Stats = {
  sampled: number;
  miners: MinerRow[];
  coinbaseEtx: number;
  otherEtx: number;
  normalTx: number;
  workshares: number;
};

function computeStats(blocks: QuaiBlock[]): Stats {
  const minerCount = new Map<string, number>();
  let coinbaseEtx = 0;
  let otherEtx = 0;
  let normalTx = 0;
  let workshares = 0;

  for (const b of blocks) {
    const miner = b.woHeader?.primaryCoinbase;
    if (miner) minerCount.set(miner, (minerCount.get(miner) ?? 0) + 1);
    if (Array.isArray(b.workshares)) workshares += b.workshares.length;
    for (const tx of b.transactions ?? []) {
      if (tx.etxType) {
        if (tx.etxType === "0x1") coinbaseEtx++;
        else otherEtx++;
      } else if (tx.type === "0x0") {
        normalTx++;
      }
    }
  }

  const total = blocks.length || 1;
  const miners = [...minerCount.entries()]
    .map(([address, blocks]) => ({ address, blocks, pct: (blocks / total) * 100 }))
    .sort((a, b) => b.blocks - a.blocks);

  return { sampled: blocks.length, miners, coinbaseEtx, otherEtx, normalTx, workshares };
}

export function MinerStats() {
  const [sample, setSample] = useState(50);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const ctrl = new AbortController();
    setLoading(true);
    setErr(null);
    getRecentBlocks(sample, undefined, ctrl.signal)
      .then((blocks) => {
        if (alive) setStats(computeStats(blocks));
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
  }, [sample]);

  return (
    <div className="space-y-6">
      {/* Mining distribution */}
      <section className="card">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">
            Mining Distribution{" "}
            <span className="font-normal text-slate-400">· last {sample} blocks</span>
          </h2>
          <div className="flex gap-1">
            {[50, 100].map((n) => (
              <button
                key={n}
                onClick={() => setSample(n)}
                disabled={loading}
                className={
                  "rounded-md px-2 py-1 text-xs font-medium disabled:opacity-50 " +
                  (sample === n
                    ? "bg-brand-600 text-white"
                    : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800")
                }
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {err ? (
          <div className="py-6 text-center text-sm text-amber-600 dark:text-amber-400">{err}</div>
        ) : loading ? (
          <div className="py-8 text-center text-sm text-slate-500">
            Scanning last {sample} blocks…
            <div className="mt-3 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-6 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
              ))}
            </div>
          </div>
        ) : stats ? (
          <>
            <div className="space-y-2">
              {stats.miners.map((m) => (
                <div key={m.address} className="flex items-center gap-3 text-sm">
                  <a
                    href={`${QUAISCAN_BASE}/address/${m.address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="link mono w-32 shrink-0 text-xs"
                  >
                    {shortAddress(m.address)}
                  </a>
                  <div className="relative h-6 flex-1 overflow-hidden rounded bg-slate-100 dark:bg-slate-800">
                    <div
                      className="h-full rounded bg-brand-500/70"
                      style={{ width: `${m.pct}%` }}
                    />
                  </div>
                  <span className="w-24 shrink-0 text-right tabular-nums text-slate-500">
                    {m.blocks} · {m.pct.toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-slate-400">
              {stats.miners.length} unique miners across {stats.sampled} blocks.
            </p>
          </>
        ) : null}
      </section>

      {/* Network composition + workshares */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <section className="card">
          <h2 className="mb-3 text-sm font-semibold">Network Composition</h2>
          {loading || !stats ? (
            <div className="h-24 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
          ) : (
            <div className="space-y-2 text-sm">
              <Row label="Coinbase ETX (miner payouts)" value={stats.coinbaseEtx} />
              <Row label="Cross-shard / other ETX" value={stats.otherEtx} />
              <Row label="Normal transactions" value={stats.normalTx} />
              <p className="pt-2 text-xs text-slate-400">
                From {stats.sampled} blocks. Quai is currently single-zone
                (Cyprus-1), so cross-shard ETX activity is expected to be zero.
              </p>
            </div>
          )}
        </section>

        <section className="card">
          <h2 className="mb-3 text-sm font-semibold">Workshares</h2>
          {loading || !stats ? (
            <div className="h-24 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
          ) : (
            <div className="space-y-1">
              <div className="text-3xl font-bold tabular-nums">
                {(stats.workshares / (stats.sampled || 1)).toFixed(1)}
              </div>
              <div className="text-xs text-slate-400">avg per block</div>
              <p className="pt-3 text-xs text-slate-500">
                {stats.workshares} workshares across {stats.sampled} blocks — a
                Quai-specific measure of merged-mining participation.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-600 dark:text-slate-300">{label}</span>
      <span className="tabular-nums font-medium">{value}</span>
    </div>
  );
}
