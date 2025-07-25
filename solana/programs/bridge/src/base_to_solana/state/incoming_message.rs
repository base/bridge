use anchor_lang::prelude::*;

use crate::base_to_solana::{
    token::{FinalizeBridgeSol, FinalizeBridgeSpl, FinalizeBridgeWrappedToken},
    Ix,
};

/// Represents a cross-chain message sent from Base to Solana
/// that is waiting to be processed or has already been executed.
///
/// This struct stores the essential information needed to validate and execute
/// bridge operations from Base to Solana, including both simple calls and token transfers.
#[account]
#[derive(Debug)]
pub struct IncomingMessage {
    /// The 20-byte Ethereum address of the sender on Base who initiated this bridge operation.
    /// This is used for verification and access control during message execution.
    pub sender: [u8; 20],

    /// The actual message payload containing either instruction calls or token transfer data.
    /// This enum determines what type of operation will be executed on Solana.
    pub message: Message,

    /// Flag indicating whether this message has been successfully executed on Solana.
    /// Once set to true, the message cannot be executed again, preventing replay attacks.
    pub executed: bool,
}

impl IncomingMessage {
    pub fn space(data_len: usize) -> usize {
        20 + (4 + data_len) + 1
    }
}

/// Defines the type of cross-chain operation being performed from Base to Solana.
///
/// This enum encapsulates the two main categories of bridge operations:
/// general instruction calls and token transfers with optional additional instructions.
#[derive(Debug, Clone, AnchorSerialize, AnchorDeserialize)]
pub enum Message {
    /// A general cross-chain call containing a sequence of Solana instructions to execute.
    /// Used for arbitrary program interactions that don't involve token transfers.
    Call(Vec<Ix>),

    /// A token transfer operation from Base to Solana, optionally followed by additional instructions.
    /// The transfer field specifies the type and details of the token being bridged,
    /// while ixs contains any follow-up instructions to execute after the transfer completes.
    Transfer {
        /// The specific type of token transfer (SOL, SPL token, or wrapped token)
        transfer: Transfer,
        /// Additional Solana instructions to execute after the transfer is finalized
        ixs: Vec<Ix>,
    },
}

/// Specifies the type of token being transferred from Base to Solana and contains
/// the necessary data to finalize the transfer on the Solana side.
///
/// Each variant corresponds to a different token type that can be bridged,
/// with variant-specific data needed to complete the transfer operation.
#[derive(Debug, Clone, AnchorSerialize, AnchorDeserialize)]
pub enum Transfer {
    /// Transfer of native SOL tokens from Base to Solana.
    /// Contains the recipient address and amount to be transferred.
    Sol(FinalizeBridgeSol),

    /// Transfer of SPL tokens from Base to Solana.
    /// Used for tokens that already exist natively on Solana and are bridged to Base.
    Spl(FinalizeBridgeSpl),

    /// Transfer of wrapped tokens from Base to Solana.
    /// Used for tokens that originated on Base and are wrapped on Solana.
    /// The wrapped token will be minted on Solana to represent the Base token.
    WrappedToken(FinalizeBridgeWrappedToken),
}
