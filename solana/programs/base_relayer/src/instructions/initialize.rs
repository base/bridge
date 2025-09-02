use anchor_lang::prelude::*;

use crate::{constants::CFG_SEED, Cfg};

#[derive(Accounts)]
pub struct Initialize<'info> {
    /// The account that pays for the transaction and bridge account creation.
    /// Must be mutable to deduct lamports for account rent.
    #[account(mut)]
    pub payer: Signer<'info>,

    /// The relayer config state account that tracks fee parameters.
    /// - Uses PDA with CFG_SEED for deterministic address
    /// - Mutable to update EIP1559 fee data
    #[account(init, payer = payer, seeds = [CFG_SEED], bump, space = 8 + Cfg::INIT_SPACE)]
    pub cfg: Account<'info, Cfg>,

    /// System program required for creating new accounts.
    /// Used internally by Anchor for account initialization.
    pub system_program: Program<'info, System>,
}

pub fn initialize_handler(ctx: Context<Initialize>, cfg: Cfg) -> Result<()> {
    ctx.accounts.cfg.guardian = cfg.guardian;
    ctx.accounts.cfg.eip1559 = cfg.eip1559;
    ctx.accounts.cfg.gas_config = cfg.gas_config;
    Ok(())
}
