/**
 * functions/api/v1/network.ts — GET /api/v1/network
 *
 * Normalized network overview for third-party developers. Joins the explorer's
 * overview + hashrate + price into one stable, documented shape so consumers
 * don't have to deal with the explorer's raw field names or big-int strings.
 */

import { explorerJson, json, jsonError, toNumber } from "../../_lib/upstream";

interface Overview {
  head?: { height?: string; difficulty?: string; timestamp?: string };
  quaiSupplyTotal?: string;
  qiSupplyTotal?: string;
  totalAddresses?: number;
  totalQuaiAddresses?: number;
  totalQiAddresses?: number;
  totalParticipantAddresses?: number;
}
interface Hashrate {
  avgBlockTime?: number;
  hashratesExact?: { kawpow?: string; sha?: string; scrypt?: string };
  difficultiesExact?: { kawpow?: string; sha?: string; scrypt?: string };
}
interface Price {
  quai?: { usd?: number; source?: string };
  qi?: { usd?: number; source?: string };
}

export async function onRequestGet(): Promise<Response> {
  try {
    const [overview, hashrate, price] = await Promise.all([
      explorerJson<Overview>("/api/stats/overview"),
      explorerJson<Hashrate>("/api/stats/hashrate"),
      explorerJson<Price>("/api/price/current"),
    ]);

    return json(
      {
        chainId: 9,
        zone: "cyprus1",
        head: {
          height: toNumber(overview.head?.height),
          difficulty: overview.head?.difficulty ?? null,
          timestamp: overview.head?.timestamp ?? null,
        },
        supply: {
          quai: overview.quaiSupplyTotal ?? null,
          qi: overview.qiSupplyTotal ?? null,
        },
        addresses: {
          total: overview.totalAddresses ?? null,
          quai: overview.totalQuaiAddresses ?? null,
          qi: overview.totalQiAddresses ?? null,
          participants: overview.totalParticipantAddresses ?? null,
        },
        hashrate: {
          avgBlockTimeSeconds: hashrate.avgBlockTime ?? null,
          kawpow: hashrate.hashratesExact?.kawpow ?? null,
          sha: hashrate.hashratesExact?.sha ?? null,
          scrypt: hashrate.hashratesExact?.scrypt ?? null,
        },
        price: {
          quaiUsd: price.quai?.usd ?? null,
          qiUsd: price.qi?.usd ?? null,
          quaiSource: price.quai?.source ?? null,
          qiSource: price.qi?.source ?? null,
        },
      },
      { cacheSeconds: 30 },
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
