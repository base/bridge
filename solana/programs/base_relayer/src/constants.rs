use anchor_lang::prelude::*;

#[constant]
pub const SCALE: u128 = 1_000_000;

#[constant]
pub const CFG_SEED: &[u8] = b"config";

#[constant]
pub const MSG_SEED: &[u8] = b"message";
