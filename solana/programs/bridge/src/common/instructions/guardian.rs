use anchor_lang::prelude::*;

use crate::common::SetBridgeConfig;

/// Transfer guardian authority to a new pubkey.
/// Only the current guardian can call this function.
///
/// Note: No additional validation is performed on `new_guardian` (it may be any pubkey).
pub fn transfer_guardian_handler(
    ctx: Context<SetBridgeConfig>,
    new_guardian: Pubkey,
) -> Result<()> {
    ctx.accounts.bridge.guardian = new_guardian;

    Ok(())
}

/// Error codes for guardian operations.
/// Used by the `has_one = guardian` constraint on `TransferGuardian`.
#[error_code]
pub enum GuardianError {
    #[msg("Unauthorized to transfer guardian authority")]
    UnauthorizedGuardianTransfer = 7000,
}
