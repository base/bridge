use anchor_lang::prelude::*;

use crate::base_to_solana::ProveBuffer;

/// Append chunk of MMR proof nodes to the `ProveBuffer`.
#[derive(Accounts)]
pub struct AppendToProveBufferProof<'info> {
    /// Owner authorized to modify the buffer
    pub owner: Signer<'info>,

    /// Prove buffer account to append proof nodes to
    #[account(
        mut,
        has_one = owner @ AppendToProveBufferProofError::Unauthorized,
    )]
    pub prove_buffer: Account<'info, ProveBuffer>,
}

pub fn append_to_prove_buffer_proof_handler(
    ctx: Context<AppendToProveBufferProof>,
    proof_chunk: Vec<[u8; 32]>,
) -> Result<()> {
    let buf = &mut ctx.accounts.prove_buffer;
    buf.proof.extend_from_slice(&proof_chunk);
    Ok(())
}

#[error_code]
pub enum AppendToProveBufferProofError {
    #[msg("Only the owner can modify this prove buffer")]
    Unauthorized,
}
