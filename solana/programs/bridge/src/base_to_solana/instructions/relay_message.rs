use anchor_lang::{
    prelude::*,
    solana_program::{self},
};

use crate::base_to_solana::{
    constants::BRIDGE_CPI_AUTHORITY_SEED, state::IncomingMessage, Message, Transfer,
};
use crate::common::{bridge::Bridge, BRIDGE_SEED};
use crate::BridgeError;

/// Accounts struct for the relay message instruction that executes cross-chain messages from Base to Solana.
/// This instruction processes incoming messages that contain either pure instruction calls or token transfers
/// with additional instructions. The message execution is performed through CPI calls using a bridge authority.
#[derive(Accounts)]
pub struct RelayMessage<'info> {
    /// The incoming message account containing the cross-chain message to be executed.
    /// - Contains either a pure call message or a transfer message with additional instructions
    /// - Must be mutable to mark the message as executed after processing
    /// - Prevents replay attacks by tracking execution status
    #[account(mut)]
    pub message: Account<'info, IncomingMessage>,

    /// The main bridge state account used to check pause status
    /// - Uses PDA with BRIDGE_SEED for deterministic address
    #[account(seeds = [BRIDGE_SEED], bump)]
    pub bridge: Account<'info, Bridge>,
}

pub fn relay_message_handler<'a, 'info>(
    ctx: Context<'a, '_, 'info, 'info, RelayMessage<'info>>,
) -> Result<()> {
    // Check if bridge is paused
    require!(!ctx.accounts.bridge.paused, BridgeError::BridgePaused);

    require!(!ctx.accounts.message.executed, BridgeError::AlreadyExecuted);

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

    ctx.accounts.message.executed = true;

    // Derive the bridge CPI authority PDA tied to the message sender; used to sign all downstream CPIs.
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

    // Execute the provided downstream instructions via signed CPI
    for ix in ixs {
        // NOTE: We always do a signed CPI even if the actual program CPIed into might not require the bridge authority signer.
        solana_program::program::invoke_signed(
            &ix.into(),
            ctx.remaining_accounts,
            &[bridge_cpi_authority_seeds],
        )?;
    }

    Ok(())
}
