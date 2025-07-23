use anchor_lang::prelude::*;

use crate::solana_to_base::CallBuffer;

/// Accounts struct for closing a call buffer account.
#[derive(Accounts)]
pub struct CloseCallBuffer<'info> {
    /// The account paying for the transaction fees and receiving the rent back.
    /// It must be the owner of the call buffer account.
    pub owner: Signer<'info>,

    /// The call buffer account to close
    #[account(
        mut,
        close = owner,
        has_one = owner @ CloseCallBufferError::Unauthorized,
    )]
    pub call_buffer: Account<'info, CallBuffer>,
}

pub fn close_call_buffer_handler(_ctx: Context<CloseCallBuffer>) -> Result<()> {
    // The account will be closed automatically by Anchor due to the close = rent_receiver constraint
    Ok(())
}

#[error_code]
pub enum CloseCallBufferError {
    #[msg("Only the owner can close this call buffer")]
    Unauthorized,
}
