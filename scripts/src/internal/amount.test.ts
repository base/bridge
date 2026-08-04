import { expect, test } from "bun:test";
import {
  nonNegativeAmountSchema,
  parseTokenAmount,
  positiveAmountSchema,
} from "./amount";

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

test("parseTokenAmount rounds over-precision half-up (parseUnits, not floor)", () => {
  // more fractional digits than the token supports: parseUnits rounds half-up,
  // unlike the previous Math.floor which truncated
  expect(parseTokenAmount("1.0000000006", 9)).toBe(1_000_000_001n);
  expect(parseTokenAmount("1.0000000004", 9)).toBe(1_000_000_000n);
});

test("positiveAmountSchema rejects inputs parseUnits would throw on", () => {
  // these all pass a lenient parseFloat check but are rejected by parseUnits;
  // validating with the same grammar surfaces a clear CLI error instead
  for (const bad of ["1e-3", "1abc", "+1", "1_000", "Infinity", " 1.5 ", "", "0", "-1"]) {
    expect(positiveAmountSchema.safeParse(bad).success).toBe(false);
  }
});

test("positiveAmountSchema accepts plain positive decimal strings", () => {
  for (const good of ["1", "1.5", "100", "0.001", "0.000000001"]) {
    expect(positiveAmountSchema.safeParse(good).success).toBe(true);
  }
});

test("nonNegativeAmountSchema accepts 0, defaults to \"0\", rejects negatives", () => {
  expect(nonNegativeAmountSchema.safeParse("0").success).toBe(true);
  expect(nonNegativeAmountSchema.parse(undefined)).toBe("0");
  expect(nonNegativeAmountSchema.safeParse("-1").success).toBe(false);
  expect(nonNegativeAmountSchema.safeParse("1e18").success).toBe(false);
});
