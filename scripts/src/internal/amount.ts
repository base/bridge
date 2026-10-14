import { parseUnits } from "viem";
import { z } from "zod";

// viem's `parseUnits` accepts a plain decimal string only: digits with at most one
// decimal point, and no sign, exponent, digit separators, or surrounding whitespace.
// Validate the CLI input with the same grammar so a malformed amount fails with a
// clear message here instead of throwing `InvalidDecimalNumberError` deep inside the
// handler once it reaches `parseTokenAmount` (e.g. "1e-3", "1_000", "+1", " 1.5 ").
const DECIMAL_STRING_RE = /^\d+(\.\d+)?$/;

/** A required, strictly positive token amount string (for example "1.5"). */
export const positiveAmountSchema = z.string().refine(
  (value) => DECIMAL_STRING_RE.test(value) && Number(value) > 0,
  { message: 'Amount must be a positive decimal number (for example "1.5")' },
);

/** A non-negative value string (for example an ETH `value`), defaulting to "0". */
export const nonNegativeAmountSchema = z
  .string()
  .refine((value) => DECIMAL_STRING_RE.test(value) && Number(value) >= 0, {
    message: 'Value must be a non-negative decimal number (for example "1.5")',
  })
  .default("0");

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
 * always exact for any input within the token's precision. Inputs with more
 * fractional digits than `decimals` are rounded half-up (unlike the previous
 * `Math.floor`, which truncated).
 */
export function parseTokenAmount(value: string, decimals: number): bigint {
  return parseUnits(value, decimals);
}
