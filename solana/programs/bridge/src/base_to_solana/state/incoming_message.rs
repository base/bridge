use anchor_lang::prelude::*;

use crate::base_to_solana::{
    token::{FinalizeBridgeSol, FinalizeBridgeSpl, FinalizeBridgeWrappedToken},
    Ix,
};

#[account]
#[derive(Debug)]
pub struct IncomingMessage {
    pub sender: [u8; 20],
    pub message: Message,
    pub executed: bool,
}

impl IncomingMessage {
    pub fn space(data_len: usize) -> usize {
        20 + (4 + data_len) + 1
    }
}

#[derive(Debug, Clone, AnchorSerialize, AnchorDeserialize)]
pub enum Message {
    Call(Vec<Ix>),
    Transfer { transfer: Transfer, ixs: Vec<Ix> },
}

#[derive(Debug, Clone, AnchorSerialize, AnchorDeserialize)]
pub enum Transfer {
    Sol(FinalizeBridgeSol),
    Spl(FinalizeBridgeSpl),
    WrappedToken(FinalizeBridgeWrappedToken),
}
