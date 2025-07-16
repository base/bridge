use anchor_lang::prelude::*;

use crate::{
    common::{bridge::{Bridge, BridgeError}, BRIDGE_SEED},
    solana_to_base::{check_and_pay_for_gas, check_call, Call, OutgoingMessage, GAS_FEE_RECEIVER},
};

#[derive(Accounts)]
#[instruction(_gas_limit: u64, call: Call)]
pub struct BridgeCall<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    pub from: Signer<'info>,

    /// CHECK: This is the hardcoded gas fee receiver account.
    #[account(mut, address = GAS_FEE_RECEIVER @ BridgeCallError::IncorrectGasFeeReceiver)]
    pub gas_fee_receiver: AccountInfo<'info>,

    #[account(mut, seeds = [BRIDGE_SEED], bump)]
    pub bridge: Account<'info, Bridge>,

    #[account(
        init,
        payer = payer,
        space = 8 + OutgoingMessage::space(Some(call.data.len())),
    )]
    pub outgoing_message: Account<'info, OutgoingMessage>,

    pub system_program: Program<'info, System>,
}

pub fn bridge_call_handler(ctx: Context<BridgeCall>, gas_limit: u64, call: Call) -> Result<()> {
    // Check if bridge is paused
    require!(!ctx.accounts.bridge.is_paused(), BridgeError::BridgePaused);
    
    check_call(&call)?;

    let message = OutgoingMessage::new_call(
        ctx.accounts.bridge.nonce,
        ctx.accounts.from.key(),
        gas_limit,
        call,
    );

    check_and_pay_for_gas(
        &ctx.accounts.system_program,
        &ctx.accounts.payer,
        &ctx.accounts.gas_fee_receiver,
        &mut ctx.accounts.bridge.eip1559,
        gas_limit,
        message.relay_messages_tx_size(),
    )?;

    *ctx.accounts.outgoing_message = message;
    ctx.accounts.bridge.nonce += 1;

    Ok(())
}

#[error_code]
pub enum BridgeCallError {
    #[msg("Incorrect gas fee receiver")]
    IncorrectGasFeeReceiver,
}
