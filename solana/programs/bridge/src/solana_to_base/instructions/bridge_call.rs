use anchor_lang::prelude::*;

use crate::{
    common::{bridge::Bridge, BRIDGE_SEED},
    solana_to_base::{check_and_pay_for_gas, check_call, Call, OutgoingMessage, GAS_FEE_RECEIVER},
};

/// Accounts struct for the bridge_call instruction that enables arbitrary function calls
/// from Solana to Base. This instruction creates an outgoing message containing
/// the call data and handles gas fee payment for cross-chain execution.
#[derive(Accounts)]
#[instruction(_gas_limit: u64, call: Call)]
pub struct BridgeCall<'info> {
    /// The account that pays for the transaction fees and outgoing message account creation.
    /// Must be mutable to deduct lamports for account rent and gas fees.
    #[account(mut)]
    pub payer: Signer<'info>,

    /// The account initiating the bridge call on Solana.
    /// This account's public key will be used as the sender in the cross-chain message.
    pub from: Signer<'info>,

    /// The designated receiver of gas fees for cross-chain message relay.
    /// - Must match the hardcoded GAS_FEE_RECEIVER address
    /// - Receives lamports calculated based on gas_limit and current gas pricing
    /// - Mutable to receive the gas fee payment
    ///
    /// CHECK: This is the hardcoded gas fee receiver account.
    #[account(mut, address = GAS_FEE_RECEIVER @ BridgeCallError::IncorrectGasFeeReceiver)]
    pub gas_fee_receiver: AccountInfo<'info>,

    /// The main bridge state account containing global bridge configuration.
    /// - Uses PDA with BRIDGE_SEED for deterministic address
    /// - Mutable to increment the nonce and update EIP-1559 gas pricing
    /// - Provides the current nonce for message ordering
    #[account(mut, seeds = [BRIDGE_SEED], bump)]
    pub bridge: Account<'info, Bridge>,

    /// The outgoing message account that stores the cross-chain call data.
    /// - Created fresh for each bridge call with unique address
    /// - Payer funds the account creation
    /// - Space calculated dynamically based on call data length (8-byte discriminator + message data)
    /// - Contains all information needed for Base blockchain execution
    #[account(
        init,
        payer = payer,
        space = 8 + OutgoingMessage::space(Some(call.data.len())),
    )]
    pub outgoing_message: Account<'info, OutgoingMessage>,

    /// System program required for creating the outgoing message account.
    /// Used internally by Anchor for account initialization.
    pub system_program: Program<'info, System>,
}

pub fn bridge_call_handler(ctx: Context<BridgeCall>, gas_limit: u64, call: Call) -> Result<()> {
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
