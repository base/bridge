use anchor_lang::prelude::*;
use anchor_spl::{
    token_2022::Token2022,
    token_interface::{self, BurnChecked, Mint, TokenAccount},
};

use crate::solana_to_base::{check_and_pay_for_gas, check_call};
use crate::{
    common::{bridge::{Bridge, BridgeError}, PartialTokenMetadata, BRIDGE_SEED},
    solana_to_base::{Call, OutgoingMessage, Transfer as TransferOp, GAS_FEE_RECEIVER},
};

#[derive(Accounts)]
#[instruction(_gas_limit: u64, _to: [u8; 20], _amount: u64, call: Option<Call>)]
pub struct BridgeWrappedToken<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    pub from: Signer<'info>,

    /// CHECK: This is the hardcoded gas fee receiver account.
    #[account(mut, address = GAS_FEE_RECEIVER @ BridgeWrappedTokenError::IncorrectGasFeeReceiver)]
    pub gas_fee_receiver: AccountInfo<'info>,

    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(mut)]
    pub from_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(mut, seeds = [BRIDGE_SEED], bump)]
    pub bridge: Account<'info, Bridge>,

    #[account(
        init,       
        payer = payer,
        space = 8 + OutgoingMessage::space(call.map(|c| c.data.len())),
    )]
    pub outgoing_message: Account<'info, OutgoingMessage>,

    pub token_program: Program<'info, Token2022>,

    pub system_program: Program<'info, System>,
}

pub fn bridge_wrapped_token_handler(
    ctx: Context<BridgeWrappedToken>,
    gas_limit: u64,
    to: [u8; 20],
    amount: u64,
    call: Option<Call>,
) -> Result<()> {
    // Check if bridge is paused
    require!(!ctx.accounts.bridge.is_paused(), BridgeError::BridgePaused);
    
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
