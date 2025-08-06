use anchor_lang::prelude::*;

#[constant]
pub const BRIDGE_SEED: &[u8] = b"bridge";
#[constant]
pub const SOL_VAULT_SEED: &[u8] = b"sol_vault";
#[constant]
pub const TOKEN_VAULT_SEED: &[u8] = b"token_vault";
#[constant]
pub const WRAPPED_TOKEN_SEED: &[u8] = b"wrapped_token";

#[constant]
pub const EIP1559_MINIMUM_BASE_FEE: u64 = 1;
#[constant]
pub const EIP1559_DEFAULT_WINDOW_DURATION_SECONDS: u64 = 1;
#[constant]
pub const EIP1559_DEFAULT_GAS_TARGET_PER_WINDOW: u64 = 5_000_000;
#[constant]
pub const EIP1559_DEFAULT_ADJUSTMENT_DENOMINATOR: u64 = 2;
