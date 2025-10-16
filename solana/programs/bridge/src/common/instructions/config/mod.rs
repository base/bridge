use anchor_lang::prelude::*;

use crate::{
    common::{bridge::Bridge, BRIDGE_SEED},
    program::Bridge as BridgeProgram,
    BridgeError,
};

pub mod eip1559;
pub use eip1559::*;

pub mod gas;
pub use gas::*;

pub mod protocol;
pub use protocol::*;

pub mod buffer;
pub use buffer::*;

pub mod pause;
pub use pause::*;

pub mod base_oracle_signers;
pub use base_oracle_signers::*;

pub mod partner_config;
pub use partner_config::*;

/// Accounts struct for non-sensitive bridge configuration setter instructions
/// Only the guardian can update these parameters
#[derive(Accounts)]
pub struct SetBridgeConfigFromGuardian<'info> {
    /// The bridge account containing configuration
    #[account(
        mut,
        has_one = guardian @ BridgeError::UnauthorizedConfigUpdate,
        seeds = [BRIDGE_SEED],
        bump
    )]
    pub bridge: Account<'info, Bridge>,

    /// The guardian account authorized to update configuration
    pub guardian: Signer<'info>,
}

/// Accounts struct for sensitive bridge configuration setter instructions
/// Only the upgrade authority can update these parameters
#[derive(Accounts)]
pub struct SetBridgeConfigFromUpgradeAuthority<'info> {
    /// The upgrade authority account
    pub upgrade_authority: Signer<'info>,

    /// The bridge account containing configuration
    #[account(mut, seeds = [BRIDGE_SEED], bump)]
    pub bridge: Account<'info, Bridge>,

    #[account(constraint = program_data.upgrade_authority_address == Some(upgrade_authority.key()) @ BridgeError::UnauthorizedConfigUpdate)]
    pub program_data: Account<'info, ProgramData>,

    #[account(constraint = program.programdata_address()? == Some(program_data.key()) @ BridgeError::IncorrectBridgeProgram)]
    pub program: Program<'info, BridgeProgram>,
}
