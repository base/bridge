/// Fixed-point scale factor: 1e6 (six decimals)
pub const SCALE: u128 = 1_000_000;

/// Computes base^exp using fixed-point arithmetic with scale `SCALE`.
/// Inputs and result are expressed in `SCALE` units (six decimals).
/// Uses truncating division on each multiply (rounds toward zero).
/// Guaranteed not to overflow for all 0 <= base <= SCALE.
/// Panics on overflow for larger bases or exponents (uses checked_mul).
/// Time complexity: O(log exp) via exponentiation by squaring.
pub fn fixed_pow(mut base: u128, mut exp: u64) -> u128 {
    let mut result = SCALE;
    while exp > 0 {
        if exp % 2 == 1 {
            result = result.checked_mul(base).unwrap() / SCALE;
        }
        base = base.checked_mul(base).unwrap() / SCALE;
        exp >>= 1;
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Helper function to convert fixed-point to f64 for comparison
    fn fixed_to_float(fixed: u128) -> f64 {
        fixed as f64 / SCALE as f64
    }

    /// Helper function to convert f64 to fixed-point
    fn float_to_fixed(float: f64) -> u128 {
        (float * SCALE as f64) as u128
    }

    /// Helper function to check if two values are approximately equal within tolerance
    fn approx_eq(a: u128, b: u128, tolerance_percent: f64) -> bool {
        let diff = if a > b { a - b } else { b - a };
        let max_val = if a > b { a } else { b };
        if max_val == 0 {
            return diff == 0;
        }
        let percentage = (diff as f64 / max_val as f64) * 100.0;
        percentage <= tolerance_percent
    }

    #[test]
    fn test_fixed_pow_edge_cases() {
        // Test 1^n = 1 for any n
        for exp in [0, 1, 2, 5, 10, 63] {
            let result = fixed_pow(SCALE, exp);
            assert_eq!(result, SCALE, "1^{} should equal 1", exp);
        }

        // Test 0^n = 0 for n > 0
        for exp in [1, 2, 5, 10, 63] {
            let result = fixed_pow(0, exp);
            assert_eq!(result, 0, "0^{} should equal 0", exp);
        }

        // Test 0^0 = 1 (by mathematical convention)
        let result = fixed_pow(0, 0);
        assert_eq!(result, SCALE);
    }

    #[test]
    fn test_fixed_pow_powers_of_two() {
        // Test various powers of 2 to verify binary exponentiation
        let base = 2 * SCALE;
        let test_cases = (0..=50)
            .map(|exp| (exp, (1 << exp) * SCALE))
            .collect::<Vec<_>>();

        for (exp, expected) in test_cases {
            let result = fixed_pow(base, exp);
            assert_eq!(
                result, expected,
                "{}^{} should equal {}",
                base, exp, expected
            );
        }
    }

    #[test]
    fn test_fixed_pow_fractional_bases() {
        // Test with fractional bases

        // Test 0.5^2 = 0.25
        let half = SCALE / 2;
        let result = fixed_pow(half, 2);
        assert_eq!(result, SCALE / 4);

        // Test 0.5^3 = 0.125
        let result = fixed_pow(half, 3);
        assert_eq!(result, SCALE / 8);

        // Test 0.1^2 = 0.01
        let tenth = SCALE / 10;
        let result = fixed_pow(tenth, 2);
        assert_eq!(result, SCALE / 100);

        // Test 0.1^3 = 0.001
        let result = fixed_pow(tenth, 3);
        assert_eq!(result, SCALE / 1000);
    }

    #[test]
    fn test_fixed_pow_compare_with_float() {
        // Compare fixed-point results with floating-point arithmetic
        let test_cases = [
            (2.0, 0),
            (2.0, 1),
            (2.0, 2),
            (2.0, 3),
            (2.0, 4),
            (2.0, 5),
            (1.5, 2),
            (1.5, 3),
            (1.5, 4),
            (1.1, 5),
            (1.1, 10),
            (0.9, 5),
            (0.9, 10),
            (0.5, 2),
            (0.5, 3),
            (0.5, 4),
            (3.0, 3),
            (1.25, 4),
        ];

        for (base_float, exp) in test_cases {
            let base_fixed = float_to_fixed(base_float);
            let result_fixed = fixed_pow(base_fixed, exp);

            let expected_float = base_float.powi(exp as i32);
            let expected_fixed = float_to_fixed(expected_float);

            // Allow 0.5% tolerance for floating-point comparison
            assert!(
                approx_eq(result_fixed, expected_fixed, 0.5),
                "{}^{}: fixed_pow result {} differs from float result {} by more than 0.5%",
                base_float,
                exp,
                fixed_to_float(result_fixed),
                expected_float
            );
        }
    }

    #[test]
    fn test_fixed_pow_precision_small_bases() {
        // Test precision with small bases
        let test_cases = [
            (0.001, 2), // 0.001^2 = 0.000001
            (0.01, 2),  // 0.01^2 = 0.0001
            (0.1, 2),   // 0.1^2 = 0.01
            (0.5, 5),   // 0.5^5 = 0.03125
        ];

        for (base_float, exp) in test_cases {
            let base_fixed = float_to_fixed(base_float);
            let result_fixed = fixed_pow(base_fixed, exp);
            let expected_float = base_float.powi(exp as i32);
            let expected_fixed = float_to_fixed(expected_float);

            // Allow 1% tolerance for small number precision
            assert!(
                approx_eq(result_fixed, expected_fixed, 1.0),
                "{}^{}: fixed_pow result {} differs from float result {} by more than 1%",
                base_float,
                exp,
                fixed_to_float(result_fixed),
                expected_float
            );
        }
    }

    #[test]
    fn test_fixed_pow_odd_even_exponents() {
        // Test that the algorithm correctly handles odd and even exponents
        let base = 3 * SCALE; // 3.0

        // Test even exponents
        for exp in [2, 4, 6, 8] {
            let result = fixed_pow(base, exp);
            let expected = 3_u128.pow(exp as u32) * SCALE;
            assert_eq!(
                result,
                expected,
                "3^{} should equal {}",
                exp,
                expected / SCALE
            );
        }

        // Test odd exponents
        for exp in [1, 3, 5, 7] {
            let result = fixed_pow(base, exp);
            let expected = 3_u128.pow(exp as u32) * SCALE;
            assert_eq!(
                result,
                expected,
                "3^{} should equal {}",
                exp,
                expected / SCALE
            );
        }
    }

    #[test]
    #[should_panic]
    fn test_fixed_pow_overflow_protection() {
        // Test that the function panics on overflow as expected
        // Using a large base that would cause overflow
        fixed_pow(u128::MAX / 2, 2);
    }

    #[test]
    fn test_fixed_pow_max_exp_no_overflow() {
        // Test that a base of SCALE-1 (0.999999) with u64::MAX exponent doesn't overflow
        // Since base < 1.0, the result should approach 0 as exponent increases
        let base = SCALE - 1; // 0.999999 in fixed-point
        let result = fixed_pow(base, u64::MAX);

        // For such a large exponent with base < 1.0, result should be effectively 0
        // due to fixed-point precision limits
        assert_eq!(
            result, 0,
            "0.999999^(u64::MAX) should effectively be 0 in fixed-point arithmetic"
        );
    }
}
