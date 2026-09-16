use anchor_lang::prelude::*;

pub const DISCRIMINATOR_LEN: usize = 8;

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
pub const MAX_SIGNER_COUNT: u8 = 16;
/// Upper bound on a wrapped token's off-chain metadata uri. Matches the limit Metaplex applies to
/// its own uri field. The uri is written once when the token is wrapped and can never be changed,
/// so it is bounded to keep the mint small enough that unpacking its metadata during later bridge
/// operations stays well within the compute budget.
#[constant]
pub const MAX_URI_LEN: u8 = 200;
