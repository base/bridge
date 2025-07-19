use anchor_lang::prelude::*;
use anchor_spl::token_interface::{transfer_checked, TransferChecked};
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::common::PartialTokenMetadata;
use crate::solana_to_base::{check_and_pay_for_gas, check_call};
use crate::{
    common::{bridge::Bridge, BRIDGE_SEED, TOKEN_VAULT_SEED},
    solana_to_base::{Call, OutgoingMessage, Transfer as TransferOp, GAS_FEE_RECEIVER},
};

/// Accounts struct for the bridge_spl instruction that transfers SPL tokens from Solana to Base.
/// This instruction locks SPL tokens in a vault on Solana and creates an outgoing message
/// to mint corresponding tokens on Base. The instruction handles gas fee payment and validates
/// that the token being bridged is not a wrapped token (which should use bridge_wrapped_token instead).
#[derive(Accounts)]
#[instruction(_gas_limit: u64, _to: [u8; 20], remote_token: [u8; 20], _amount: u64, call: Option<Call>)]
pub struct BridgeSpl<'info> {
    /// The account that pays for transaction fees and account creation.
    /// Must be mutable to deduct lamports for gas fees and new account rent.
    #[account(mut)]
    pub payer: Signer<'info>,

    /// The token owner authorizing the transfer of SPL tokens.
    /// This account must sign the transaction and own the tokens being bridged.
    pub from: Signer<'info>,

    /// The hardcoded gas fee receiver account that collects bridge operation fees.
    /// - Must match the predefined GAS_FEE_RECEIVER address
    /// - Receives SOL payment for gas costs on the destination chain
    ///
    /// CHECK: This is the hardcoded gas fee receiver account.
    #[account(mut, address = GAS_FEE_RECEIVER @ BridgeSplError::IncorrectGasFeeReceiver)]
    pub gas_fee_receiver: AccountInfo<'info>,

    /// The SPL token mint account for the token being bridged.
    /// - Must not be a wrapped token (wrapped tokens use bridge_wrapped_token)
    /// - Used to validate transfer amounts and get token metadata
    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,

    /// The user's token account containing the SPL tokens to be bridged.
    /// - Must be owned by the 'from' signer
    /// - Tokens will be transferred from this account to the token vault
    #[account(mut)]
    pub from_token_account: InterfaceAccount<'info, TokenAccount>,

    /// The token vault account that holds locked SPL tokens during the bridge process.
    /// - PDA derived from TOKEN_VAULT_SEED, mint pubkey, and remote_token address
    /// - Created if it doesn't exist for this mint/remote_token pair
    /// - Acts as the custody account for tokens being bridged to Base
    #[account(
        init_if_needed,
        payer = payer,
        seeds = [TOKEN_VAULT_SEED, mint.key().as_ref(), remote_token.as_ref()],
        bump,
        token::mint = mint,
        token::authority = token_vault
    )]
    pub token_vault: InterfaceAccount<'info, TokenAccount>,

    /// The main bridge state account containing global bridge configuration.
    /// - PDA with BRIDGE_SEED for deterministic address
    /// - Tracks nonce for message ordering and EIP-1559 gas pricing
    /// - Nonce is incremented after successful bridge operations
    #[account(mut, seeds = [BRIDGE_SEED], bump)]
    pub bridge: Account<'info, Bridge>,

    /// The outgoing message account that represents this bridge operation.
    /// - Contains transfer details and optional call data for the destination chain
    /// - Space is calculated based on the size of optional call data
    /// - Used by relayers to execute the bridge operation on Base
    #[account(
        init,
        payer = payer,
        space = 8 + OutgoingMessage::space(call.map(|c| c.data.len())),
    )]
    pub outgoing_message: Account<'info, OutgoingMessage>,

    /// The SPL Token program interface for executing token transfers.
    /// Used for the transfer_checked operation to move tokens to the vault.
    pub token_program: Interface<'info, TokenInterface>,

    /// System program required for creating new accounts and transferring SOL.
    /// Used for creating the outgoing message account and paying gas fees.
    pub system_program: Program<'info, System>,
}

pub fn bridge_spl_handler(
    ctx: Context<BridgeSpl>,
    gas_limit: u64,
    to: [u8; 20],
    remote_token: [u8; 20],
    amount: u64,
    call: Option<Call>,
) -> Result<()> {
    if let Some(call) = &call {
        check_call(call)?;
    }

    // Check that the provided mint is not a wrapped token.
    // Wrapped tokens should be handled by the wrapped_token_transfer_operation branch which burns the token from the user.
    require!(
        PartialTokenMetadata::try_from(&ctx.accounts.mint.to_account_info()).is_err(),
        BridgeSplError::MintIsWrappedToken
    );

    // Get the token vault balance before the transfer.
    let token_vault_balance = ctx.accounts.token_vault.amount;

    // Lock the token from the user into the token vault.
    let cpi_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        TransferChecked {
            mint: ctx.accounts.mint.to_account_info(),
            from: ctx.accounts.from_token_account.to_account_info(),
            to: ctx.accounts.token_vault.to_account_info(),
            authority: ctx.accounts.from.to_account_info(),
        },
    );
    transfer_checked(cpi_ctx, amount, ctx.accounts.mint.decimals)?;

    // Get the token vault balance after the transfer.
    ctx.accounts.token_vault.reload()?;
    let token_vault_balance_after = ctx.accounts.token_vault.amount;

    // Compute the real received amount in case the token has transfer fees.
    let received_amount = token_vault_balance_after - token_vault_balance;

    let message = OutgoingMessage::new_transfer(
        ctx.accounts.bridge.nonce,
        ctx.accounts.from.key(),
        gas_limit,
        TransferOp {
            to,
            local_token: ctx.accounts.mint.key(),
            remote_token,
            amount: received_amount,
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

    *ctx.accounts.outgoing_message = message;
    ctx.accounts.bridge.nonce += 1;

    Ok(())
}

#[error_code]
pub enum BridgeSplError {
    #[msg("Incorrect gas fee receiver")]
    IncorrectGasFeeReceiver,
    #[msg("Mint is a wrapped token")]
    MintIsWrappedToken,
}
