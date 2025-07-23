use anchor_lang::prelude::*;

use crate::{
    common::{bridge::Bridge, BRIDGE_SEED},
    solana_to_base::{
        check_and_pay_for_gas, check_call, Call, CallBuffer, OutgoingMessage, GAS_FEE_RECEIVER,
    },
};

/// Common accounts struct for the bridge_call and bridge_call_buffered instructions that enables
/// arbitrary function calls from Solana to Base.
#[derive(Accounts, Clone)]
pub struct BridgeCallCommon<'info> {
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
}

/// Accounts struct for the bridge_call instruction that enables arbitrary function calls
/// from Solana to Base. This instruction creates an outgoing message containing
/// the call data and handles gas fee payment for cross-chain execution.
#[derive(Accounts)]
#[instruction(_gas_limit: u64, call: Call)]
pub struct BridgeCall<'info> {
    /// Common accounts used by the instruction.
    pub common: BridgeCallCommon<'info>,

    /// The outgoing message account that stores the cross-chain call data.
    /// - Created fresh for each bridge call with unique address
    /// - Payer funds the account creation
    /// - Space calculated dynamically based on call data length (8-byte discriminator + message data)
    /// - Contains all information needed for execution on Base
    #[account(
        init,
        payer = common.payer,
        space = 8 + OutgoingMessage::space(Some(call.data.len())),
    )]
    pub outgoing_message: Account<'info, OutgoingMessage>,

    /// System program required for creating the outgoing message account.
    /// Used internally by Anchor for account initialization.
    pub system_program: Program<'info, System>,
}

/// Accounts struct for the bridge_call_buffered instruction that enables arbitrary function calls
/// from Solana to Base. This instruction falls back to the same logic as bridge_call, but it reads
/// the call data from a call buffer account instead of the instruction data.
#[derive(Accounts)]
pub struct BridgeCallBuffered<'info> {
    /// Common accounts used by the instruction.
    pub common: BridgeCallCommon<'info>,

    /// The owner of the call buffer who will receive the rent refund.
    #[account(mut)]
    pub owner: Signer<'info>,

    /// The call buffer account that stores the call data.
    /// This account will be closed and rent returned to the owner.
    #[account(
        mut,
        close = owner,
        has_one = owner @ BridgeCallError::Unauthorized,
    )]
    pub call_buffer: Account<'info, CallBuffer>,

    /// The outgoing message account that stores the cross-chain call data.
    /// - Created fresh for each bridge call with unique address
    /// - Payer funds the account creation
    /// - Space calculated dynamically based on call data length (8-byte discriminator + message data)
    /// - Contains all information needed for execution on Base
    #[account(
        init,
        payer = common.payer,
        space = 8 + OutgoingMessage::space(Some(call_buffer.data.len())),
    )]
    pub outgoing_message: Account<'info, OutgoingMessage>,

    /// System program required for creating the outgoing message account.
    /// Used internally by Anchor for account initialization.
    pub system_program: Program<'info, System>,
}

pub fn bridge_call_handler(ctx: Context<BridgeCall>, gas_limit: u64, call: Call) -> Result<()> {
    check_call(&call)?;

    let message = OutgoingMessage::new_call(
        ctx.accounts.common.bridge.nonce,
        ctx.accounts.common.payer.key(),
        ctx.accounts.common.from.key(),
        gas_limit,
        call,
    );

    check_and_pay_for_gas(
        &ctx.accounts.system_program,
        &ctx.accounts.common.payer,
        &ctx.accounts.common.gas_fee_receiver,
        &mut ctx.accounts.common.bridge.eip1559,
        gas_limit,
        message.relay_messages_tx_size(),
    )?;

    *ctx.accounts.outgoing_message = message;
    ctx.accounts.common.bridge.nonce += 1;

    Ok(())
}

pub fn bridge_call_buffered_handler<'a, 'b, 'c, 'info>(
    ctx: Context<'a, 'b, 'c, 'info, BridgeCallBuffered<'info>>,
    gas_limit: u64,
) -> Result<()> {
    let call_buffer = &ctx.accounts.call_buffer;
    let call = Call {
        ty: call_buffer.ty,
        to: call_buffer.to,
        value: call_buffer.value,
        data: call_buffer.data.clone(),
    };

    let mut accounts = BridgeCall {
        common: ctx.accounts.common.clone(),
        outgoing_message: ctx.accounts.outgoing_message.clone(),
        system_program: ctx.accounts.system_program.clone(),
    };

    let bumps = BridgeCallBumps {
        common: ctx.bumps.common,
    };

    let ctx =
        Context::<BridgeCall>::new(ctx.program_id, &mut accounts, ctx.remaining_accounts, bumps);

    bridge_call_handler(ctx, gas_limit, call)
}

#[error_code]
pub enum BridgeCallError {
    #[msg("Incorrect gas fee receiver")]
    IncorrectGasFeeReceiver,
    #[msg("Only the owner can close this call buffer")]
    Unauthorized,
}
