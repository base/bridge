use anchor_lang::prelude::*;

use crate::common::{bridge::Bridge, BRIDGE_SEED};

/// Accounts struct for transferring guardian authority
///
/// Requirements enforced by constraints:
/// - `bridge` is the canonical bridge account (PDA derived from `BRIDGE_SEED`).
/// - `guardian` must be a signer and must equal `bridge.guardian`.
///   If not, the instruction fails with `GuardianError::UnauthorizedGuardianTransfer`.
#[derive(Accounts)]
pub struct TransferGuardian<'info> {
    /// The main bridge state account that stores protocol configuration,
    /// including the guardian pubkey.
    /// - Must be mutable to update the `guardian` field.
    /// - PDA derived from `BRIDGE_SEED` (canonical bridge account).
    /// - `has_one = guardian` enforces the provided `guardian` matches
    ///   `bridge.guardian`; otherwise the instruction fails with
    ///   `GuardianError::UnauthorizedGuardianTransfer`.
    #[account(
        mut,
        has_one = guardian @ GuardianError::UnauthorizedGuardianTransfer,
        seeds = [BRIDGE_SEED],
        bump
    )]
    pub bridge: Account<'info, Bridge>,

    /// The current guardian signer authorized to transfer guardian authority.
    /// - Must sign the transaction.
    /// - Must equal `bridge.guardian` (enforced by the `has_one` constraint on `bridge`).
    pub guardian: Signer<'info>,
}

/// Transfer guardian authority to a new pubkey.
/// Only the current guardian can call this function.
///
/// Emits [`GuardianTransferred`].
///
/// Note: No additional validation is performed on `new_guardian` (it may be any pubkey).
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

/// Event emitted when guardian authority is transferred.
/// Emitted by [`transfer_guardian_handler`].
#[event]
pub struct GuardianTransferred {
    pub old_guardian: Pubkey,
    pub new_guardian: Pubkey,
}

/// Error codes for guardian operations.
/// Used by the `has_one = guardian` constraint on `TransferGuardian`.
#[error_code]
pub enum GuardianError {
    #[msg("Unauthorized to transfer guardian authority")]
    UnauthorizedGuardianTransfer = 7000,
}
