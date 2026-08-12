"use client";

/** Generic statistic card with a loading state. `hero` emphasizes key metrics. */
export function StatCard({
  label,
  value,
  sub,
  loading,
  hero = false,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  loading?: boolean;
  hero?: boolean;
}) {
  return (
    <div className={hero ? "card-hero" : "card"}>
      <div className="stat-label">{label}</div>
      {loading ? (
        <div
          className={
            "mt-2 animate-pulse rounded bg-slate-200 dark:bg-slate-800 " +
            (hero ? "h-9 w-32" : "h-7 w-24")
          }
        />
      ) : (
        <div className={hero ? "mt-1 text-3xl font-bold tabular-nums sm:text-4xl" : "stat-value"}>{value}</div>
      )}
      {sub != null && !loading && (
        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{sub}</div>
      )}
    </div>
  );
}

/** "LIVE" indicator with a pulsing dot. */
export function LiveDot({ label = "LIVE" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-pulse">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full rounded-full bg-pulse opacity-75 animate-pulse-ring" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-pulse" />
      </span>
      {label}
    </span>
  );
}

/** Static "auto-refresh" hint — for panels that poll on an interval, not truly live. */
export function RefreshHint({ seconds }: { seconds: number }) {
  return (
    <span className="text-xs font-medium text-slate-400 dark:text-slate-500">
      Auto-refresh · {seconds}s
    </span>
  );
}
