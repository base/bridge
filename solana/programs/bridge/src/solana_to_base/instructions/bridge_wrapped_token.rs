use anchor_lang::prelude::*;
use anchor_spl::{
    token_2022::Token2022,
    token_interface::{self, BurnChecked, Mint, TokenAccount},
};

use crate::solana_to_base::{check_and_pay_for_gas, check_call};
use crate::{
    common::{bridge::Bridge, PartialTokenMetadata, BRIDGE_SEED},
    solana_to_base::{Call, CallBuffer, OutgoingMessage, Transfer as TransferOp, GAS_FEE_RECEIVER},
};

/// Common accounts struct for the bridge_wrapped_token and bridge_wrapped_token_with_buffered_call
/// instructions that transfer wrapped tokens from Solana to Base.
#[derive(Accounts, Clone)]
pub struct BridgeWrappedTokenCommon<'info> {
    /// The account that pays for transaction fees and outgoing message account creation.
    /// Must be mutable to deduct lamports for account rent and gas fees.
    #[account(mut)]
    pub payer: Signer<'info>,

    /// The token owner who is bridging their wrapped tokens back to Base.
    /// Must sign the transaction to authorize burning their tokens.
    pub from: Signer<'info>,

    /// The hardcoded account that receives gas fees for Base operations.
    /// - Must match the predefined GAS_FEE_RECEIVER address
    /// - Receives lamports to cover gas costs on Base
    /// 
    /// CHECK: This is the hardcoded gas fee receiver account.
    #[account(mut, address = GAS_FEE_RECEIVER @ BridgeWrappedTokenError::IncorrectGasFeeReceiver)]
    pub gas_fee_receiver: AccountInfo<'info>,

    /// The wrapped token mint account representing the original Base token.
    /// - Contains metadata linking to the original token on Base
    /// - Tokens will be burned from this mint
    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,

    /// The user's token account holding the wrapped tokens to be bridged.
    /// - Must contain sufficient token balance for the bridge amount
    /// - Tokens will be burned from this account
    #[account(mut)]
    pub from_token_account: InterfaceAccount<'info, TokenAccount>,

    /// The main bridge state account storing global bridge configuration.
    /// - Uses PDA with BRIDGE_SEED for deterministic address
    /// - Tracks nonce for message ordering and EIP-1559 gas pricing
    #[account(mut, seeds = [BRIDGE_SEED], bump)]
    pub bridge: Account<'info, Bridge>,

    /// Token2022 program used for burning the wrapped tokens.
    /// Required for all token operations including burn_checked.
    pub token_program: Program<'info, Token2022>,
}

/// Accounts struct for the bridge wrapped token instruction that transfers wrapped tokens from Solana to Base
/// along with an optional call that can be executed on Base.
///
/// This instruction burns wrapped tokens on Solana and creates an outgoing message to transfer equivalent
/// tokens and execute the optional call on Base.
#[derive(Accounts)]
#[instruction(_gas_limit: u64, _to: [u8; 20], _amount: u64, call: Option<Call>)]
pub struct BridgeWrappedToken<'info> {
    /// Common accounts used by the instruction.
    pub common: BridgeWrappedTokenCommon<'info>,

    /// The outgoing message account being created to store bridge transfer data.
    /// - Contains transfer details and optional call data for Base execution
    /// - Space allocated based on call data size
    /// - Will be read by Base relayers to complete the bridge operation
    #[account(
        init,       
        payer = common.payer,
        space = 8 + OutgoingMessage::space(call.map(|c| c.data.len())),
    )]
    pub outgoing_message: Account<'info, OutgoingMessage>,

    /// System program required for creating the outgoing message account.
    pub system_program: Program<'info, System>,
}

