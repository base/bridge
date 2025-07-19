use anchor_lang::prelude::*;
use anchor_spl::{
    token_2022::Token2022,
    token_interface::{self, BurnChecked, Mint, TokenAccount},
};

use crate::solana_to_base::{check_and_pay_for_gas, check_call};
use crate::{
    common::{bridge::Bridge, PartialTokenMetadata, BRIDGE_SEED},
    solana_to_base::{Call, OutgoingMessage, Transfer as TransferOp, GAS_FEE_RECEIVER},
};

/// Accounts struct for the bridge wrapped token instruction that transfers wrapped tokens from Solana to Base.
/// This instruction burns wrapped tokens on Solana and creates an outgoing message to transfer equivalent
/// tokens on Base. The wrapped tokens must have been originally bridged from Base.
#[derive(Accounts)]
#[instruction(_gas_limit: u64, _to: [u8; 20], _amount: u64, call: Option<Call>)]
pub struct BridgeWrappedToken<'info> {
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

    /// The outgoing message account being created to store bridge transfer data.
    /// - Contains transfer details and optional call data for Base execution
    /// - Space allocated based on call data size
    /// - Will be read by Base relayers to complete the bridge operation
    #[account(
        init,       
        payer = payer,
        space = 8 + OutgoingMessage::space(call.map(|c| c.data.len())),
    )]
    pub outgoing_message: Account<'info, OutgoingMessage>,

    /// Token2022 program used for burning the wrapped tokens.
    /// Required for all token operations including burn_checked.
    pub token_program: Program<'info, Token2022>,

    /// System program required for creating the outgoing message account.
    /// Used internally by Anchor for account initialization.
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
        PartialTokenMetadata::try_from(&ctx.accounts.mint.to_account_info())?;

    let message = OutgoingMessage::new_transfer(
        ctx.accounts.bridge.nonce,
        ctx.accounts.from.key(),
        gas_limit,
        TransferOp {
            to,
            local_token: ctx.accounts.mint.key(),
            remote_token: partial_token_metadata.remote_token,
            amount,
            call,
        },
    );

    check_and_pay_for_gas(
        &ctx.accounts.system_program,
        &ctx.accounts.payer,
        &ctx.accounts.gas_fee_receiver,
        &mut ctx.accounts.bridge.eip1559,
        gas_limit,
        message.relay_messages_tx_size(),
    )?;

    // Burn the token from the user.
    let cpi_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        BurnChecked {
            mint: ctx.accounts.mint.to_account_info(),
            from: ctx.accounts.from_token_account.to_account_info(),
            authority: ctx.accounts.from.to_account_info(),
        },
    );
    token_interface::burn_checked(cpi_ctx, amount, ctx.accounts.mint.decimals)?;

    *ctx.accounts.outgoing_message = message;
    ctx.accounts.bridge.nonce += 1;

    Ok(())
}

#[error_code]
pub enum BridgeWrappedTokenError {
    #[msg("Incorrect gas fee receiver")]
    IncorrectGasFeeReceiver,
    #[msg("Mint is a wrapped token")]
    MintIsWrappedToken,
}
