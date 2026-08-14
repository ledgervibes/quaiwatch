/**
 * lib/roadmap.ts — THE single source of truth for project phases & version.
 *
 * When a phase is done: change `done: false` → `true` here. VERSION bumps
 * automatically, and the badge on the Settings page updates with it — no
 * version number is hardcoded in JSX.
 *
 * ROADMAP.md at the repo root must be kept in sync with this list (the
 * human-readable version, for GitHub visitors / the Quai team).
 */

export type Phase = {
  n: number;
  title: string;
  done: boolean;
  items: string[];
};

export const PHASES: Phase[] = [
  {
    n: 1,
    title: "Core dashboard",
    done: true,
    items: [
      "Network stats",
      "Wallet explorer (QUAI + all QRC-20)",
      "Live transaction feed",
      "Token discovery",
      "Rich list",
      "QUAI & Qi price (Qi derived on-chain)",
    ],
  },
  {
    n: 2,
    title: "Price history",
    done: true,
    items: ["QUAI price chart (7D / 30D / 90D / 1Y)"],
  },
  {
    n: 3,
    title: "Telegram alert bot",
    done: true,
    items: [
      "Multi-address watchlist",
      "Alerts for QUAI (from 1 QUAI) and all QRC-20 transfers",
      "Coinbase rewards ignored",
    ],
  },
  {
    n: 4,
    title: "Deeper analytics",
    done: true,
    items: [
      "Miner analytics (block distribution, hashrate share)",
      "ETX composition breakdown",
      "Token holder distribution (top 50)",
    ],
  },
  {
    n: 5,
    title: "Wrapped Qi (WQI) tracking",
    done: false,
    items: ["WQI holders, transfers, and activity"],
  },
  {
    n: 6,
    title: "DeFi & SOAP analytics",
    done: false,
    items: [
      "DEX TVL tracking",
      "QRC-20 prices from pool reserves",
      "SOAP buyback history",
    ],
  },
  {
    n: 7,
    title: "Wallet connect & public API",
    done: false,
    items: ["Pelagus connect", "Portfolio tracker", "Read-only public API"],
  },
];

/** Number of completed phases. */
export const COMPLETED_PHASES = PHASES.filter((p) => p.done).length;

/** Version derived from the number of completed phases. Phase N done → vN.0. */
export const VERSION = `${COMPLETED_PHASES}.0`;