/// Accounts struct for the bridge_wrapped_token_with_buffered_call instruction that transfers wrapped tokens
/// from Solana to Base with a call using buffered data.
///
/// The wrapped tokens are burned on Solana and an outgoing message is created to transfer
/// the equivalent tokens and execute the call on Base. The call buffer account is closed and
/// rent returned to the owner.
#[derive(Accounts)]
#[instruction(_gas_limit: u64, _to: [u8; 20], _amount: u64)]
pub struct BridgeWrappedTokenWithBufferedCall<'info> {
    /// Common accounts used by the instruction.
    pub common: BridgeWrappedTokenCommon<'info>,

    /// The owner of the call buffer who will receive the rent refund.
    #[account(mut)]
    pub owner: Signer<'info>,

    /// The call buffer account that stores the call data.
    /// This account will be closed and rent returned to the owner.
    #[account(
        mut,
        close = owner,
        has_one = owner @ BridgeWrappedTokenError::Unauthorized,
    )]
    pub call_buffer: Account<'info, CallBuffer>,

    /// The outgoing message account that stores the cross-chain transfer details.
    #[account(
        init,
        payer = common.payer,
        space = 8 + OutgoingMessage::space(Some(call_buffer.data.len())),
    )]
    pub outgoing_message: Account<'info, OutgoingMessage>,

    /// System program required for creating the outgoing message account.
    pub system_program: Program<'info, System>,
}

pub fn bridge_wrapped_token_handler(
    ctx: Context<BridgeWrappedToken>,
    gas_limit: u64,
    to: [u8; 20],
    amount: u64,
    call: Option<Call>,
) -> Result<()> {
    if let Some(call) = &call {
        check_call(call)?;
    }

    // Get the token metadata from the mint.
    let partial_token_metadata =
        PartialTokenMetadata::try_from(&ctx.accounts.common.mint.to_account_info())?;

    let message = OutgoingMessage::new_transfer(
        ctx.accounts.common.bridge.nonce,
        ctx.accounts.common.payer.key(),
        ctx.accounts.common.from.key(),
        gas_limit,
        TransferOp {
            to,
            local_token: ctx.accounts.common.mint.key(),
            remote_token: partial_token_metadata.remote_token,
            amount,
            call,
        },
    );

    check_and_pay_for_gas(
        &ctx.accounts.system_program,
        &ctx.accounts.common.payer,
        &ctx.accounts.common.gas_fee_receiver,
        &mut ctx.accounts.common.bridge.eip1559,
        gas_limit,
        message.relay_messages_tx_size(),
    )?;

    // Burn the token from the user.
    let cpi_ctx = CpiContext::new(
        ctx.accounts.common.token_program.to_account_info(),
        BurnChecked {
            mint: ctx.accounts.common.mint.to_account_info(),
            from: ctx.accounts.common.from_token_account.to_account_info(),
            authority: ctx.accounts.common.from.to_account_info(),
        },
    );
    token_interface::burn_checked(cpi_ctx, amount, ctx.accounts.common.mint.decimals)?;

    *ctx.accounts.outgoing_message = message;
    ctx.accounts.common.bridge.nonce += 1;

    Ok(())
}

pub fn bridge_wrapped_token_with_buffered_call_handler<'a, 'b, 'c, 'info>(
    ctx: Context<'a, 'b, 'c, 'info, BridgeWrappedTokenWithBufferedCall<'info>>,
    gas_limit: u64,
    to: [u8; 20],
    amount: u64,
) -> Result<()> {
    let call_buffer = &ctx.accounts.call_buffer;
    let call = Call {
        ty: call_buffer.ty,
        to: call_buffer.to,
        value: call_buffer.value,
        data: call_buffer.data.clone(),
    };

    let mut accounts = BridgeWrappedToken {
        common: ctx.accounts.common.clone(),
        outgoing_message: ctx.accounts.outgoing_message.clone(),
        system_program: ctx.accounts.system_program.clone(),
    };

    let bumps = BridgeWrappedTokenBumps {
        common: ctx.bumps.common,
    };

    let ctx = Context::<BridgeWrappedToken>::new(ctx.program_id, &mut accounts, ctx.remaining_accounts, bumps);

    bridge_wrapped_token_handler(ctx, gas_limit, to, amount, Some(call))
}

#[error_code]
pub enum BridgeWrappedTokenError {
    #[msg("Incorrect gas fee receiver")]
    IncorrectGasFeeReceiver,
    #[msg("Mint is a wrapped token")]
    MintIsWrappedToken,
    #[msg("Only the owner can close this call buffer")]
    Unauthorized,
}
