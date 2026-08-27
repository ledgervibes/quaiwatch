/**
 * functions/api/v1/defi.ts — GET /api/v1/defi
 *
 * Normalized DeFi/TVL snapshot from the official Quai Explorer's Quainance TVL
 * feed. Optional query: ?days=1|7|30 (defaults to 7).
 */

import { explorerJson, json, jsonError } from "../../_lib/upstream";

interface TvlPool {
  address?: string;
  name?: string;
  token0?: { address?: string; symbol?: string };
  token1?: { address?: string; symbol?: string };
  reserve0?: string;
  reserve1?: string;
  tvlUsd?: string;
  volume24hUsd?: string;
  estimatedFees24hUsd?: string;
  txCount?: string;
}

interface Tvl {
  days?: number;
  stale?: boolean;
  source?: { id?: string; kind?: string; factoryAddress?: string };
  freshness?: { observedAt?: string };
  current?: {
    observedAt?: string;
    tvlUsd?: string;
    totalVolumeUsd?: string;
    volume24hUsd?: string;
    estimatedFees24hUsd?: string;
    pairCount?: string;
    txCount?: string;
  };
  pools?: TvlPool[];
}

const ALLOWED_DAYS = ["1", "7", "30"] as const;

export async function onRequestGet(context: { request: Request }): Promise<Response> {
  const url = new URL(context.request.url);
  const daysParam = url.searchParams.get("days");
  // Reject unknown values instead of silently substituting 7. Quietly ignoring a
  // parameter makes an integration look correct while returning a window the
  // caller never asked for.
  if (daysParam != null && !ALLOWED_DAYS.includes(daysParam as (typeof ALLOWED_DAYS)[number])) {
    return jsonError("Invalid days parameter. Allowed values: 1, 7, 30.", 400);
  }
  const days = daysParam ?? "7";

  try {
    const tvl = await explorerJson<Tvl>(`/api/stats/tvl?days=${days}`);
    return json(
      {
        days: Number(days),
        stale: tvl.stale ?? null,
        observedAt: tvl.current?.observedAt ?? tvl.freshness?.observedAt ?? null,
        // Which DEX / indexer the explorer attributes these figures to.
        source: {
          id: tvl.source?.id ?? null,
          kind: tvl.source?.kind ?? null,
          factoryAddress: tvl.source?.factoryAddress ?? null,
        },
        tvlUsd: tvl.current?.tvlUsd ?? null,
        totalVolumeUsd: tvl.current?.totalVolumeUsd ?? null,
        volume24hUsd: tvl.current?.volume24hUsd ?? null,
        estimatedFees24hUsd: tvl.current?.estimatedFees24hUsd ?? null,
        pairCount: tvl.current?.pairCount ? Number(tvl.current.pairCount) : null,
        txCount: tvl.current?.txCount ? Number(tvl.current.txCount) : null,
        pools: (tvl.pools ?? []).map((pool) => ({
          address: pool.address ?? null,
          name: pool.name ?? null,
          token0: pool.token0?.symbol ?? null,
          token1: pool.token1?.symbol ?? null,
          reserve0: pool.reserve0 ?? null,
          reserve1: pool.reserve1 ?? null,
          tvlUsd: pool.tvlUsd ?? null,
          volume24hUsd: pool.volume24hUsd ?? null,
          estimatedFees24hUsd: pool.estimatedFees24hUsd ?? null,
          txCount: pool.txCount ? Number(pool.txCount) : null,
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
