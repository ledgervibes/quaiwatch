/**
 * lib/format.ts — helper tampilan (angka, alamat, waktu). Murni, tanpa dependency.
 */

/** Singkat alamat: 0x0011..85b8 */
export function shortAddress(addr: string, head = 6, tail = 4): string {
  if (!addr) return "";
  if (addr.length <= head + tail) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

/** Format angka besar dengan suffix (K/M/B). */
export function compactNumber(n: number | string): string {
  const num = typeof n === "string" ? Number(n) : n;
  if (!isFinite(num)) return "-";
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(num);
}

/** Format angka dengan pemisah ribuan. */
export function thousands(n: number | string): string {
  const num = typeof n === "string" ? Number(n) : n;
  if (!isFinite(num)) return "-";
  return new Intl.NumberFormat("en-US").format(num);
}

/** Format USD. */
export function usd(n: number, maxFrac = 6): string {
  if (!isFinite(n)) return "-";
  let min = n !== 0 && Math.abs(n) < 0.01 ? 4 : 2;
  // minimumFractionDigits tidak boleh melebihi maximumFractionDigits
  if (min > maxFrac) min = maxFrac;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: min,
    maximumFractionDigits: maxFrac,
  }).format(n);
}

/** Format persen dengan tanda. */
export function pct(n: number): string {
  if (!isFinite(n)) return "-";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

/** Potong string desimal ke N digit signifikan tanpa membulatkan kasar. */
export function trimDecimals(v: string, maxFrac = 4): string {
  if (!v.includes(".")) return v;
  const [int, frac] = v.split(".");
  const trimmed = frac.slice(0, maxFrac).replace(/0+$/, "");
  return trimmed ? `${int}.${trimmed}` : int;
}

/** "12s ago", "3m ago", "5h ago". */
export function timeAgo(ts: string | number | Date | null): string {
  if (ts == null) return "-";
  const d = typeof ts === "string" || typeof ts === "number" ? new Date(ts) : ts;
  const secs = Math.floor((Date.now() - d.getTime()) / 1000);
  if (secs < 0) return "just now";
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/**
 * Klasifikasi tipe transaksi Quai untuk filter feed.
 * Catatan: "token transfer" tidak diklasifikasikan di sini — endpoint
 * /main-page/transactions tidak menandai token transfer, jadi butuh decode
 * log Transfer. Filter token ditunda sampai itu tersedia.
 */
export type TxKind = "native" | "contract" | "coinbase" | "other";

export function classifyTx(tx: {
  method: string | null;
  etx_type: string | null;
  to: { is_contract: boolean } | null;
  value: string;
}): TxKind {
  if (tx.etx_type === "coinbase") return "coinbase";
  if (tx.method) return tx.to?.is_contract ? "contract" : "other";
  if (tx.to?.is_contract) return "contract";
  if (tx.value && tx.value !== "0") return "native";
  return "other";
}
