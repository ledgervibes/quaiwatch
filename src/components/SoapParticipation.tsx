"use client";

import { useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { getExplorerSoap, type ExplorerSoap } from "@/lib/explorer";
import { formatHashrate, thousands } from "@/lib/format";

/**
 * SOAP participation — Quai's hashrate share per merged-mining donor chain
 * (Ravencoin, Bitcoin Cash, Litecoin, Dogecoin), derived by the official
 * explorer from signed AuxPoW evidence.
 *
 * This is NOT the buyback-and-burn flow (that is the SOAP transactions table
 * below); it is the mining-side input that determines how much of each donor
 * chain's block reward Quai is entitled to.
 *
 * DOGE must render as "unavailable", not 0%: when a donor's target is not
 * committed on-chain the explorer nulls the numbers and explains why in
 * unavailableReason (verified: 168/168 history buckets null for DOGE).
 *
 * The trend chart uses a logarithmic Y axis on purpose: LTC sits at ~0.6% while
 * RVN is ~38%, so a linear axis would flatten LTC into an unreadable line at
 * the bottom.
 */

const COLORS = ["#22d3ee", "#6366f1", "#f59e0b", "#f43f5e"];

type Row = {
  bucket: string;
  label: string;
  /** keyed by donor-chain id → participation % */
  [netId: string]: string | number | null;
};

export function SoapParticipation() {
  const [soap, setSoap] = useState<ExplorerSoap | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const ctrl = new AbortController();
    getExplorerSoap(7, { signal: ctrl.signal })
      .then((res) => {
        if (alive) setSoap(res);
      })
      .catch((cause) => {
        if (alive && !ctrl.signal.aborted) setErr((cause as Error).message);
      });
    return () => {
      alive = false;
      ctrl.abort();
    };
  }, []);

  /** Networks that have at least one non-null participation point. */
  const charted = useMemo(() => {
    if (!soap) return [];
    return soap.networks.filter((n) => {
      const buckets = soap.history[n.id] ?? [];
      return buckets.some((b) => b.participationPct != null);
    });
  }, [soap]);

  const series = useMemo<Row[]>(() => {
    if (!soap) return [];
    const byBucket = new Map<string, Row>();
    for (const net of soap.networks) {
      for (const b of soap.history[net.id] ?? []) {
        const row: Row = byBucket.get(b.bucket) ?? { bucket: b.bucket, label: b.bucket.slice(5, 16).replace("T", " ") };
        row[net.id] = b.participationPct == null ? null : Number(b.participationPct);
        byBucket.set(b.bucket, row);
      }
    }
    return [...byBucket.values()].sort((a, b) => a.bucket.localeCompare(b.bucket));
  }, [soap]);

  return (
    <section className="card">
      <div className="mb-3">
        <h2 className="text-sm font-semibold">
          SOAP participation{" "}
          <span className="font-normal text-slate-400">· hashrate share, last 7 days</span>
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Quai&apos;s share of each donor chain&apos;s hashrate, from signed AuxPoW evidence in the
          official Quai Explorer. Log scale — LTC would otherwise be invisible next to RVN.
        </p>
      </div>

      {err ? (
        <div className="py-6 text-center text-sm text-amber-600 dark:text-amber-400">{err}</div>
      ) : !soap ? (
        <div className="h-64 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {soap.networks.map((net) => {
              const pct = net.participationPct == null ? null : Number(net.participationPct);
              return (
                <div key={net.id} className="rounded-lg border border-slate-200 px-3 py-2.5 dark:border-slate-800">
                  <div className="stat-label flex items-center justify-between">
                    <span>{net.id}</span>
                    <span className="font-normal text-slate-400">{net.algorithm}</span>
                  </div>
                  {pct != null ? (
                    <>
                      <div className="mt-0.5 text-xl font-bold tabular-nums">{pct.toFixed(2)}%</div>
                      <div className="text-xs text-slate-400">
                        {formatHashrate(net.quaiHashrate ?? "")} of {formatHashrate(net.donorHashrate ?? "")}
                      </div>
                      {net.proofCount != null && (
                        <div className="text-xs text-slate-400">{thousands(net.proofCount)} proofs</div>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="mt-0.5 text-sm font-semibold text-slate-400">unavailable</div>
                      <div className="text-xs text-slate-400" title={net.unavailableReason ?? ""}>
                        {net.unavailableReason ?? "no signed evidence"}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {charted.length > 0 && series.length > 0 && (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={series} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11 }}
                    stroke="currentColor"
                    className="text-slate-400"
                    interval="preserveStartEnd"
                    minTickGap={48}
                  />
                  <YAxis
                    scale="log"
                    domain={["auto", "auto"]}
                    tick={{ fontSize: 11 }}
                    stroke="currentColor"
                    className="text-slate-400"
                    tickFormatter={(v: number) => `${v}%`}
                    width={52}
                  />
                  <Tooltip
                    contentStyle={{
                      fontSize: 12,
                      borderRadius: 8,
                      border: "1px solid rgba(148,163,184,0.3)",
                      background: "rgba(15,23,42,0.92)",
                      color: "#f8fafc",
                    }}
                    formatter={(value: number, name: string) => [`${value.toFixed(2)}%`, name]}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {/* Lines must be direct children of <LineChart> — recharts does not
                      traverse fragments when collecting graphical items. */}
                  {charted.map((net, i) => (
                    <Line
                      key={net.id}
                      type="monotone"
                      dataKey={net.id}
                      name={net.id}
                      stroke={COLORS[i % COLORS.length]}
                      strokeWidth={1.8}
                      dot={false}
                      connectNulls={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          <p className="mt-3 text-xs text-slate-400">
            Participation drives SOAP: donors whose targets are committed receive Quai&apos;s
            merged-mining work, and the corresponding rewards flow back as buyback-and-burn.
            Hourly resolution, 168 points per chain.
          </p>
        </>
      )}
    </section>
  );
}
