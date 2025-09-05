use anchor_lang::prelude::*;

#[account]
#[derive(Debug, PartialEq, Eq, InitSpace)]
pub struct MessageToRelay {
    pub nonce: u64,
    pub outgoing_message: Pubkey,
    pub gas_limit: u64,
}
