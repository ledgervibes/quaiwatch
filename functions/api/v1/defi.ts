/**
 * functions/api/v1/defi.ts — GET /api/v1/defi
 *
 * Normalized DeFi/TVL snapshot from the explorer's Quainance TVL feed.
 * Optional query: ?days=1|7|30 (defaults to 7).
 */

import { explorerJson, json, jsonError } from "../../_lib/upstream";

interface Tvl {
  days?: number;
  stale?: boolean;
  current?: {
    tvlUsd?: string;
    totalVolumeUsd?: string;
    volume24hUsd?: string;
    estimatedFees24hUsd?: string;
    pairCount?: string;
    txCount?: string;
  };
  pools?: Array<{
    pair?: string;
    tvlUsd?: string;
    volume24hUsd?: string;
  }>;
}

export async function onRequestGet(context: { request: Request }): Promise<Response> {
  const url = new URL(context.request.url);
  const daysParam = url.searchParams.get("days");
  const days = daysParam === "1" || daysParam === "30" ? daysParam : "7";

  try {
    const tvl = await explorerJson<Tvl>(`/api/stats/tvl?days=${days}`);
    return json(
      {
        days: Number(days),
        stale: tvl.stale ?? null,
        tvlUsd: tvl.current?.tvlUsd ?? null,
        totalVolumeUsd: tvl.current?.totalVolumeUsd ?? null,
        volume24hUsd: tvl.current?.volume24hUsd ?? null,
        estimatedFees24hUsd: tvl.current?.estimatedFees24hUsd ?? null,
        pairCount: tvl.current?.pairCount ? Number(tvl.current.pairCount) : null,
        txCount: tvl.current?.txCount ? Number(tvl.current.txCount) : null,
        pools: (tvl.pools ?? []).map((p) => ({
          pair: p.pair ?? null,
          tvlUsd: p.tvlUsd ?? null,
          volume24hUsd: p.volume24hUsd ?? null,
        })),
      },
      { cacheSeconds: 120 },
    );
  } catch (cause) {
    return jsonError((cause as Error).message);
  }
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
