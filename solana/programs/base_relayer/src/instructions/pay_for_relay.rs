use anchor_lang::prelude::*;

use crate::{
    constants::CFG_SEED,
    internal::check_and_pay_for_gas,
    state::{Cfg, MessageToRelay},
};

#[derive(Accounts)]
pub struct PayForRelay<'info> {
    /// The account that pays for transaction fees and account creation.
    /// Must be mutable to deduct lamports for account rent and gas fees.
    #[account(mut)]
    pub payer: Signer<'info>,

    /// The relayer config state account that tracks fee parameters.
    /// - Uses PDA with CFG_SEED for deterministic address
    /// - Mutable to update EIP1559 fee data
    #[account(mut, seeds = [CFG_SEED], bump)]
    pub cfg: Account<'info, Cfg>,

    /// The account that receives payment for the gas costs of bridging SOL to Base.
    /// CHECK: This account is validated to be the same as cfg.gas_config.gas_fee_receiver
    #[account(mut, address = cfg.gas_config.gas_fee_receiver @ PayForRelayError::IncorrectGasFeeReceiver)]
    pub gas_fee_receiver: AccountInfo<'info>,

    #[account(init, payer = payer, space = 8 + MessageToRelay::INIT_SPACE)]
    pub message_to_relay: Account<'info, MessageToRelay>,

    /// System program required for creating new accounts.
    /// Used internally by Anchor for account initialization.
    pub system_program: Program<'info, System>,
}

pub fn pay_for_relay_handler(
    ctx: Context<PayForRelay>,
    outgoing_message: Pubkey,
    gas_limit: u64,
) -> Result<()> {
    check_and_pay_for_gas(
        &ctx.accounts.system_program,
        &ctx.accounts.payer,
        &ctx.accounts.gas_fee_receiver,
        &mut ctx.accounts.cfg,
        gas_limit,
    )?;
    ctx.accounts.message_to_relay.outgoing_message = outgoing_message;
    ctx.accounts.message_to_relay.gas_limit = gas_limit;
    Ok(())
}

#[error_code]
pub enum PayForRelayError {
    #[msg("Incorrect gas fee receiver")]
    IncorrectGasFeeReceiver,
}
