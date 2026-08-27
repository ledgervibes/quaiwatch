/**
 * worker/explorer.ts — native balance reads for the Worker.
 *
 * WHY NOT quai_getBalance: the public Quai RPC REJECTS non-EIP-55 addresses
 * (`{"code":-32000,"message":"address has invalid checksum"}` — verified live for
 * both lowercase and uppercase forms). The watchlist stores addresses lowercase
 * (so `chat_id + address` dedupes reliably), and re-deriving the checksum needs
 * keccak256, which the Worker has no crypto primitive for and which is not worth
 * bundling a library over.
 *
 * The official explorer's Etherscan-compatible surface accepts lowercase and
 * answers `balancemulti` for up to many addresses in ONE request, which is also
 * cheaper against Cloudflare's per-invocation subrequest limit than one RPC call
 * per address. Verified live: returns exact wei strings for lowercase input.
 */

const EXPLORER_BASE = "https://explorer.qu.ai";
const TIMEOUT_MS = 10_000;

/** Etherscan `balancemulti` caps the address list; chunk to stay within it. */
const MAX_ADDRESSES_PER_CALL = 20;

type BalanceMulti = {
  status?: string;
  message?: string;
  result?: Array<{ account?: string; balance?: string }> | string;
};

/**
 * Current native QUAI balance (wei) for each address, keyed by lowercase address.
 *
 * Addresses that the upstream does not report are simply absent from the map —
 * the caller treats a missing balance as "unknown" and leaves the stored value
 * alone rather than inventing a change.
 */
export async function getNativeBalances(
  addresses: string[],
): Promise<Map<string, bigint>> {
  const out = new Map<string, bigint>();
  for (let i = 0; i < addresses.length; i += MAX_ADDRESSES_PER_CALL) {
    const chunk = addresses.slice(i, i + MAX_ADDRESSES_PER_CALL);
    const params = new URLSearchParams({
      module: "account",
      action: "balancemulti",
      address: chunk.join(","),
    });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${EXPLORER_BASE}/api?${params.toString()}`, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`explorer balancemulti HTTP ${res.status}`);
      const body = (await res.json()) as BalanceMulti;
      if (body.status !== "1" || !Array.isArray(body.result)) {
        throw new Error(`explorer balancemulti: ${body.message ?? "unexpected response"}`);
      }
      for (const row of body.result) {
        if (!row.account || row.balance == null) continue;
        try {
          out.set(row.account.toLowerCase(), BigInt(row.balance));
        } catch {
          // A non-numeric balance is upstream noise, not a balance of zero.
        }
      }
    } finally {
      clearTimeout(timer);
    }
  }
  return out;
}

/** Number of subrequests `getNativeBalances` will spend for n addresses. */
export function balanceCallCount(addressCount: number): number {
  return Math.ceil(addressCount / MAX_ADDRESSES_PER_CALL);
}
