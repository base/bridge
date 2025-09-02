#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;

mod constants;
mod instructions;
mod internal;
mod state;

use instructions::*;
use state::*;

declare_id!("4sW86ZszkmjoNLUrmWdNbsjC1DQhwBWX2a45nzjhCZpZ");

#[program]
pub mod base_relayer {

    use super::*;

    pub fn initialize(ctx: Context<Initialize>, cfg: Cfg) -> Result<()> {
        initialize_handler(ctx, cfg)
    }

    pub fn set_config(ctx: Context<SetConfig>, cfg: Cfg) -> Result<()> {
        set_config_handler(ctx, cfg)
    }

    pub fn pay_for_relay(
        ctx: Context<PayForRelay>,
        outgoing_message: Pubkey,
        gas_limit: u64,
    ) -> Result<()> {
        pay_for_relay_handler(ctx, outgoing_message, gas_limit)
    }
}
