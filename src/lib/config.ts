/**
 * Quai network configuration.
 *
 * IMPORTANT: the `ZONES` array is intentionally made multi-zone-ready.
 * Currently only Cyprus-1 is active on mainnet (quai_listRunningChains -> [[0,0]]).
 * The 8 other zones (Cyprus 2/3, Paxos 1/2/3, Hydra 1/2/3) are documented by Quai
 * but not yet enabled. Once they go live, just add an entry here —
 * no URLs are hardcoded and scattered across components.
 */

export type ZoneConfig = {
  /** internal id, used in UI & query params */
  id: string;
  /** display name */
  name: string;
  /** zone index [region, zone] per Quai docs */
  index: [number, number];
  /** JSON-RPC over HTTPS */
  rpc: string;
  /** JSON-RPC over WebSocket (live feed) */
  wss: string;
  /** whether this zone is currently active on mainnet */
  active: boolean;
};

export const CHAIN_ID = 9;

/**
 * Quaiscan base (Blockscout v6.3.0). CORS "*", so it can be called directly
 * from the browser without a proxy. QUAISCAN_BASE is also used for explorer UI
 * links (href), not just API calls.
 */
export const QUAISCAN_BASE = "https://quaiscan.io";
export const QUAISCAN_API_V2 = `${QUAISCAN_BASE}/api/v2`;

/**
 * Official Quai Explorer indexed API.
 *
 * The explorer host (https://explorer.qu.ai) does NOT send CORS headers, so the
 * browser cannot call it directly. All browser access goes through QuaiWatch's
 * own same-origin proxy (a Cloudflare Pages Function at /api/explorer/*), which
 * fetches the explorer server-side and adds edge caching. See
 * functions/api/explorer/[[path]].ts.
 *
 * Kept separate from Quaiscan until full migration is proven.
 */
export const QUAI_EXPLORER_PROXY = "/api/explorer";

export const ZONES: ZoneConfig[] = [
  {
    id: "cyprus1",
    name: "Cyprus-1",
    index: [0, 0],
    rpc: "https://rpc.quai.network/cyprus1",
    wss: "wss://rpc.quai.network/cyprus1",
    active: true,
  },
  // --- Not yet active (uncomment when Quai enables them) ---
  // { id: "cyprus2", name: "Cyprus-2", index: [0, 1], rpc: "...", wss: "...", active: false },
];

/** Default zone used across the whole app while only one is active. */
export const DEFAULT_ZONE: ZoneConfig =
  ZONES.find((z) => z.active) ?? ZONES[0];

export const ACTIVE_ZONES = ZONES.filter((z) => z.active);

export function getZone(id?: string | null): ZoneConfig {
  if (!id) return DEFAULT_ZONE;
  return ZONES.find((z) => z.id === id) ?? DEFAULT_ZONE;
}

/** Metadata for the two native tokens. Qi has only 3 decimals — see lib/quai.ts. */
export const NATIVE = {
  quai: { symbol: "QUAI", decimals: 18, name: "Quai" },
  qi: { symbol: "Qi", decimals: 3, name: "Qi" },
} as const;

/** CoinGecko ID for the QUAI price (free, no API key). Qi is NOT on CoinGecko. */
export const COINGECKO_QUAI_ID = "quai-network";

/** Official Wrapped Qi token currently indexed on Cyprus-1. */
export const WQI = {
  address: "0x002b2596EcF05C93a31ff916E8b456DF6C77c750",
  symbol: "WQI",
  name: "Wrapped Qi",
  decimals: 18,
} as const;

/**
 * Wrapped Quai (WQUAI) — the QUAI-denominated base asset for DEX pairs on
 * Cyprus-1. Token prices are derived from the WQUAI-side reserve (WQUAI ≈ 1 QUAI).
 * Address is lowercased for direct comparison against explorer/RPC output.
 */
export const WQUAI = {
  address: "0x006C3e2AaAE5DB1bCd11A1a097cE572312EADdBB",
  addressLower: "0x006c3e2aaae5db1bcd11a1a097ce572312eaddbb",
  symbol: "WQUAI",
  name: "Wrapped Quai",
  decimals: 18,
} as const;

/**
 * Support info & social links. Displayed on the Settings page & footer.
 *
 * quaiAddress: account-model address (QUAI), verified via RPC to exist on
 * Cyprus-1 (prefix 0x0045, quai_getBalance succeeded). ONLY accepts QUAI — do not
 * send Qi here (Qi uses UTXO, a different address format).
 * If the string is empty, the Buy Me a Coffee section automatically shows "coming soon".
 */
export const SUPPORT = {
  quaiAddress: "0x0045F33e4b34775E0547193433de8B8F3CEd8Fc8",
  xUrl: "https://x.com/QuaiWatch",
  githubUrl: "https://github.com/ledgervibes/quaiwatch",
} as const;

/**
 * SOAP burn address (buyback-and-burn from external merged-mining subsidies).
 * Verified on-chain: holds a large QUAI balance and receives QUAI transactions
 * (152+ txs). 100% of purchased QUAI is burned here. See lib/defi.ts.
 */
export const SOAP_BURN_ADDRESS = "0x0050AF0000000000000000000000000000000000";
