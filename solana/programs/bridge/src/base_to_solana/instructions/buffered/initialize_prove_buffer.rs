use anchor_lang::prelude::*;

use crate::{
    base_to_solana::ProveBuffer,
    common::{bridge::Bridge, BRIDGE_SEED, DISCRIMINATOR_LEN},
};

/// Accounts for initializing a `ProveBuffer` which can hold large prove inputs.
#[derive(Accounts)]
#[instruction(_max_data_len: u64, _max_proof_len: u64)]
pub struct InitializeProveBuffer<'info> {
    /// Payer funds the buffer account creation
    #[account(mut)]
    pub payer: Signer<'info>,

    /// Bridge for pause checks (future use); also a consistent pattern like call buffers
    #[account(
        seeds = [BRIDGE_SEED],
        bump
    )]
    pub bridge: Account<'info, Bridge>,

    /// Prove buffer to be created with capacity sized by the provided max lengths
    #[account(
        init,
        payer = payer,
        space = DISCRIMINATOR_LEN + ProveBuffer::space(_max_data_len as usize, _max_proof_len as usize),
    )]
    pub prove_buffer: Account<'info, ProveBuffer>,

    pub system_program: Program<'info, System>,
}

pub fn initialize_prove_buffer_handler(
    ctx: Context<InitializeProveBuffer>,
    _max_data_len: u64,
    _max_proof_len: u64,
) -> Result<()> {
    *ctx.accounts.prove_buffer = ProveBuffer {
        owner: ctx.accounts.payer.key(),
        data: Vec::new(),
        proof: Vec::new(),
    };

    Ok(())
}
