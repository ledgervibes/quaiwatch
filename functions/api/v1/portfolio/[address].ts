/**
 * functions/api/v1/portfolio/[address].ts — GET /api/v1/portfolio/:address
 *
 * Normalized read-only portfolio for a Quai account-model address. Balances and
 * token holdings come from the explorer; USD valuation is joined from the
 * explorer price feed.
 *
 * Reliability note: transaction history is intentionally NOT part of this
 * endpoint. Balances are sub-second, while history requires a separate upstream
 * call with very different latency; bundling them would make every portfolio
 * request as slow as the slowest source. Consumers who need history should call
 * the proxied Etherscan-compatible surface:
 *   /api/explorer/api?module=account&action=txlist&address={addr}
 */

import {
  explorerJson,
  isAddress,
  json,
  jsonError,
  toNumber,
} from "../../../_lib/upstream";

type Ctx = { params: { address?: string } };

interface ExplorerAddress {
  info?: {
    balance_quai?: string;
    locked_balance_quai?: string;
    balance_qi?: string;
    locked_balance_qi?: string;
    tx_count?: string;
    last_balance_block?: string;
  };
}
interface TokenBalances {
  items?: Array<{
    token_address: string;
    balance: string;
    token: { name: string; symbol: string; decimals: number; type: string };
  }>;
}
interface Price {
  quai?: { usd?: number };
  qi?: { usd?: number };
}

export async function onRequestGet(context: Ctx): Promise<Response> {
  const address = context.params.address;
  if (!isAddress(address)) {
    return jsonError("Invalid Quai address (expected 0x + 40 hex chars).", 400);
  }

  try {
    const [addr, balances, price] = await Promise.all([
      explorerJson<ExplorerAddress>(`/api/address/${address}`),
      explorerJson<TokenBalances>(`/api/address/${address}/token-balances`),
      explorerJson<Price>("/api/price/current"),
    ]);

    const quai = toNumber(addr.info?.balance_quai) / 1e18;
    const qi = toNumber(addr.info?.balance_qi) / 1e3;
    const quaiUsd = price.quai?.usd ?? null;
    const qiUsd = price.qi?.usd ?? null;
    const quaiValue = quaiUsd != null ? quai * quaiUsd : null;
    const qiValue = qiUsd != null ? qi * qiUsd : null;

    const tokens = (balances.items ?? [])
      .filter((t) => toNumber(t.balance) > 0)
      .map((t) => ({
        address: t.token_address,
        name: t.token.name,
        symbol: t.token.symbol,
        decimals: t.token.decimals,
        type: t.token.type,
        balanceRaw: t.balance,
        balance: toNumber(t.balance) / 10 ** (t.token.decimals || 0),
      }));

    return json(
      {
        address,
        balances: {
          quai,
          qi,
          lockedQuai: toNumber(addr.info?.locked_balance_quai) / 1e18,
          lockedQi: toNumber(addr.info?.locked_balance_qi) / 1e3,
        },
        valuation: {
          quaiUsd: quaiValue,
          qiUsd: qiValue,
          totalUsd: quaiValue != null && qiValue != null ? quaiValue + qiValue : null,
        },
        tokens,
        txCount: toNumber(addr.info?.tx_count),
        indexedBlock: toNumber(addr.info?.last_balance_block),
      },
      { cacheSeconds: 15 },
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
