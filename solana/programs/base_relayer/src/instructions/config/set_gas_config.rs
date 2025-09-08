use anchor_lang::prelude::*;

use crate::{instructions::SetConfig, internal::GasConfig};

pub fn set_gas_config_handler(ctx: Context<SetConfig>, gas_config: GasConfig) -> Result<()> {
    ctx.accounts.cfg.gas_config = gas_config;
    Ok(())
}
