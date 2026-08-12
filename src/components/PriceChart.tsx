"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  getQuaiPriceChart,
  CHART_RANGES,
  type ChartRange,
  type PricePoint,
} from "@/lib/price";
import { usd, pct } from "@/lib/format";

/** QUAI price chart with a 7D / 30D / 90D / 1Y range selector. */
export function PriceChart() {
  const [range, setRange] = useState<ChartRange>("30");
  const [data, setData] = useState<PricePoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const ctrl = new AbortController();
    setLoading(true);
    setErr(null);
    getQuaiPriceChart(range, ctrl.signal)
      .then((d) => {
        if (alive) setData(d);
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
  }, [range]);

  const stats = useMemo(() => {
    if (data.length < 2) return null;
    const first = data[0].p;
    const last = data[data.length - 1].p;
    const change = ((last - first) / first) * 100;
    return { last, change };
  }, [data]);

  const isDaily = range === "365";

  return (
    <section className="card flex h-full flex-col">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">QUAI Price</h2>
          </div>
          {stats && (
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-semibold tabular-nums">
                {usd(stats.last)}
              </span>
              <span
                className={
                  "text-sm font-medium " +
                  (stats.change >= 0 ? "text-emerald-500" : "text-rose-500")
                }
              >
                {pct(stats.change)}
              </span>
            </div>
          )}
        </div>
        <div className="flex gap-1">
          {CHART_RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={
                "rounded-md px-2 py-1 text-xs font-medium " +
                (range === r.key
                  ? "bg-brand-600 text-white"
                  : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800")
              }
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-[240px] flex-1">
        {err ? (
          <div className="flex h-[240px] items-center justify-center px-4 text-center text-sm text-amber-600 dark:text-amber-400">
            {err}
          </div>
        ) : loading ? (
          <div className="h-[240px] w-full animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800/50" />
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={data} margin={{ top: 5, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="t"
                type="number"
                domain={["dataMin", "dataMax"]}
                scale="time"
                tickFormatter={(t) =>
                  new Date(t).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })
                }
                tick={{ fontSize: 11, fill: "#94a3b8" }}
                minTickGap={40}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={["auto", "auto"]}
                tickFormatter={(v) => usd(v, 6)}
                tick={{ fontSize: 11, fill: "#94a3b8" }}
                width={70}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: "#0f172a",
                  border: "1px solid #334155",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelStyle={{ color: "#cbd5e1" }}
                itemStyle={{ color: "#a5b4fc" }}
                labelFormatter={(t) =>
                  new Date(t as number).toLocaleString("en-US", {
                    dateStyle: "medium",
                    ...(isDaily ? {} : { timeStyle: "short" }),
                  })
                }
                formatter={(v: number) => [usd(v), "QUAI"]}
              />
              <Area
                type="monotone"
                dataKey="p"
                stroke="#6366f1"
                strokeWidth={2}
                fill="url(#priceFill)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
