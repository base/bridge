use anchor_lang::prelude::*;

use crate::base_to_solana::TRUSTED_ORACLE;

#[constant]
pub const NATIVE_SOL_PUBKEY: Pubkey = pubkey!("SoL1111111111111111111111111111111111111111");
#[constant]
pub const GAS_COST_SCALER_DP: u64 = 10u64.pow(6);
#[constant]
pub const GAS_COST_SCALER: u64 = 1_000_000;

#[constant]
pub const REMOTE_TOKEN_METADATA_KEY: &str = "remote_token";
#[constant]
pub const SCALER_EXPONENT_METADATA_KEY: &str = "scaler_exponent";

#[constant]
pub const GAS_FEE_RECEIVER: Pubkey = TRUSTED_ORACLE;

#[constant]
pub const MAX_CALL_BUFFER_SIZE: usize = 8 * 1024; // 8kb max size for call buffer data
