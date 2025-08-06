use anchor_lang::prelude::*;

use crate::common::{bridge::Bridge, BRIDGE_SEED};

/// Accounts struct for transferring guardian authority
#[derive(Accounts)]
pub struct TransferGuardian<'info> {
    #[account(
        mut,
        has_one = guardian @ GuardianError::UnauthorizedGuardianTransfer,
        seeds = [BRIDGE_SEED],
        bump
    )]
    pub bridge: Account<'info, Bridge>,
    pub guardian: Signer<'info>,
}

/// Transfer guardian authority to a new pubkey
/// Only the current guardian can call this function
pub fn transfer_guardian_handler(
    ctx: Context<TransferGuardian>,
    new_guardian: Pubkey,
) -> Result<()> {
    let old_guardian = ctx.accounts.bridge.guardian;
    ctx.accounts.bridge.guardian = new_guardian;

    emit!(GuardianTransferred {
        old_guardian,
        new_guardian,
    });

    Ok(())
}

/// Event for monitoring guardian transfers
#[event]
pub struct GuardianTransferred {
    pub old_guardian: Pubkey,
    pub new_guardian: Pubkey,
}

/// Error codes for guardian operations
#[error_code]
pub enum GuardianError {
    #[msg("Unauthorized to transfer guardian authority")]
    UnauthorizedGuardianTransfer = 7000,
}
