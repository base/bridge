use anchor_lang::prelude::*;
use anchor_spl::token_interface::{transfer_checked, TransferChecked};
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::common::PartialTokenMetadata;
use crate::solana_to_base::{check_and_pay_for_gas, check_call};
use crate::{
    common::{bridge::Bridge, BRIDGE_SEED, TOKEN_VAULT_SEED},
    solana_to_base::{Call, CallBuffer, OutgoingMessage, Transfer as TransferOp, GAS_FEE_RECEIVER},
};

/// Common accounts struct for the bridge_spl and bridge_spl_with_buffered_call instructions that
/// transfers SPL tokens from Solana to Base.
#[derive(Accounts, Clone)]
pub struct BridgeSplCommon<'info> {
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

    /// The main bridge state account containing global bridge configuration.
    /// - PDA with BRIDGE_SEED for deterministic address
    /// - Tracks nonce for message ordering and EIP-1559 gas pricing
    /// - Nonce is incremented after successful bridge operations
    #[account(mut, seeds = [BRIDGE_SEED], bump)]
    pub bridge: Account<'info, Bridge>,
}

/// Accounts struct for the bridge_spl instruction that transfers SPL tokens from Solana to Base along
/// with an optional call that can be executed on Base.
///
/// This instruction locks SPL tokens in a vault on Solana and creates an outgoing message
/// to mint corresponding tokens and execute the optional call on Base.
#[derive(Accounts)]
#[instruction(_gas_limit: u64, _to: [u8; 20], remote_token: [u8; 20], _amount: u64, call: Option<Call>)]
pub struct BridgeSpl<'info> {
    /// Common accounts used by the instruction.
    pub common: BridgeSplCommon<'info>,

    /// The token vault account that holds locked SPL tokens during the bridge process.
    /// - PDA derived from TOKEN_VAULT_SEED, mint pubkey, and remote_token address
    /// - Created if it doesn't exist for this mint/remote_token pair
    /// - Acts as the custody account for tokens being bridged to Base
    #[account(
        init_if_needed,
        payer = common.payer,
        seeds = [TOKEN_VAULT_SEED, common.mint.key().as_ref(), remote_token.as_ref()],
        bump,
        token::mint = common.mint,
        token::authority = token_vault
    )]
    pub token_vault: InterfaceAccount<'info, TokenAccount>,

    /// The outgoing message account that represents this bridge operation.
    /// - Contains transfer details and optional call data for the destination chain
    /// - Space is calculated based on the size of optional call data
    /// - Used by relayers to execute the bridge operation on Base
    #[account(
        init,
        payer = common.payer,
        space = 8 + OutgoingMessage::space(call.map(|c| c.data.len())),
    )]
    pub outgoing_message: Account<'info, OutgoingMessage>,

    /// The SPL Token program interface for executing token transfers.
    /// Used for the transfer_checked operation to move tokens to the vault.
    pub token_program: Interface<'info, TokenInterface>,

    /// System program required for creating the outgoing message account.
    pub system_program: Program<'info, System>,
}

