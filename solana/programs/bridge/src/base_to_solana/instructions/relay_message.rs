use anchor_lang::{
    prelude::*,
    solana_program::{self},
};

use crate::base_to_solana::{
    constants::BRIDGE_CPI_AUTHORITY_SEED, state::IncomingMessage, Message, Transfer,
};

/// Accounts struct for the relay message instruction that executes cross-chain messages from Base to Solana.
/// This instruction processes incoming messages that contain either pure instruction calls or token transfers
/// with additional instructions. The message execution is performed through CPI calls using a bridge authority.
#[derive(Accounts)]
pub struct RelayMessage<'info> {
    /// The account that pays for the transaction execution fees.
    /// Must be mutable to deduct lamports for transaction costs.
    #[account(mut)]
    pub payer: Signer<'info>,

    /// The incoming message account containing the cross-chain message to be executed.
    /// - Contains either a pure call message or a transfer message with additional instructions
    /// - Must be mutable to mark the message as executed after processing
    /// - Prevents replay attacks by tracking execution status
    #[account(mut)]
    pub message: Account<'info, IncomingMessage>,
}

pub fn relay_message_handler<'a, 'info>(
    ctx: Context<'a, '_, 'info, 'info, RelayMessage<'info>>,
) -> Result<()> {
    require!(
        !ctx.accounts.message.executed,
        RelayMessageError::AlreadyExecuted
    );

    let message = ctx.accounts.message.message.clone();
    let (transfer, ixs) = match message {
        Message::Call(ixs) => (None, ixs),
        Message::Transfer { transfer, ixs } => (Some(transfer), ixs),
    };

    // Process the transfer if it exists
    if let Some(transfer) = transfer {
        match transfer {
            Transfer::Sol(transfer) => transfer.finalize(ctx.remaining_accounts)?,
            Transfer::Spl(transfer) => transfer.finalize(ctx.remaining_accounts)?,
            Transfer::WrappedToken(transfer) => transfer.finalize(ctx.remaining_accounts)?,
        };
    }

    let (_, bump) = Pubkey::find_program_address(
        &[
            BRIDGE_CPI_AUTHORITY_SEED,
            ctx.accounts.message.sender.as_ref(),
        ],
        ctx.program_id,
    );

    let bridge_cpi_authority_seeds: &[&[u8]] = &[
        BRIDGE_CPI_AUTHORITY_SEED,
        ctx.accounts.message.sender.as_ref(),
        &[bump],
    ];

    // Process all the remaining instructions
    for ix in ixs {
        // NOTE: We always do a signed CPI even if the actual program CPIed into might not require the bridge authority signer.
        solana_program::program::invoke_signed(
            &ix.into(),
            ctx.remaining_accounts,
            &[bridge_cpi_authority_seeds],
        )?;
    }

    ctx.accounts.message.executed = true;

    Ok(())
}

#[error_code]
pub enum RelayMessageError {
    #[msg("Message already executed")]
    AlreadyExecuted,
    #[msg("Bridge CPI authority not found")]
    BridgeCpiAuthorityNotFound,
}
