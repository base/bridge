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

pub fn set_config_handler(ctx: Context<SetConfig>, cfg: Cfg) -> Result<()> {
    ctx.accounts.cfg.guardian = cfg.guardian;
    ctx.accounts.cfg.eip1559 = cfg.eip1559;
    ctx.accounts.cfg.gas_config = cfg.gas_config;
    Ok(())
}

/// Error codes for configuration updates
#[error_code]
pub enum ConfigError {
    #[msg("Unauthorized to update configuration")]
    UnauthorizedConfigUpdate = 6000,
}