/// Accounts struct for the bridge_spl_with_buffered_call instruction that transfers SPL tokens
/// from Solana to Base with a call using buffered data.
///
/// The bridged SPL tokens are locked in a vault on Solana and an outgoing message is created to mint
/// the corresponding tokens and execute the call on Base. The call buffer account is closed and
/// rent returned to the owner.
#[derive(Accounts)]
#[instruction(_gas_limit: u64, _to: [u8; 20], remote_token: [u8; 20], _amount: u64)]
pub struct BridgeSplWithBufferedCall<'info> {
    /// Common accounts used by the instruction.
    pub common: BridgeSplCommon<'info>,

    /// The token vault account that holds locked SPL tokens during the bridge process.
    /// - PDA derived from TOKEN_VAULT_SEED, mint pubkey, and remote_token address
    /// - Created if it doesn't exist for this mint/remote_token pair
    /// - Acts as the custody account for tokens being bridged to Base
    #[account(
        init_if_needed,
        payer = common.payer,
        seeds = [TOKEN_VAULT_SEED, common.mint.key().as_ref(), remote_token.as_ref()],
        bump,
        token::mint = common.mint,
        token::authority = token_vault
    )]
    pub token_vault: InterfaceAccount<'info, TokenAccount>,

    /// The owner of the call buffer who will receive the rent refund.
    #[account(mut)]
    pub owner: Signer<'info>,

    /// The call buffer account that stores the call data.
    /// This account will be closed and rent returned to the owner.
    #[account(
        mut,
        close = owner,
        has_one = owner @ BridgeSplError::Unauthorized,
    )]
    pub call_buffer: Account<'info, CallBuffer>,

    /// The outgoing message account that stores the cross-chain transfer details.
    #[account(
        init,
        payer = common.payer,
        space = 8 + OutgoingMessage::space(Some(call_buffer.data.len())),
    )]
    pub outgoing_message: Account<'info, OutgoingMessage>,

    /// The SPL Token program interface for executing token transfers.
    /// Used for the transfer_checked operation to move tokens to the vault.
    pub token_program: Interface<'info, TokenInterface>,

    /// System program required for creating the outgoing message account.
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
        PartialTokenMetadata::try_from(&ctx.accounts.common.mint.to_account_info()).is_err(),
        BridgeSplError::MintIsWrappedToken
    );

    // Get the token vault balance before the transfer.
    let token_vault_balance = ctx.accounts.token_vault.amount;

    // Lock the token from the user into the token vault.
    let cpi_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        TransferChecked {
            mint: ctx.accounts.common.mint.to_account_info(),
            from: ctx.accounts.common.from_token_account.to_account_info(),
            to: ctx.accounts.token_vault.to_account_info(),
            authority: ctx.accounts.common.from.to_account_info(),
        },
    );
    transfer_checked(cpi_ctx, amount, ctx.accounts.common.mint.decimals)?;

    // Get the token vault balance after the transfer.
    ctx.accounts.token_vault.reload()?;
    let token_vault_balance_after = ctx.accounts.token_vault.amount;

    // Compute the real received amount in case the token has transfer fees.
    let received_amount = token_vault_balance_after - token_vault_balance;

    let message = OutgoingMessage::new_transfer(
        ctx.accounts.common.bridge.nonce,
        ctx.accounts.common.payer.key(),
        ctx.accounts.common.from.key(),
        gas_limit,
        TransferOp {
            to,
            local_token: ctx.accounts.common.mint.key(),
            remote_token,
            amount: received_amount,
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

    *ctx.accounts.outgoing_message = message;
    ctx.accounts.common.bridge.nonce += 1;

    Ok(())
}

pub fn bridge_spl_with_buffered_call_handler<'a, 'b, 'c, 'info>(
    ctx: Context<'a, 'b, 'c, 'info, BridgeSplWithBufferedCall<'info>>,
    gas_limit: u64,
    to: [u8; 20],
    remote_token: [u8; 20],
    amount: u64,
) -> Result<()> {
    let call_buffer = &ctx.accounts.call_buffer;
    let call = Call {
        ty: call_buffer.ty,
        to: call_buffer.to,
        value: call_buffer.value,
        data: call_buffer.data.clone(),
    };

    let mut accounts = BridgeSpl {
        common: ctx.accounts.common.clone(),
        token_vault: ctx.accounts.token_vault.clone(),
        token_program: ctx.accounts.token_program.clone(),
        outgoing_message: ctx.accounts.outgoing_message.clone(),
        system_program: ctx.accounts.system_program.clone(),
    };

    let bumps = BridgeSplBumps {
        common: ctx.bumps.common,
        token_vault: ctx.bumps.token_vault,
    };

    let ctx =
        Context::<BridgeSpl>::new(ctx.program_id, &mut accounts, ctx.remaining_accounts, bumps);

    bridge_spl_handler(ctx, gas_limit, to, remote_token, amount, Some(call))
}

#[error_code]
pub enum BridgeSplError {
    #[msg("Incorrect gas fee receiver")]
    IncorrectGasFeeReceiver,
    #[msg("Mint is a wrapped token")]
    MintIsWrappedToken,
    #[msg("Only the owner can close this call buffer")]
    Unauthorized,
}
