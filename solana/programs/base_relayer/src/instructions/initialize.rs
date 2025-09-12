use anchor_lang::prelude::*;

use crate::{
    constants::{CFG_SEED, DISCRIMINATOR_LEN},
    internal::{Eip1559, Eip1559Config, GasConfig},
    Cfg,
};

#[derive(Accounts)]
pub struct Initialize<'info> {
    /// The account that pays for the transaction and bridge account creation.
    /// Must be mutable to deduct lamports for account rent.
    #[account(mut)]
    pub payer: Signer<'info>,

    /// The relayer config state account that tracks fee parameters.
    /// - Uses PDA with CFG_SEED for deterministic address
    /// - Mutable to update EIP1559 fee data
    #[account(init, payer = payer, seeds = [CFG_SEED], bump, space = DISCRIMINATOR_LEN + Cfg::INIT_SPACE)]
    pub cfg: Account<'info, Cfg>,

    /// The guardian account that will have administrative authority over the bridge.
    /// Must be a signer to prove ownership of the guardian key. The payer and guardian
    /// may be distinct signers.
    pub guardian: Signer<'info>,

    /// System program required for creating new accounts.
    /// Used internally by Anchor for account initialization.
    pub system_program: Program<'info, System>,
}

pub fn initialize_handler(
    ctx: Context<Initialize>,
    guardian: Pubkey,
    eip1559_config: Eip1559Config,
    gas_config: GasConfig,
) -> Result<()> {
    let current_timestamp = Clock::get()?.unix_timestamp;
    let minimum_base_fee = eip1559_config.minimum_base_fee;

    *ctx.accounts.cfg = Cfg {
        guardian,
        eip1559: Eip1559 {
            config: eip1559_config,
            current_base_fee: minimum_base_fee,
            current_window_gas_used: 0,
            window_start_time: current_timestamp,
        },
        gas_config,
        nonce: 0,
    };

    Ok(())
}
