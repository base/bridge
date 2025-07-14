use anchor_lang::prelude::*;

use crate::{
    common::{bridge::Bridge, BRIDGE_SEED},
    solana_to_base::OutgoingMessage,
};

#[derive(Accounts)]
pub struct CloseOutgoingMessage<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(mut)]
    pub original_payer: AccountInfo<'info>,

    #[account(
        seeds = [BRIDGE_SEED],
        bump,
        constraint = bridge.base_last_relayed_nonce >= outgoing_message.nonce @ CloseOutgoingMessageError::MessageNotRelayed
    )]
    pub bridge: Account<'info, Bridge>,

    #[account(
        mut,
        close = original_payer,
        constraint = outgoing_message.payer == original_payer.key() @ CloseOutgoingMessageError::IncorrectOriginalPayer
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
