use anchor_lang::prelude::*;

use crate::{constants::CFG_SEED, state::Cfg};

/// Accounts struct for configuration setter instructions
/// Only the guardian can update these parameters
#[derive(Accounts)]
pub struct SetConfig<'info> {
    /// The bridge account containing configuration
    #[account(
        mut,
        has_one = guardian @ ConfigError::UnauthorizedConfigUpdate,
        seeds = [CFG_SEED],
        bump
    )]
    pub cfg: Account<'info, Cfg>,

    /// The guardian account authorized to update configuration
    pub guardian: Signer<'info>,
}

/// Error codes for configuration updates
#[error_code]
pub enum ConfigError {
    #[msg("Unauthorized to update configuration")]
    UnauthorizedConfigUpdate = 6000,
}

pub mod set_eip1559_config;
pub mod set_gas_config;
pub mod set_guardian;

pub use set_eip1559_config::*;
pub use set_gas_config::*;
pub use set_guardian::*;
