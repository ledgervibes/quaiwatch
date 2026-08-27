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

/** Star icon — filled or outline. */
export function StarIcon({ filled = false, className = "" }: { filled?: boolean; className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

/** Copy to clipboard icon. */
export function CopyIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

/** Trash/delete icon. */
export function TrashIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

/** External link icon. */
export function ExternalLinkIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

/** Reusable card row for mobile layouts. */
export function CardRow({
  label,
  value,
  sub,
  href,
  onCopy,
  copyText,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  href?: string;
  onCopy?: () => void;
  copyText?: string;
}) {
  const content = (
    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
      <div className="stat-label">{label}</div>
      <div className="mt-0.5 font-medium tabular-nums">{value}</div>
      {sub && <div className="text-xs text-slate-500 dark:text-slate-400">{sub}</div>}
    </div>
  );

  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="block">
        {content}
      </a>
    );
  }

  return <div className="relative">{content}</div>;
}