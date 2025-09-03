use crate::constants::SCALE;

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

    #[test]
    fn fixed_pow_exp_zero_returns_scale() {
        let base = 1_500_000u128; // 1.5
        let result = fixed_pow(base, 0);
        assert_eq!(result, SCALE);
    }

    #[test]
    fn fixed_pow_base_one_is_identity() {
        let base = SCALE; // 1.0
        let result = fixed_pow(base, 7);
        assert_eq!(result, SCALE);
    }

    #[test]
    fn fixed_pow_two_pow_one() {
        let base = 2 * SCALE; // 2.0
        let result = fixed_pow(base, 1);
        assert_eq!(result, 2 * SCALE);
    }

    #[test]
    fn fixed_pow_two_pow_two() {
        let base = 2 * SCALE; // 2.0
        let result = fixed_pow(base, 2);
        assert_eq!(result, 4 * SCALE);
    }

    #[test]
    fn fixed_pow_two_pow_ten() {
        let base = 2 * SCALE; // 2.0
        let result = fixed_pow(base, 10);
        assert_eq!(result, 1_024 * SCALE);
    }

    #[test]
    fn fixed_pow_half_squared() {
        let base = SCALE / 2; // 0.5
        let result = fixed_pow(base, 2);
        assert_eq!(result, 250_000);
    }

    #[test]
    fn fixed_pow_three_cubed() {
        let base = 3 * SCALE; // 3.0
        let result = fixed_pow(base, 3);
        assert_eq!(result, 27 * SCALE);
    }

    #[test]
    fn fixed_pow_one_point_five_cubed() {
        let base = 1_500_000u128; // 1.5
        let result = fixed_pow(base, 3);
        assert_eq!(result, 3_375_000);
    }

    #[test]
    fn fixed_pow_zero_base_positive_exp() {
        let base = 0u128; // 0.0
        let result = fixed_pow(base, 3);
        assert_eq!(result, 0);
    }

    #[test]
    fn fixed_pow_truncates_toward_zero() {
        // (1/3)^2 ~= 0.111111..., so expect truncation to 0.111110 when scaled to 1e6
        let base = SCALE / 3; // 0.333333 (truncated)
        let result = fixed_pow(base, 2);
        assert_eq!(result, 111_110);
    }
}
