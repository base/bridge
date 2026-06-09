import { parseUnits } from "viem";

/**
 * Scales a human-entered decimal amount string to its smallest-unit bigint
 * representation without going through a floating-point intermediary.
 *
 * The previous inline approach `BigInt(Math.floor(parseFloat(value) * 10 ** decimals))`
 * loses precision because `parseFloat(value) * 10 ** decimals` is evaluated in
 * IEEE-754 double precision. For example `1.005 * 1e9` evaluates to
 * `1004999999.9999999`, so `Math.floor` yields `1_004_999_999` instead of the
 * intended `1_005_000_000`. For 18-decimal (wei) amounts the magnitude exceeds
 * `Number.MAX_SAFE_INTEGER`, losing arbitrary trailing precision.
 *
 * `viem`'s `parseUnits` parses the decimal string directly, so the result is
 * always exact for any valid input.
 */
export function parseTokenAmount(value: string, decimals: number): bigint {
  return parseUnits(value, decimals);
}
