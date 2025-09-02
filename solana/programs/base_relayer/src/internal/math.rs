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
