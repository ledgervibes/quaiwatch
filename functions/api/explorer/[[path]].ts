/**
 * functions/api/explorer/[[path]].ts
 *
 * Same-origin read-only proxy to the official Quai Explorer.
 *
 * The browser cannot call https://explorer.qu.ai directly because that host
 * sends no Access-Control-Allow-Origin header. This Function runs on
 * QuaiWatch's own origin, so the browser talks to `/api/explorer/...`
 * (same-origin, no CORS), and the Function fetches the explorer server-side.
 *
 * Security posture:
 * - GET/OPTIONS only. No write methods are forwarded.
 * - Path allow-list (prefix match). This is NOT an open proxy.
 * - The explorer's rate limit (300/min) is counted against Cloudflare's shared
 *   egress IP here, so responses are edge-cached to keep call volume low.
 */

import { EXPLORER_BASE, fetchUpstream } from "../../_lib/upstream";

interface Env {}

type Ctx = {
  request: Request;
  params: { path?: string | string[] };
};

/**
 * Allowed explorer path prefixes. A request is permitted if its path starts
 * with one of these. Everything else is rejected with 403.
 */
/**
 * Explorer paths that must match EXACTLY (query string is separate, so an entry
 * here still allows `?module=...`). Kept separate from prefix matching because
 * the Etherscan-compatible surface lives at the bare `api` path — allowing it as
 * a prefix would expose every `api/*` endpoint and defeat the allow-list.
 */
const ALLOWED_EXACT = [
  "api", // Etherscan-compatible: /api?module=account&action=txlist&...
  "api/health",
  "api/sync-status",
  "api/price/current",
  "api/blocks",
  "api/txs",
  "api/transactions",
  "api/workshares",
  "api/accounts",
  "api/tokens",
  "search",
];

/** Explorer path prefixes (must end with "/"). */
const ALLOWED_PREFIXES = [
  "api/stats/",
  "api/supply/",
  "api/mining/",
  "api/block/",
  "api/transactions/",
  "api/tx/",
  "api/workshare/",
  "api/address/",
  "api/token/",
  "api/nft/",
  "api/contracts/",
  "api/contract/",
];

function isAllowed(path: string): boolean {
  if (ALLOWED_EXACT.includes(path)) return true;
  return ALLOWED_PREFIXES.some((prefix) => path.startsWith(prefix));
}

/**
 * Per-path-prefix cache TTL (seconds). High-volume, slow-moving aggregates are
 * cached longer; per-address data is cached briefly so a wallet view stays fresh.
 */
function cacheSecondsFor(path: string): number {
  if (path.startsWith("api/price/")) return 30;
  if (path.startsWith("api/stats/tvl")) return 120;
  if (path.startsWith("api/stats/soap")) return 300;
  if (path.startsWith("api/stats/daily")) return 300;
  if (path.startsWith("api/stats/")) return 30;
  if (path.startsWith("api/supply/")) return 120;
  if (path.startsWith("api/mining/")) return 60;
  if (path.startsWith("api/tokens") || path.startsWith("api/token/")) return 60;
  if (path.startsWith("api/address/")) return 15;
  if (path.startsWith("api/accounts")) return 30;
  // Etherscan-compatible surface (exact "api"): mostly address txlist.
  if (path === "api") return 15;
  return 15;
}

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}

export async function onRequestGet(context: Ctx): Promise<Response> {
  const raw = context.params.path;
  const segments = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const path = segments.map((s) => encodeURIComponent(s)).join("/");

  if (!path) {
    return errorResponse("Missing explorer path", 400);
  }

  const allowed = isAllowed(path);
  if (!allowed) {
    return errorResponse(`Path not allowed: ${path}`, 403);
  }

  const search = new URL(context.request.url).search;
  const upstreamUrl = `${EXPLORER_BASE}/${path}${search}`;

  let res: Response;
  try {
    res = await fetchUpstream(upstreamUrl);
  } catch (cause) {
    return errorResponse((cause as Error).message || "Explorer unreachable", 502);
  }

  const body = await res.text();
  const cacheSeconds = res.ok ? cacheSecondsFor(path) : 0;
  const headers: Record<string, string> = {
    "Content-Type": res.headers.get("Content-Type") ?? "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Cache-Control": cacheSeconds > 0 ? `public, max-age=${cacheSeconds}` : "no-store",
    // Surface the upstream status so the client can distinguish a real 503
    // (endpoint not ready) from a proxy error.
    "X-Explorer-Status": String(res.status),
  };
  return new Response(body, { status: res.status, headers });
}

function errorResponse(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export type { Env };
