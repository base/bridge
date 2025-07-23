use anchor_lang::prelude::*;

use crate::solana_to_base::CallBuffer;

/// Accounts struct for appending data to an existing call buffer account.
/// This allows building up large call data over multiple transactions.
#[derive(Accounts)]
pub struct AppendToCallBuffer<'info> {
    /// The account paying for the transaction fees.
    /// It must be the owner of the call buffer account.
    #[account(mut)]
    pub owner: Signer<'info>,

    /// The call buffer account to append data to
    #[account(
        mut,
        has_one = owner @ AppendToCallBufferError::Unauthorized,
    )]
    pub call_buffer: Account<'info, CallBuffer>,
}

pub fn append_to_call_buffer_handler(
    ctx: Context<AppendToCallBuffer>,
    data: Vec<u8>,
) -> Result<()> {
    let call_buffer = &mut ctx.accounts.call_buffer;
    call_buffer.data.extend_from_slice(&data);

    Ok(())
}

#[error_code]
pub enum AppendToCallBufferError {
    #[msg("Only the owner can append to this call buffer")]
    Unauthorized,
}
