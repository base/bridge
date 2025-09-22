use anchor_lang::prelude::*;

use crate::common::{bridge::Bridge, BRIDGE_SEED};

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

/// Accounts struct for bridge configuration setter instructions
/// Only the guardian can update these parameters
#[derive(Accounts)]
pub struct SetBridgeConfig<'info> {
    /// The bridge account containing configuration
    #[account(
        mut,
        has_one = guardian @ ConfigError::UnauthorizedConfigUpdate,
        seeds = [BRIDGE_SEED],
        bump
    )]
    pub bridge: Account<'info, Bridge>,

    /// The guardian account authorized to update configuration
    pub guardian: Signer<'info>,
}

/// Error codes for configuration updates
#[error_code]
pub enum ConfigError {
    #[msg("Unauthorized to update configuration")]
    UnauthorizedConfigUpdate = 6000,
    #[msg("Bridge is currently paused")]
    BridgePaused = 6001,
}
