/**
 * functions/api/_middleware.ts — rate limiting for everything under /api/*.
 *
 * WHY THIS EXISTS
 * QuaiWatch reads the official Quai Explorer server-side. The explorer allows
 * 300 requests/minute PER IP — and from Cloudflare that IP is shared by every
 * visitor. So a single abusive client hammering /api/v1/portfolio/{address} with
 * many different addresses (cache-busting by design, since each address is a
 * distinct cache key) could burn the whole quota and take the QuaiWatch
 * dashboard down with it, not just the public API.
 *
 * Two independent guards:
 *   1. PER-IP  — stops one client from monopolising the service.
 *   2. UPSTREAM BUDGET — a global ceiling kept below the explorer's own limit,
 *      so QuaiWatch fails with a clean 429 instead of getting the shared
 *      Cloudflare egress IP throttled by the explorer.
 *
 * IMPLEMENTATION NOTE (honest limitation)
 * Counters live in Worker isolate memory. Cloudflare runs many isolates across
 * many locations, so these limits are per-isolate and therefore APPROXIMATE —
 * the effective global ceiling is higher than the numbers below. This is a
 * deliberate trade-off: it costs nothing, adds no latency, and needs no D1
 * binding, while still cutting off the realistic single-source abuse case.
 * If precise global limits are ever needed, move the counters into D1 or a
 * Durable Object.
 */

/** Per-IP allowance for the public API (/api/v1/*). */
const PUBLIC_API_PER_IP_PER_MIN = 60;

/** Per-IP allowance for the dashboard's explorer proxy (/api/explorer/*). */
const PROXY_PER_IP_PER_MIN = 240;

/**
 * Global upstream ceiling per isolate per minute. Held below the explorer's
 * documented 300/min so cached traffic still has headroom.
 */
const UPSTREAM_BUDGET_PER_MIN = 200;

const WINDOW_MS = 60_000;

type Counter = { count: number; windowStart: number };

const perIp = new Map<string, Counter>();
const upstream: Counter = { count: 0, windowStart: 0 };

/** Fixed-window counter. Returns false when the caller is over budget. */
function consume(counter: Counter, limit: number, now: number): boolean {
  if (now - counter.windowStart >= WINDOW_MS) {
    counter.count = 0;
    counter.windowStart = now;
  }
  if (counter.count >= limit) return false;
  counter.count++;
  return true;
}

function secondsUntilReset(counter: Counter, now: number): number {
  const elapsed = now - counter.windowStart;
  return Math.max(1, Math.ceil((WINDOW_MS - elapsed) / 1000));
}

/** Drop stale IP entries so the map can't grow without bound. */
function sweep(now: number): void {
  if (perIp.size < 5_000) return;
  for (const [ip, counter] of perIp) {
    if (now - counter.windowStart >= WINDOW_MS * 2) perIp.delete(ip);
  }
}

function tooManyRequests(retryAfter: number, scope: string): Response {
  return new Response(
    JSON.stringify({
      error: "Rate limit exceeded",
      scope,
      retryAfterSeconds: retryAfter,
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Retry-After": String(retryAfter),
        "Cache-Control": "no-store",
      },
    },
  );
}

export async function onRequest(context: {
  request: Request;
  next: () => Promise<Response>;
}): Promise<Response> {
  const { request, next } = context;
  const url = new URL(request.url);

  // Preflight never touches an upstream, so it is never rate limited.
  if (request.method === "OPTIONS") return next();

  const now = Date.now();
  sweep(now);

  const isPublicApi = url.pathname.startsWith("/api/v1");
  const perIpLimit = isPublicApi ? PUBLIC_API_PER_IP_PER_MIN : PROXY_PER_IP_PER_MIN;

  const ip =
    request.headers.get("CF-Connecting-IP") ??
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ??
    "unknown";

  let ipCounter = perIp.get(ip);
  if (!ipCounter) {
    ipCounter = { count: 0, windowStart: now };
    perIp.set(ip, ipCounter);
  }

  if (!consume(ipCounter, perIpLimit, now)) {
    return tooManyRequests(secondsUntilReset(ipCounter, now), "per-ip");
  }

  if (!consume(upstream, UPSTREAM_BUDGET_PER_MIN, now)) {
    return tooManyRequests(secondsUntilReset(upstream, now), "upstream-budget");
  }

  const response = await next();

  // Advertise remaining per-IP allowance, mirroring the explorer's own style.
  const headers = new Headers(response.headers);
  headers.set("RateLimit-Limit", String(perIpLimit));
  headers.set("RateLimit-Remaining", String(Math.max(0, perIpLimit - ipCounter.count)));
  headers.set("RateLimit-Reset", String(secondsUntilReset(ipCounter, now)));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
