/**
 * test/precision.test.ts — guards against silent rounding of on-chain amounts.
 *
 * Raw QUAI amounts are 18-decimal integers, so anything above ~9 QUAI already
 * exceeds Number.MAX_SAFE_INTEGER when expressed in wei. These tests pin the
 * behaviour of the BigInt-based helpers used by the portfolio UI and the public
 * API, including the scientific-notation form the explorer returns for large
 * aggregates.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { explorerBigInt, explorerScaled, explorerHasBalance } from "../src/lib/explorer";
import { toBigInt, scaleBigInt } from "../functions/_lib/upstream";

const CASES: Array<{ raw: string; decimals: number; expected: number; exact: string }> = [
  // A real wallet balance read live from the explorer.
  { raw: "12233098428819365938", decimals: 18, expected: 12.233098428819366, exact: "12233098428819365938" },
  // Total QUAI supply, which the explorer returns in scientific notation.
  {
    raw: "1.083204752086603088369150598e+27",
    decimals: 18,
    expected: 1083204752.0866032,
    exact: "1083204752086603088369150598",
  },
  // Qi uses 3 decimals, not 18.
  { raw: "231100691", decimals: 3, expected: 231100.691, exact: "231100691" },
  // Top rich-list holder: large enough that naive Number() division drifts.
  { raw: "173600000000000000000000000", decimals: 18, expected: 173600000, exact: "173600000000000000000000000" },
];

test("explorerBigInt parses integers and scientific notation exactly", () => {
  for (const c of CASES) {
    assert.equal(explorerBigInt(c.raw).toString(), c.exact, c.raw);
    assert.equal(toBigInt(c.raw).toString(), c.exact, `upstream: ${c.raw}`);
  }
});

test("explorerBigInt treats missing values as zero", () => {
  for (const value of [null, undefined, ""]) {
    assert.equal(explorerBigInt(value), 0n);
    assert.equal(toBigInt(value), 0n);
  }
});

test("scaling keeps the whole-unit part exact", () => {
  for (const c of CASES) {
    assert.equal(explorerScaled(c.raw, c.decimals), c.expected, c.raw);
    assert.equal(scaleBigInt(c.raw, c.decimals), c.expected, `upstream: ${c.raw}`);
    // The integer part must survive exactly, which is what plain Number()
    // division fails to guarantee.
    const expectedWhole = Number(BigInt(c.exact) / 10n ** BigInt(c.decimals));
    assert.equal(Math.floor(explorerScaled(c.raw, c.decimals)), expectedWhole, c.raw);
  }
});

test("a dust balance is still detected as non-zero", () => {
  // 1 wei: Number(1) / 1e18 is a denormal that must not be treated as empty.
  assert.equal(explorerHasBalance("1"), true);
  assert.equal(explorerHasBalance("0"), false);
  assert.equal(explorerHasBalance(""), false);
  assert.equal(explorerHasBalance(null), false);
});

test("token balances just above the safe-integer limit are not rounded", () => {
  // 2^53 + 1 in raw units: the classic double-precision failure point.
  const raw = (2n ** 53n + 1n).toString();
  assert.equal(explorerBigInt(raw).toString(), raw);
  assert.notEqual(Number(raw).toString(), raw, "confirms Number() would lose it");
});

test("scaling handles zero decimals and negative deltas", () => {
  assert.equal(explorerScaled("42", 0), 42);
  assert.equal(explorerScaled("-1500000000000000000", 18), -1.5);
  assert.equal(scaleBigInt("-1500000000000000000", 18), -1.5);
});
