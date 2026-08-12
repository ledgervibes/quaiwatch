"use client";

/** Generic statistic card with a loading state. */
export function StatCard({
  label,
  value,
  sub,
  loading,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  loading?: boolean;
}) {
  return (
    <div className="card">
      <div className="stat-label">{label}</div>
      {loading ? (
        <div className="mt-2 h-7 w-24 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
      ) : (
        <div className="stat-value">{value}</div>
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
