use anchor_lang::prelude::*;

#[constant]
pub const NATIVE_SOL_PUBKEY: Pubkey = pubkey!("SoL1111111111111111111111111111111111111111");

#[constant]
pub const REMOTE_TOKEN_METADATA_KEY: &str = "remote_token";
#[constant]
pub const SCALER_EXPONENT_METADATA_KEY: &str = "scaler_exponent";

#[constant]
// TODO: Confirm this amount
pub const GAS_PER_CALL: u64 = 100_000;
