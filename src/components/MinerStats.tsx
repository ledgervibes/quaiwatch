"use client";

import { useEffect, useState } from "react";
import {
  getExplorerHashrate,
  getExplorerMiningSummary,
  type ExplorerHashrate,
  type ExplorerMiningSummary,
} from "@/lib/explorer";
import { getRecentBlocks, type QuaiBlock } from "@/lib/quai";
import { shortAddress, thousands, compactNumber } from "@/lib/format";
import { QUAISCAN_BASE } from "@/lib/config";

/**
 * Mining analytics.
 *
 * BLOCK DISTRIBUTION comes from the official explorer's 24h mining summary
 * (~17k blocks, `truncated: false`), not from a local RPC sample. An earlier
 * version sampled 50-100 blocks and labelled the result "hashrate share", which
 * was wrong twice over: a block count is not a hashrate, and 50 blocks out of
 * ~17,280 per day is too small to be representative.
 *
 * HASHRATE is reported separately and is a real hashrate: the explorer reads
 * `quai_getMiningInfo` (go-quai v0.55) with `observed_share_work` semantics.
 *
 * WORKSHARES still come from a local block sample, and the sample size is stated
 * in the UI, because per-block workshare counts are not in the summary endpoint.
 */

type WorkshareSample = { sampled: number; workshares: number; etxCoinbase: number; etxOther: number };

const WORKSHARE_SAMPLE_BLOCKS = 50;

function sampleWorkshares(blocks: QuaiBlock[]): WorkshareSample {
  let workshares = 0;
  let etxCoinbase = 0;
  let etxOther = 0;
  for (const block of blocks) {
    if (Array.isArray(block.workshares)) workshares += block.workshares.length;
    for (const tx of block.transactions ?? []) {
      if (tx.etxType === "0x1") etxCoinbase++;
      else if (tx.etxType) etxOther++;
    }
  }
  return { sampled: blocks.length, workshares, etxCoinbase, etxOther };
}

type MinerRow = { address: string; blocks: number; pct: number };

function rankMiners(counts: Record<string, number>): { rows: MinerRow[]; total: number } {
  const entries = Object.entries(counts ?? {});
  const total = entries.reduce((sum, [, n]) => sum + n, 0);
  const rows = entries
    .map(([address, blocks]) => ({
      address,
      blocks,
      pct: total > 0 ? (blocks / total) * 100 : 0,
    }))
    .sort((a, b) => b.blocks - a.blocks);
  return { rows, total };
}

