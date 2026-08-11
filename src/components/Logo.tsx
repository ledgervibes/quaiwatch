/**
 * Logo QuaiWatch — huruf Q dengan ekor berbentuk pulse line + dot notifikasi.
 * Murni SVG (nol aset eksternal), tetap legible di 16×16 (favicon / avatar bot).
 */

export function Logo({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      role="img"
      aria-label="QuaiWatch logo"
    >
      <defs>
        <linearGradient id="qw-grad" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#6366f1" />
          <stop offset="1" stopColor="#4338ca" />
        </linearGradient>
      </defs>
      {/* lingkaran Q */}
      <circle cx="21" cy="22" r="13" stroke="url(#qw-grad)" strokeWidth="4" fill="none" />
      {/* ekor Q berbentuk garis heartbeat/pulse */}
      <path
        d="M20 30 l3.5 0 l2.5 -6 l3 12 l2.5 -8 l2 4 l3 0"
        stroke="#22d3ee"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* dot notifikasi */}
      <circle cx="39" cy="10" r="6" fill="#22d3ee" />
      <circle cx="39" cy="10" r="6" fill="none" stroke="#22d3ee" strokeWidth="1.5" opacity="0.5" />
    </svg>
  );
}
