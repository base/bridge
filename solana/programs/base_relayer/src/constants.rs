use anchor_lang::prelude::*;

pub const DISCRIMINATOR_LEN: usize = 8;

#[constant]
pub const SCALE: u128 = 1_000_000;

#[constant]
pub const CFG_SEED: &[u8] = b"config";