export function MinerStats() {
  const [summary, setSummary] = useState<ExplorerMiningSummary | null>(null);
  const [hashrate, setHashrate] = useState<ExplorerHashrate | null>(null);
  const [sample, setSample] = useState<WorkshareSample | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const ctrl = new AbortController();

    Promise.all([
      getExplorerMiningSummary({ signal: ctrl.signal }),
      getExplorerHashrate({ signal: ctrl.signal }),
    ])
      .then(([nextSummary, nextHashrate]) => {
        if (!alive) return;
        setSummary(nextSummary);
        setHashrate(nextHashrate);
      })
      .catch((cause) => {
        if (alive && !ctrl.signal.aborted) setErr((cause as Error).message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    // Workshares are a separate, clearly-labelled local sample.
    getRecentBlocks(WORKSHARE_SAMPLE_BLOCKS, undefined, ctrl.signal)
      .then((blocks) => {
        if (alive) setSample(sampleWorkshares(blocks));
      })
      .catch(() => {
        /* optional panel — the rest of the page is unaffected */
      });

    return () => {
      alive = false;
      ctrl.abort();
    };
  }, []);

  const miners = summary ? rankMiners(summary.minerCounts) : null;
  const blocksCovered = summary?.minerCoverage?.blocks?.sampledRows ?? 0;
  const truncated = summary?.minerCoverage?.blocks?.truncated ?? false;

  return (
    <div className="space-y-6">
      {err && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          Failed to load mining data: {err}
        </div>
      )}

      {/* Real hashrate, per algorithm */}
      <section className="card">
        <div className="mb-3">
          <h2 className="text-sm font-semibold">Hashrate by algorithm</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Observed share work from <span className="mono">quai_getMiningInfo</span>, via the
            official Quai Explorer.
          </p>
        </div>
        {loading || !hashrate ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <HashrateCell label="KawPoW" value={hashrate.hashratesExact.kawpow} />
              <HashrateCell label="SHA" value={hashrate.hashratesExact.sha} />
              <HashrateCell label="Scrypt" value={hashrate.hashratesExact.scrypt} />
            </div>
            <p className="mt-3 text-xs text-slate-400">
              {hashrate.avgBlockTime.toFixed(2)}s average block time over{" "}
              {thousands(hashrate.blockCount)} blocks · {hashrate.measurement.trailingWindowSeconds / 60}
              -minute window
            </p>
          </>
        )}
      </section>

      {/* Block distribution — official 24h data */}
      <section className="card">
        <div className="mb-3">
          <h2 className="text-sm font-semibold">
            Block distribution{" "}
            <span className="font-normal text-slate-400">· last 24 hours</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Share of blocks mined per address. This is block distribution, not hashrate.
          </p>
        </div>

        {loading ? (
          <div className="space-y-2 py-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-6 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
            ))}
          </div>
        ) : !miners || miners.rows.length === 0 ? (
          <p className="py-4 text-sm text-slate-500">No miner data reported.</p>
        ) : (
          <>
            <div className="space-y-2">
              {miners.rows.map((miner) => (
                <div key={miner.address} className="flex items-center gap-3 text-sm">
                  <a
                    href={`${QUAISCAN_BASE}/address/${miner.address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="link mono w-32 shrink-0 text-xs"
                  >
                    {shortAddress(miner.address)}
                  </a>
                  <div className="relative h-6 flex-1 overflow-hidden rounded bg-slate-100 dark:bg-slate-800">
                    <div
                      className="h-full rounded bg-brand-500/70"
                      style={{ width: `${Math.max(miner.pct, 0.4)}%` }}
                    />
                  </div>
                  <span className="w-28 shrink-0 text-right tabular-nums text-slate-500">
                    {thousands(miner.blocks)} · {miner.pct.toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-slate-400">
              {miners.rows.length} miners across {thousands(blocksCovered || miners.total)} blocks
              {truncated ? " (sample truncated by the explorer)" : ""}.
            </p>
          </>
        )}
      </section>

      {/* Workshares — local sample, size stated */}
      <section className="card">
        <div className="mb-3">
          <h2 className="text-sm font-semibold">Workshares</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Sub-block proof-of-work — a Quai-specific measure of merged-mining participation.
          </p>
        </div>
        {!sample ? (
          <div className="h-16 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
        ) : (
          <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
            <div>
              <div className="text-3xl font-bold tabular-nums">
                {(sample.workshares / (sample.sampled || 1)).toFixed(1)}
              </div>
              <div className="text-xs text-slate-400">avg per block</div>
            </div>
            <div>
              <div className="text-3xl font-bold tabular-nums">{thousands(sample.workshares)}</div>
              <div className="text-xs text-slate-400">
                across {sample.sampled} sampled blocks
              </div>
            </div>
          </div>
        )}
        {sample && (
          <p className="mt-3 text-xs text-slate-400">
            Sampled live from the last {sample.sampled} blocks via RPC. Of {" "}
            {thousands(sample.etxCoinbase + sample.etxOther)} ETXs in that sample,{" "}
            {thousands(sample.etxCoinbase)} were miner payouts (coinbase) and{" "}
            {thousands(sample.etxOther)} were cross-shard — Quai runs a single zone
            (Cyprus-1) today, so cross-shard activity is expected to be zero.
          </p>
        )}
      </section>
    </div>
  );
}

/** Format a raw hash/s figure with an SI suffix (H/s → PH/s). */
function formatHashrate(raw: string): string {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return "-";
  const units = ["H/s", "KH/s", "MH/s", "GH/s", "TH/s", "PH/s", "EH/s"];
  let scaled = value;
  let unit = 0;
  while (scaled >= 1000 && unit < units.length - 1) {
    scaled /= 1000;
    unit++;
  }
  return `${scaled.toFixed(scaled < 10 ? 2 : 1)} ${units[unit]}`;
}

function HashrateCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 px-4 py-3 dark:border-slate-800">
      <div className="stat-label">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{formatHashrate(value)}</div>
      <div className="mt-0.5 text-xs text-slate-400">{compactNumber(Number(value))} H/s</div>
    </div>
  );
}
