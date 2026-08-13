/**
 * worker/rpc.ts — minimal Quai JSON-RPC client for the Worker.
 *
 * Does NOT import the `quais` SDK (too heavy for a Worker bundle). Uses plain
 * fetch + batch requests, plus tiny BigInt formatters written here.
 */

const RPC_URL = "https://rpc.quai.network/cyprus1";

/** keccak256("Transfer(address,address,uint256)") — standard QRC-20 topic. */
export const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

type RpcReq = { method: string; params: unknown[]; id: number };

/** Single JSON-RPC call. */
export async function rpc<T>(method: string, params: unknown[] = []): Promise<T> {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }),
  });
  if (!res.ok) throw new Error(`RPC ${method} HTTP ${res.status}`);
  const json = (await res.json()) as { result?: T; error?: { message: string } };
  if (json.error) throw new Error(`RPC ${method}: ${json.error.message}`);
  return json.result as T;
}

/** Batch JSON-RPC call — one HTTP request for many methods. */
export async function rpcBatch<T>(reqs: RpcReq[]): Promise<(T | null)[]> {
  if (reqs.length === 0) return [];
  const body = reqs.map((r) => ({ jsonrpc: "2.0", ...r }));
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`RPC batch HTTP ${res.status}`);
  const json = (await res.json()) as { id: number; result?: T; error?: unknown }[];
  // Map results back by id to preserve request order.
  const byId = new Map<number, T | null>();
  for (const item of json) byId.set(item.id, item.error ? null : (item.result as T));
  return reqs.map((r) => byId.get(r.id) ?? null);
}

export function hexToNum(hex: string): number {
  return parseInt(hex, 16);
}

export function numToHex(n: number | bigint): string {
  return "0x" + n.toString(16);
}

/** Format a wei-denominated BigInt to a human decimal string with `decimals` places. */
export function formatUnits(raw: bigint, decimals: number): string {
  const neg = raw < 0n;
  let s = (neg ? -raw : raw).toString().padStart(decimals + 1, "0");
  const intPart = s.slice(0, s.length - decimals) || "0";
  let frac = decimals > 0 ? s.slice(s.length - decimals) : "";
  frac = frac.replace(/0+$/, "");
  const out = frac ? `${intPart}.${frac}` : intPart;
  return neg ? `-${out}` : out;
}

/** Compact display: 1,250.00 style with up to `maxFrac` fraction digits. */
export function fmtAmount(raw: bigint, decimals: number, maxFrac = 4): string {
  const full = formatUnits(raw, decimals);
  const [int, frac = ""] = full.split(".");
  const intGrouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const fracTrim = frac.slice(0, maxFrac);
  return fracTrim ? `${intGrouped}.${fracTrim}` : intGrouped;
}
