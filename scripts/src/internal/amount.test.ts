import { expect, test } from "bun:test";
import { parseTokenAmount } from "./amount";

// Documents the precision loss in the previous inline scaling approach that
// this util replaces: BigInt(Math.floor(parseFloat(value) * 10 ** decimals)).
function legacyInlineScale(value: string, decimals: number): bigint {
  return BigInt(Math.floor(parseFloat(value) * 10 ** decimals));
}

test("legacy inline float scaling loses precision (the bug being fixed)", () => {
  // 1.005 SOL (9 decimals): intended 1_005_000_000 lamports
  expect(legacyInlineScale("1.005", 9)).toBe(1_004_999_999n); // off by 1
  // 1.000001 USDC (6 decimals): intended 1_000_001
  expect(legacyInlineScale("1.000001", 6)).toBe(1_000_000n); // unit dropped
});

test("parseTokenAmount scales decimal strings exactly", () => {
  expect(parseTokenAmount("1.005", 9)).toBe(1_005_000_000n);
  expect(parseTokenAmount("1.000001", 6)).toBe(1_000_001n);
  // 18-decimal (wei) amounts exceed Number.MAX_SAFE_INTEGER; still exact
  expect(parseTokenAmount("1.005", 18)).toBe(1_005_000_000_000_000_000n);
});

test("parseTokenAmount matches legacy output for inputs that had no float error", () => {
  expect(parseTokenAmount("0.1", 9)).toBe(legacyInlineScale("0.1", 9));
  expect(parseTokenAmount("2", 9)).toBe(legacyInlineScale("2", 9));
});
