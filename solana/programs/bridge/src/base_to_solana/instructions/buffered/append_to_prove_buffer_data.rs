use anchor_lang::prelude::*;

use crate::base_to_solana::ProveBuffer;

/// Append chunk of serialized `Message` data to the `ProveBuffer`.
#[derive(Accounts)]
pub struct AppendToProveBufferData<'info> {
    /// Owner authorized to modify the buffer
    pub owner: Signer<'info>,

    /// Prove buffer account to append data to
    #[account(
        mut,
        has_one = owner @ AppendToProveBufferError::Unauthorized,
    )]
    pub prove_buffer: Account<'info, ProveBuffer>,
}

pub fn append_to_prove_buffer_data_handler(
    ctx: Context<AppendToProveBufferData>,
    chunk: Vec<u8>,
) -> Result<()> {
    let buf = &mut ctx.accounts.prove_buffer;
    buf.data.extend_from_slice(&chunk);
    Ok(())
}

#[error_code]
pub enum AppendToProveBufferError {
    #[msg("Only the owner can modify this prove buffer")]
    Unauthorized,
}
