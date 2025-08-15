use anchor_lang::prelude::*;

use crate::common::{
    bridge::Bridge, state::oracle_signers::OracleSigners, BRIDGE_SEED, ORACLE_SIGNERS_SEED,
};

/// Accounts for initializing or updating the oracle signers list and threshold.
/// Guardian-gated.
#[derive(Accounts)]
#[instruction(threshold: u8, signers: Vec<[u8;20]>)]
pub struct SetOracleSigners<'info> {
    /// Canonical bridge state; guardian checked here
    #[account(
        mut,
        has_one = guardian,
        seeds = [BRIDGE_SEED],
        bump,
    )]
    pub bridge: Account<'info, Bridge>,

    /// Guardian must authorize updates
    pub guardian: Signer<'info>,

    /// PDA storing signers and threshold
    #[account(
        mut,
        seeds = [ORACLE_SIGNERS_SEED],
        bump,
    )]
    pub oracle_signers: Account<'info, OracleSigners>,

    pub system_program: Program<'info, System>,
}

pub fn set_oracle_signers_handler(
    ctx: Context<SetOracleSigners>,
    threshold: u8,
    signers: Vec<[u8; 20]>,
) -> Result<()> {
    require!(
        threshold as usize <= signers.len(),
        OracleSignersError::InvalidThreshold
    );
    require!(signers.len() <= 32, OracleSignersError::TooManySigners);

    // Ensure uniqueness
    {
        let mut sorted = signers.clone();
        sorted.sort();
        sorted.dedup();
        require!(
            sorted.len() == signers.len(),
            OracleSignersError::DuplicateSigner
        );
    }

    ctx.accounts.oracle_signers.threshold = threshold;
    ctx.accounts.oracle_signers.signers = signers;
    Ok(())
}

#[error_code]
pub enum OracleSignersError {
    #[msg("Threshold must be <= number of signers")]
    InvalidThreshold,
    #[msg("Too many signers (max 32)")]
    TooManySigners,
    #[msg("Duplicate signer found")]
    DuplicateSigner,
}
