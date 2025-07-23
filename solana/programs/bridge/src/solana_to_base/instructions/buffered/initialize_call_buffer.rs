use anchor_lang::prelude::*;

use crate::solana_to_base::{CallBuffer, CallType, MAX_CALL_BUFFER_SIZE};

/// Accounts struct for initializing a call buffer account that can store large call data.
/// This account can be used to build up call data over multiple transactions before bridging.
#[derive(Accounts)]
#[instruction(_ty: CallType, _to: [u8; 20], _value: u128, _initial_data: Vec<u8>, max_data_len: usize)]
pub struct InitializeCallBuffer<'info> {
    /// The account paying for the transaction fees and the call buffer account creation.
    /// It is set as the owner of the call buffer account.
    #[account(mut)]
    pub payer: Signer<'info>,

    /// The call buffer account being created.
    #[account(
        init,
        payer = payer,
        space = CallBuffer::space(max_data_len),
    )]
    pub call_buffer: Account<'info, CallBuffer>,

    /// System program for account creation.
    pub system_program: Program<'info, System>,
}

pub fn initialize_call_buffer_handler(
    ctx: Context<InitializeCallBuffer>,
    ty: CallType,
    to: [u8; 20],
    value: u128,
    initial_data: Vec<u8>,
    max_data_len: usize,
) -> Result<()> {
    // Verify that the max data length doesn't exceed the 64KB limit
    require!(
        max_data_len <= MAX_CALL_BUFFER_SIZE,
        InitializeCallBufferError::MaxSizeExceeded
    );

    *ctx.accounts.call_buffer = CallBuffer {
        owner: ctx.accounts.payer.key(),
        ty,
        to,
        value,
        data: initial_data,
    };

    Ok(())
}

#[error_code]
pub enum InitializeCallBufferError {
    #[msg("Call buffer size exceeds maximum allowed size of 64KB")]
    MaxSizeExceeded,
}
