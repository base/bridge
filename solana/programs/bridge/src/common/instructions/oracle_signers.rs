use anchor_lang::prelude::*;

use crate::common::{
    bridge::Bridge, state::oracle_signers::OracleSigners, BaseOracleConfig, BRIDGE_SEED,
    ORACLE_SIGNERS_SEED,
};

/// Accounts for initializing or updating the oracle signers list and threshold.
#[derive(Accounts)]
#[instruction(threshold: u8, signers: Vec<[u8;20]>)]
pub struct SetOracleSigners<'info> {
    /// Canonical bridge state used to authorize the change.
    ///
    /// Constraints:
    /// - `has_one = guardian` ensures only the current guardian can update.
    /// - PDA derived from `BRIDGE_SEED`.
    #[account(
        mut,
        has_one = guardian,
        seeds = [BRIDGE_SEED],
        bump,
    )]
    pub bridge: Account<'info, Bridge>,

    /// Guardian who must authorize the update.
    pub guardian: Signer<'info>,

    /// PDA storing the oracle signer set and required threshold.
    ///
    /// Constraints:
    /// - PDA derived from `ORACLE_SIGNERS_SEED`.
    /// - Marked `mut` because the instruction updates its fields.
    #[account(
        mut,
        seeds = [ORACLE_SIGNERS_SEED],
        bump,
    )]
    pub oracle_signers: Account<'info, OracleSigners>,

    /// System program (required by Anchor account machinery; no direct writes).
    pub system_program: Program<'info, System>,
}

/// Set or update the oracle signer configuration.
///
/// Updates the `oracle_signers` account with a new approval `threshold` and a
/// new list of unique EVM signer addresses. This instruction is used to rotate
/// oracle keys or adjust the required threshold for output root attestations.
pub fn set_oracle_signers_handler(
    ctx: Context<SetOracleSigners>,
    cfg: BaseOracleConfig,
) -> Result<()> {
    cfg.validate()?;
    ctx.accounts.oracle_signers.threshold = cfg.oracle_threshold;
    ctx.accounts.oracle_signers.signer_count = cfg.signer_count;
    ctx.accounts.oracle_signers.signers = cfg.oracle_signer_addrs;
    Ok(())
}
