use anchor_lang::prelude::*;

use crate::{
    common::{bridge::Bridge, BRIDGE_SEED},
    solana_to_base::OutgoingMessage,
};

/// Accounts struct for the close_outgoing_message instruction that closes an outgoing message account
/// after it has been relayed to Base.
#[derive(Accounts)]
pub struct CloseOutgoingMessage<'info> {
    /// The account that pays for the transaction fees.
    #[account(mut)]
    pub payer: Signer<'info>,

    /// The account that is the original payer of the outgoing message.
    #[account(mut)]
    pub original_payer: AccountInfo<'info>,

    /// The bridge state account.
    /// It is used to check if the message has been relayed to Base based on the `base_last_relayed_nonce` field.
    #[account(
        seeds = [BRIDGE_SEED],
        bump,
        constraint = bridge.base_last_relayed_nonce >= outgoing_message.nonce @ CloseOutgoingMessageError::MessageNotRelayed
    )]
    pub bridge: Account<'info, Bridge>,

    /// The outgoing message account to be closed and whose rent will be refunded to the original payer.
    #[account(
        mut,
        close = original_payer,
        has_one = original_payer @ CloseOutgoingMessageError::IncorrectOriginalPayer
    )]
    pub outgoing_message: Account<'info, OutgoingMessage>,
}

pub fn close_outgoing_message_handler(_ctx: Context<CloseOutgoingMessage>) -> Result<()> {
    Ok(())
}

#[error_code]
pub enum CloseOutgoingMessageError {
    #[msg("Incorrect original payer")]
    IncorrectOriginalPayer,
    #[msg("Message has not been relayed yet")]
    MessageNotRelayed,
}
