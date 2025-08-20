use anchor_lang::prelude::*;

#[constant]
pub const INCOMING_MESSAGE_SEED: &[u8] = b"incoming_message";
#[constant]
pub const OUTPUT_ROOT_SEED: &[u8] = b"output_root";
#[constant]
pub const BRIDGE_CPI_AUTHORITY_SEED: &[u8] = b"bridge_cpi_authority";
#[constant]
pub const PARTNER_SIGNERS_ACCOUNT_SEED: &[u8] = b"signers";
#[constant]
pub const PARTNER_PROGRAM_ID: Pubkey = pubkey!("offqSMQWgQud6WJz694LRzkeN5kMYpCHTpXQr3Rkcjm"); // TODO: placeholder
