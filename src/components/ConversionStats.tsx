"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { getExplorerDaily, type ExplorerDailyItem } from "@/lib/explorer";
import { thousands, compactNumber } from "@/lib/format";

/**
 * Quai <-> Qi conversion activity.
 *
 * This closes a gap: conversion monitoring was reopened on the roadmap and
 * exposed at /api/v1/conversions, but had no UI, so the dashboard was hiding data
 * the API already served.
 *
 * SOURCE: the explorer's daily aggregates. Individual conversion transactions
 * are NOT used — checked 100 of the most recent transactions and none carried
 * `is_conversion`, so a live conversion feed would usually be empty. Daily
 * aggregates are the reliable view: 26 of the last 30 days show activity.
 *
 * UNITS: `quai*` fields are wei (1e18); `qi*` fields are qits (1e3). Getting the
 * Qi divisor wrong is off by 10^15, so both are converted explicitly here.
 */

const QUAI_WEI = 1e18;
const QI_QITS = 1e3;

type Point = {
  date: string;
  label: string;
  quaiToQiCount: number;
  qiToQuaiCount: number;
  /** QUAI sent in to be converted into Qi. */
  quaiIn: number;
  /** QUAI received back from converting Qi. */
  quaiOut: number;
  qiIn: number;
  qiOut: number;
};

function toPoints(items: ExplorerDailyItem[]): Point[] {
  return items.map((item) => ({
    date: item.date,
    label: item.date.slice(5), // MM-DD
    quaiToQiCount: item.quaiToQiTxCount ?? 0,
    qiToQuaiCount: item.qiToQuaiTxCount ?? 0,
    quaiIn: Number(item.quaiSentForConversion ?? 0) / QUAI_WEI,
    quaiOut: Number(item.quaiReceivedFromConversion ?? 0) / QUAI_WEI,
    qiIn: Number(item.qiReceivedFromConversion ?? 0) / QI_QITS,
    qiOut: Number(item.qiSentForConversion ?? 0) / QI_QITS,
  }));
}

type Metric = "count" | "volume";

export function ConversionStats() {
  const [points, setPoints] = useState<Point[]>([]);
  const [metric, setMetric] = useState<Metric>("count");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const ctrl = new AbortController();
    getExplorerDaily({ signal: ctrl.signal })
      .then((res) => {
        if (alive) setPoints(toPoints(res.items ?? []));
      })
      .catch((cause) => {
        if (alive && !ctrl.signal.aborted) setErr((cause as Error).message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
      ctrl.abort();
    };
  }, []);

  const totals = useMemo(() => {
    if (points.length === 0) return null;
    const sum = points.reduce(
      (acc, p) => ({
        quaiToQiCount: acc.quaiToQiCount + p.quaiToQiCount,
        qiToQuaiCount: acc.qiToQuaiCount + p.qiToQuaiCount,
        quaiIn: acc.quaiIn + p.quaiIn,
        quaiOut: acc.quaiOut + p.quaiOut,
        activeDays: acc.activeDays + (p.quaiToQiCount + p.qiToQuaiCount > 0 ? 1 : 0),
      }),
      { quaiToQiCount: 0, qiToQuaiCount: 0, quaiIn: 0, quaiOut: 0, activeDays: 0 },
    );
    return { ...sum, days: points.length };
  }, [points]);

  /**
   * Bars must be direct children of <BarChart>. Recharts discovers its graphical
   * items by inspecting children and does not traverse React fragments, so
   * wrapping these in <>...</> silently renders an empty chart (no bars, no
   * legend, and no Y axis, since there is then no numeric domain).
   */
  const bars: { key: keyof Point; name: string; fill: string }[] =
    metric === "count"
      ? [
          { key: "qiToQuaiCount", name: "Qi → QUAI", fill: "#22d3ee" },
          { key: "quaiToQiCount", name: "QUAI → Qi", fill: "#6366f1" },
        ]
      : [
          { key: "quaiOut", name: "QUAI out of Qi", fill: "#22d3ee" },
          { key: "quaiIn", name: "QUAI into Qi", fill: "#6366f1" },
        ];

  return (
    <section className="card">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">
            Quai ↔ Qi conversions{" "}
            <span className="font-normal text-slate-400">· last 30 days</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Protocol-level conversions between Quai&apos;s two native assets, from the official
            Quai Explorer daily aggregates.
          </p>
        </div>
        <div className="flex gap-1">
          {(
            [
              ["count", "Tx count"],
              ["volume", "QUAI volume"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setMetric(key)}
              className={
                "rounded-md px-2.5 py-1 text-xs font-medium " +
                (metric === key
                  ? "bg-brand-600 text-white"
                  : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800")
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {err ? (
        <div className="py-6 text-center text-sm text-amber-600 dark:text-amber-400">{err}</div>
      ) : loading ? (
        <div className="h-64 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
      ) : points.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">No conversion data reported.</p>
      ) : (
        <>
          {totals && (
            <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Metric
                label="Qi → QUAI"
                value={thousands(totals.qiToQuaiCount)}
                sub="conversions"
              />
              <Metric
                label="QUAI → Qi"
                value={thousands(totals.quaiToQiCount)}
                sub="conversions"
              />
              <Metric
                label="QUAI out of Qi"
                value={`${compactNumber(totals.quaiOut)} QUAI`}
                sub="30-day total"
              />
              <Metric
                label="Active days"
                value={`${totals.activeDays} / ${totals.days}`}
                sub="with conversions"
              />
            </div>
          )}

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11 }}
                  stroke="currentColor"
                  className="text-slate-400"
                  interval="preserveStartEnd"
                  minTickGap={18}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  stroke="currentColor"
                  className="text-slate-400"
                  tickFormatter={(v: number) => compactNumber(v)}
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
                  formatter={(value: number, name: string) => [
                    metric === "count"
                      ? `${thousands(value)} tx`
                      : `${value.toLocaleString("en-US", { maximumFractionDigits: 2 })} QUAI`,
                    name,
                  ]}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {bars.map((bar) => (
                  <Bar
                    key={bar.key}
                    dataKey={bar.key}
                    name={bar.name}
                    fill={bar.fill}
                    radius={[2, 2, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>

          <p className="mt-3 text-xs text-slate-400">
            Conversions are asymmetric by design: Qi → QUAI dominates because miners are paid in
            Qi. Daily aggregates only — individual conversion transactions rarely appear in the
            recent-transaction feed.
          </p>
        </>
      )}
    </section>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2.5 dark:border-slate-800">
      <div className="stat-label">{label}</div>
      <div className="mt-0.5 text-xl font-bold tabular-nums">{value}</div>
      <div className="text-xs text-slate-400">{sub}</div>
    </div>
  );
}
