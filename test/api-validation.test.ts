/**
 * test/api-validation.test.ts — the public API must reject bad input instead of
 * quietly substituting a default.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { onRequestGet as defi } from "../functions/api/v1/defi";
import { onRequestGet as portfolio } from "../functions/api/v1/portfolio/[address]";

const EXPLORER_TVL = {
  stale: false,
  source: { id: "quainance", kind: "subgraph", factoryAddress: "0x00" },
  current: {
    observedAt: "2026-08-21T00:00:00.000Z",
    tvlUsd: "1",
    totalVolumeUsd: "2",
    volume24hUsd: "3",
    estimatedFees24hUsd: "4",
    pairCount: "4",
    txCount: "5",
  },
  pools: [],
};

function stubExplorer(byPath: Record<string, unknown>) {
  const original = globalThis.fetch;
  const seen: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    seen.push(url);
    const match = Object.entries(byPath).find(([path]) => url.includes(path));
    if (!match) return new Response("not found", { status: 404 });
    return new Response(JSON.stringify(match[1]), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return {
    seen,
    restore() {
      globalThis.fetch = original;
    },
  };
}

test("defi accepts the documented windows", async () => {
  for (const days of ["1", "7", "30"]) {
    const stub = stubExplorer({ "/api/stats/tvl": EXPLORER_TVL });
    try {
      const res = await defi({
        request: new Request(`https://example.invalid/api/v1/defi?days=${days}`),
      });
      assert.equal(res.status, 200, days);
      assert.ok(
        stub.seen.some((u) => u.includes(`days=${days}`)),
        `forwards days=${days} upstream`,
      );
    } finally {
      stub.restore();
    }
  }
});

test("defi defaults to 7 days when the parameter is absent", async () => {
  const stub = stubExplorer({ "/api/stats/tvl": EXPLORER_TVL });
  try {
    const res = await defi({ request: new Request("https://example.invalid/api/v1/defi") });
    const body = (await res.json()) as { days: number };
    assert.equal(res.status, 200);
    assert.equal(body.days, 7);
  } finally {
    stub.restore();
  }
});

test("defi rejects an unsupported window instead of silently using 7", async () => {
  const stub = stubExplorer({ "/api/stats/tvl": EXPLORER_TVL });
  try {
    for (const bad of ["2", "0", "-7", "abc", "7.5"]) {
      const res = await defi({
        request: new Request(`https://example.invalid/api/v1/defi?days=${bad}`),
      });
      assert.equal(res.status, 400, bad);
      const body = (await res.json()) as { error: string };
      assert.match(body.error, /Allowed values: 1, 7, 30/);
    }
    assert.equal(stub.seen.length, 0, "no upstream call is made for invalid input");
  } finally {
    stub.restore();
  }
});

test("portfolio rejects a malformed address", async () => {
  for (const bad of ["not-an-address", "0x123", "", "0xZZ45F33e4b34775E0547193433de8B8F3CEd8Fc8"]) {
    const res = await portfolio({ params: { address: bad } });
    assert.equal(res.status, 400, bad);
  }
});

test("portfolio returns raw balances alongside the scaled ones", async () => {
  const raw = "12233098428819365938";
  const stub = stubExplorer({
    "/token-balances": { items: [] },
    "/api/price/current": { quai: { usd: 0.01 }, qi: { usd: 0.7 } },
    "/api/address/": {
      info: {
        balance_quai: raw,
        balance_qi: "0",
        locked_balance_quai: "0",
        locked_balance_qi: "0",
        tx_count: "112",
        last_balance_block: "9679816",
      },
    },
  });
  try {
    const res = await portfolio({
      params: { address: "0x0045F33e4b34775E0547193433de8B8F3CEd8Fc8" },
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      balances: { quai: number };
      balancesRaw: { quai: string };
    };
    // The exact integer is preserved for consumers that need it.
    assert.equal(body.balancesRaw.quai, raw);
    assert.equal(body.balances.quai, 12.233098428819366);
  } finally {
    stub.restore();
  }
});
