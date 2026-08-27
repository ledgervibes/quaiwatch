/**
 * functions/_lib/upstream.ts — shared server-side helper for Pages Functions.
 *
 * This file lives under `_lib/` so Cloudflare Pages does NOT turn it into a
 * route (it exports no onRequest handler). It is imported by the explorer proxy
 * and the public /api/v1 endpoints.
 *
 * Why this exists: the official Quai Explorer (https://explorer.qu.ai) does NOT
 * send Access-Control-Allow-Origin, so a browser cannot call it directly. These
 * Functions run on QuaiWatch's own origin, fetch the explorer server-side (no
 * CORS in server-to-server calls), add edge caching, and return the result.
 */

export const EXPLORER_BASE = "https://explorer.qu.ai";

/** Default per-request timeout when talking to upstreams. */
const DEFAULT_TIMEOUT_MS = 12_000;

/** Fetch an upstream URL with a timeout and one retry on 503/gateway errors. */
export async function fetchUpstream(
  url: string,
  init?: RequestInit & { timeoutMs?: number; retries?: number },
): Promise<Response> {
  const timeoutMs = init?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = init?.retries ?? 1;

  let lastError: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: { Accept: "application/json", ...(init?.headers ?? {}) },
      });
      clearTimeout(timer);
      // Retry transient upstream failures (the explorer returns 503 on some
      // address sub-resources while its trace repair is still running).
      if ((res.status === 503 || res.status === 502 || res.status === 504) && attempt < retries) {
        lastError = new Error(`upstream ${res.status}`);
        await sleep(300 * (attempt + 1));
        continue;
      }
      return res;
    } catch (cause) {
      clearTimeout(timer);
      lastError = cause;
      if (attempt < retries) {
        await sleep(300 * (attempt + 1));
        continue;
      }
    }
  }
  throw lastError ?? new Error("upstream request failed");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Fetch JSON from the explorer, throwing on non-2xx with a typed error. */
export async function explorerJson<T>(path: string): Promise<T> {
  const res = await fetchUpstream(`${EXPLORER_BASE}${path}`);
  if (!res.ok) {
    throw new UpstreamError(`Quai Explorer ${path}`, res.status);
  }
  return (await res.json()) as T;
}

export class UpstreamError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(`${message} HTTP ${status}`);
    this.name = "UpstreamError";
    this.status = status;
  }
}

/** Standard JSON response with CORS + cache headers for the public API. */
export function json(
  data: unknown,
  init?: { status?: number; cacheSeconds?: number },
): Response {
  const status = init?.status ?? 200;
  const cacheSeconds = init?.cacheSeconds ?? 0;
  const headers: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
    // The public API is meant to be consumed by other developers, so it is
    // intentionally open to any origin.
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  };
  headers["Cache-Control"] =
    cacheSeconds > 0 ? `public, max-age=${cacheSeconds}` : "no-store";
  return new Response(JSON.stringify(data), { status, headers });
}

/** JSON error envelope used across the public API. */
export function jsonError(message: string, status = 502): Response {
  return json({ error: message }, { status });
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/** Validate a Quai account-model address (0x + 40 hex). */
export function isAddress(value: string | null | undefined): value is string {
  return typeof value === "string" && ADDRESS_RE.test(value);
}

/**
 * Parse a decimal/scientific string into a finite number (0 on failure).
 *
 * PRECISION WARNING: only for values that are already scaled to human size
 * (USD, percentages, counts). Raw integer amounts must go through `toBigInt` /
 * `scaleBigInt`, because an 18-decimal wei balance exceeds
 * Number.MAX_SAFE_INTEGER and would be silently rounded.
 */
export function toNumber(value: string | number | null | undefined): number {
  if (value == null || value === "") return 0;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Parse a raw integer amount exactly.
 *
 * The explorer normally returns plain integer strings, but uses scientific
 * notation for very large aggregates (verified live: supply comes back as
 * "1.0833e+27"), which `BigInt()` rejects — so that form is expanded instead of
 * being discarded.
 */
export function toBigInt(value: string | number | null | undefined): bigint {
  if (value == null || value === "") return 0n;
  const raw = String(value).trim();
  if (/^-?\d+$/.test(raw)) return BigInt(raw);

  const sci = /^(-?)(\d+)(?:\.(\d+))?[eE]\+?(\d+)$/.exec(raw);
  if (sci) {
    const [, sign, int, frac = "", expRaw] = sci;
    const exp = Number(expRaw);
    const digits = int + frac;
    const zeros = exp - frac.length;
    if (zeros >= 0) return BigInt(`${sign}${digits}${"0".repeat(zeros)}`);
    return BigInt(`${sign}${digits.slice(0, digits.length + zeros)}`);
  }
  const plain = /^(-?\d+)\.\d+$/.exec(raw);
  if (plain) return BigInt(plain[1]);
  return 0n;
}

/**
 * Scale a raw integer amount down by `decimals` without losing the integer part.
 *
 * Division happens in BigInt, so the whole units are exact; only the fractional
 * remainder passes through double precision, which is harmless at display scale.
 */
export function scaleBigInt(
  value: string | number | null | undefined,
  decimals: number,
): number {
  const raw = toBigInt(value);
  if (raw === 0n) return 0;
  if (decimals <= 0) return Number(raw);
  const divisor = 10n ** BigInt(decimals);
  const whole = raw / divisor;
  const remainder = raw < 0n ? -(raw % divisor) : raw % divisor;
  const fraction = remainder.toString().padStart(decimals, "0");
  return Number(`${whole}.${fraction}`);
}
