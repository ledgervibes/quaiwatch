/**
 * Konfigurasi jaringan Quai.
 *
 * PENTING: array `ZONES` sengaja dibikin multi-zone-ready.
 * Saat ini cuma Cyprus-1 yang aktif di mainnet (quai_listRunningChains -> [[0,0]]).
 * 8 zone lain (Cyprus 2/3, Paxos 1/2/3, Hydra 1/2/3) sudah didokumentasikan Quai
 * tapi belum dinyalakan. Begitu mereka live, cukup tambah entri di sini —
 * gak ada URL yang di-hardcode tersebar di komponen.
 */

export type ZoneConfig = {
  /** id internal, dipakai di UI & query param */
  id: string;
  /** nama tampil */
  name: string;
  /** indeks zone [region, zone] sesuai docs Quai */
  index: [number, number];
  /** JSON-RPC over HTTPS */
  rpc: string;
  /** JSON-RPC over WebSocket (live feed) */
  wss: string;
  /** apakah zone ini aktif di mainnet sekarang */
  active: boolean;
};

export const CHAIN_ID = 9;

/**
 * Base Quaiscan (Blockscout v6.3.0). CORS "*", jadi bisa dipanggil langsung
 * dari browser tanpa proxy. Punya API v2 (utama) dan v1 etherscan-compatible (fallback).
 */
export const QUAISCAN_BASE = "https://quaiscan.io";
export const QUAISCAN_API_V2 = `${QUAISCAN_BASE}/api/v2`;
export const QUAISCAN_API_V1 = `${QUAISCAN_BASE}/api`;

export const ZONES: ZoneConfig[] = [
  {
    id: "cyprus1",
    name: "Cyprus-1",
    index: [0, 0],
    rpc: "https://rpc.quai.network/cyprus1",
    wss: "wss://rpc.quai.network/cyprus1",
    active: true,
  },
  // --- Belum aktif (uncomment saat Quai menyalakan) ---
  // { id: "cyprus2", name: "Cyprus-2", index: [0, 1], rpc: "...", wss: "...", active: false },
];

/** Zone default yang dipakai seluruh app selama cuma satu yang aktif. */
export const DEFAULT_ZONE: ZoneConfig =
  ZONES.find((z) => z.active) ?? ZONES[0];

export const ACTIVE_ZONES = ZONES.filter((z) => z.active);

export function getZone(id?: string | null): ZoneConfig {
  if (!id) return DEFAULT_ZONE;
  return ZONES.find((z) => z.id === id) ?? DEFAULT_ZONE;
}

/** Metadata dua token native. Qi hanya 3 desimal — lihat lib/quai.ts. */
export const NATIVE = {
  quai: { symbol: "QUAI", decimals: 18, name: "Quai" },
  qi: { symbol: "Qi", decimals: 3, name: "Qi" },
} as const;

/** ID CoinGecko buat harga QUAI (gratis, tanpa API key). Qi TIDAK ada di CoinGecko. */
export const COINGECKO_QUAI_ID = "quai-network";

/**
 * Info support & tautan sosial. Ditampilkan di halaman Settings & footer.
 *
 * quaiAddress: alamat account-model (QUAI), sudah diverifikasi via RPC ada di
 * Cyprus-1 (prefix 0x0045, quai_getBalance sukses). HANYA nerima QUAI — jangan
 * kirim Qi ke sini (Qi pakai UTXO, format alamat beda).
 * Kalau string kosong, seksi Buy Me a Coffee otomatis tampil "coming soon".
 */
export const SUPPORT = {
  quaiAddress: "0x0045F33e4b34775E0547193433de8B8F3CEd8Fc8",
  xUrl: "https://x.com/QuaiWatch",
  githubUrl: "https://github.com/ledgervibes/quaiwatch",
} as const;

/** Alamat burn SOAP (buyback dari external merged-mining). Dipakai di Fase 4. */
export const SOAP_BURN_ADDRESS = "0x0050AF0000000000000000000000000000000000";
