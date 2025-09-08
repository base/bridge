use anchor_lang::prelude::*;

use crate::{instructions::SetConfig, internal::Eip1559Config};

pub fn set_eip1559_config_handler(
    ctx: Context<SetConfig>,
    eip1559_config: Eip1559Config,
) -> Result<()> {
    ctx.accounts.cfg.eip1559.config = eip1559_config;
    Ok(())
}
