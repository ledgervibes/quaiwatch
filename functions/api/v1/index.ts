/**
 * functions/api/v1/index.ts — GET /api/v1
 *
 * Self-describing index of the QuaiWatch public API. Lets developers discover
 * available endpoints without external docs.
 */

import { json } from "../../_lib/upstream";

export function onRequestGet(context: { request: Request }): Response {
  const origin = new URL(context.request.url).origin;
  return json(
    {
      name: "QuaiWatch Public API",
      version: "v1",
      description:
        "Read-only, normalized Quai Network data. Free, no API key. Backed by the official Quai Explorer with QuaiWatch normalization and edge caching.",
      chainId: 9,
      zone: "cyprus1",
      endpoints: [
        {
          method: "GET",
          path: "/api/v1/network",
          description: "Network overview: head, supply, addresses, hashrate, prices.",
          example: `${origin}/api/v1/network`,
        },
        {
          method: "GET",
          path: "/api/v1/portfolio/{address}",
          description:
            "Balances (QUAI, Qi, locked), token holdings, and USD valuation for an account-model address. No transaction history (use Quaiscan).",
          example: `${origin}/api/v1/portfolio/0x0045F33e4b34775E0547193433de8B8F3CEd8Fc8`,
        },
        {
          method: "GET",
          path: "/api/v1/defi?days=1|7|30",
          description: "DEX TVL, 24h volume, estimated fees, and per-pool breakdown.",
          example: `${origin}/api/v1/defi?days=7`,
        },
        {
          method: "GET",
          path: "/api/v1/conversions",
          description: "Daily Quai <-> Qi conversion counts and volumes.",
          example: `${origin}/api/v1/conversions`,
        },
      ],
      notes: [
        "All responses set Access-Control-Allow-Origin: * — safe to call from any browser app.",
        "Big integers (wei, qits) are returned as strings to preserve precision.",
        "Responses are edge-cached; see each response's Cache-Control header.",
        "Rate limit: 60 requests/minute per IP. Over-limit requests return HTTP 429 with a Retry-After header.",
        "Errors use the shape {\"error\": \"message\"} with HTTP 400 (bad input), 429 (rate limited), or 502 (upstream failure).",
      ],
      units: {
        quai: "QUAI amounts under `balances` and `valuation` are already divided by 10^18.",
        qi: "Qi uses 3 decimals, not 18. `balances.qi` is already divided by 10^3.",
        tokens:
          "`tokens[].balance` is decimal-adjusted; `tokens[].balanceRaw` is the raw integer string.",
      },
      dataQuality:
        "Backed by the official Quai Explorer. Some explorer metrics are self-reported as 'recovering' or 'provisional' while its trace repair runs; values are passed through unchanged.",
    },
    { cacheSeconds: 300 },
  );
}

export function onRequestOptions(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
    },
  });
}
