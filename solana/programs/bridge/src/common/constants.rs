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
pub const MAX_PARTNER_VALIDATOR_THRESHOLD: u8 = 5;
#[constant]
pub const MAX_SIGNER_COUNT: usize = 16;
