/**
 * test/explorer-txlist.test.ts — an upstream failure must not look like an
 * address with no history.
 *
 * The Etherscan-compatible envelope uses status "0" both for "no transactions
 * found" and for real errors. Collapsing both into an empty array made the
 * portfolio claim "No transactions found for this address" during a rate limit
 * or outage, which is a wrong answer stated with confidence.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { getExplorerAddressTxList, ExplorerApiError } from "../src/lib/explorer";

const ADDRESS = "0x0045F33e4b34775E0547193433de8B8F3CEd8Fc8";

function stubFetch(payload: unknown, status = 200) {
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { "Content-Type": "application/json" },
    })) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

test("returns rows on success", async () => {
  const restore = stubFetch({
    status: "1",
    message: "OK",
    result: [{ hash: "0xabc", blockNumber: "1", timeStamp: "1", value: "0" }],
  });
  try {
    const rows = await getExplorerAddressTxList(ADDRESS, 15, 1, { retries: 0 });
    assert.equal(rows.length, 1);
  } finally {
    restore();
  }
});

test("an empty history is reported as empty", async () => {
  const restore = stubFetch({ status: "0", message: "No transactions found", result: [] });
  try {
    const rows = await getExplorerAddressTxList(ADDRESS, 15, 1, { retries: 0 });
    assert.deepEqual(rows, []);
  } finally {
    restore();
  }
});

test("an empty history sent as a string result is reported as empty", async () => {
  const restore = stubFetch({
    status: "0",
    message: "No transactions found",
    result: "No transactions found",
  });
  try {
    const rows = await getExplorerAddressTxList(ADDRESS, 15, 1, { retries: 0 });
    assert.deepEqual(rows, []);
  } finally {
    restore();
  }
});

test("a rate limit throws instead of pretending the address is empty", async () => {
  const restore = stubFetch({
    status: "0",
    message: "NOTOK",
    result: "Max rate limit reached",
  });
  try {
    await assert.rejects(
      () => getExplorerAddressTxList(ADDRESS, 15, 1, { retries: 0 }),
      (error: unknown) => {
        assert.ok(error instanceof ExplorerApiError);
        assert.match((error as Error).message, /Max rate limit reached/);
        return true;
      },
    );
  } finally {
    restore();
  }
});

test("a malformed envelope throws", async () => {
  const restore = stubFetch({ unexpected: true });
  try {
    await assert.rejects(() => getExplorerAddressTxList(ADDRESS, 15, 1, { retries: 0 }));
  } finally {
    restore();
  }
});
