use anchor_lang::prelude::*;

use crate::solana_to_base::{
    RELAY_MESSAGES_CALL_ABI_ENCODING_OVERHEAD, RELAY_MESSAGES_TRANSFER_ABI_ENCODING_OVERHEAD,
};

/// Represents a token transfer from Solana to Base with optional contract execution.
/// This struct contains all the information needed to bridge tokens between chains
/// and optionally execute additional logic on the destination chain after the transfer.
#[derive(Debug, Clone, Eq, PartialEq, AnchorSerialize, AnchorDeserialize)]
pub struct Transfer {
    /// The recipient address on Base that will receive the bridged tokens.
    pub to: [u8; 20],

    /// The token mint address on Solana that is being bridged.
    /// This identifies which token on Solana is being transferred cross-chain.
    pub local_token: Pubkey,

    /// The corresponding token contract address on Base.
    /// This is the token that will be minted or unlocked on the Base side.
    pub remote_token: [u8; 20],

    /// The amount of tokens to transfer, in the token's smallest unit.
    /// This amount will be burned/locked on Solana and minted/unlocked on Base.
    pub amount: u64,

    /// Optional contract call to execute on Base after the token transfer completes.
    /// Allows for complex cross-chain operations that combine token transfers with logic execution.
    pub call: Option<Call>,
}

impl Transfer {
    pub fn space(data_len: Option<usize>) -> usize {
        20 + 32 + 20 + 8 + 1 + Call::space(data_len.unwrap_or_default())
    }
}

#[derive(Debug, Copy, Clone, Eq, PartialEq, AnchorSerialize, AnchorDeserialize, InitSpace)]
pub enum CallType {
    Call,
    DelegateCall,
    Create,
    Create2,
}

/// Represents a contract call to be executed on Base.
/// Contains all the necessary information to perform various types of contract interactions,
/// including regular calls, delegate calls, and contract creation operations.
#[derive(Debug, Clone, Eq, PartialEq, AnchorSerialize, AnchorDeserialize)]
pub struct Call {
    /// The type of call operation to perform (Call, DelegateCall, Create, or Create2).
    /// Determines how the call will be executed on the Base side.
    pub ty: CallType,

    /// The target contract address on Base (20 bytes for Ethereum-compatible address).
    /// For Create and Create2 operations, this may be used differently or ignored.
    pub to: [u8; 20],

    /// The amount of native currency (ETH) to send with this call, in wei.
    pub value: u128,

    /// The encoded function call data or contract bytecode.
    /// For regular calls: ABI-encoded function signature and parameters.
    /// For contract creation: the contract's initialization bytecode.
    pub data: Vec<u8>,
}

impl Call {
    pub fn space(data_len: usize) -> usize {
        CallType::INIT_SPACE + 20 + 16 + (4 + data_len)
    }
}

/// Represents the type of cross-chain operation to be executed on Base.
/// This enum encapsulates the two main types of operations supported by the bridge:
/// direct contract calls and token transfers with optional contract calls.
#[derive(Debug, Clone, Eq, PartialEq, AnchorSerialize, AnchorDeserialize)]
pub enum Message {
    /// A direct contract call to be executed on Base.
    /// Contains the target contract, function data, and execution parameters.
    Call(Call),

    /// A token transfer from Solana to Base, with an optional contract call.
    /// Handles bridging of tokens between chains and can trigger additional logic on Base.
    Transfer(Transfer),
}

/// Represents a message being sent from Solana to Base through the bridge.
/// This struct contains all the necessary information to execute a cross-chain operation
/// on the Base side, including the message content and execution parameters.
#[account]
#[derive(Debug, Eq, PartialEq)]
pub struct OutgoingMessage {
    /// Sequential number for this message to ensure ordering and prevent replay attacks.
    /// Each sender maintains their own nonce sequence starting from 0.
    pub nonce: u64,

    /// The Solana public key of the account that initiated this cross-chain message.
    /// This is used for authentication and to identify the message originator on Base.
    pub sender: Pubkey,

    /// Maximum amount of gas that can be consumed when executing this message on Base.
    /// If execution exceeds this limit, the transaction will revert on the Base side.
    pub gas_limit: u64,

    /// The actual message payload that will be executed on Base.
    /// Can be either a direct contract call or a token transfer (with optional call).
    pub message: Message,
}

impl OutgoingMessage {
    pub fn new_call(nonce: u64, sender: Pubkey, gas_limit: u64, call: Call) -> Self {
        Self {
            nonce,
            sender,
            gas_limit,
            message: Message::Call(call),
        }
    }

    pub fn new_transfer(nonce: u64, sender: Pubkey, gas_limit: u64, transfer: Transfer) -> Self {
        Self {
            nonce,
            sender,
            gas_limit,
            message: Message::Transfer(transfer),
        }
    }

    pub fn space(data_len: Option<usize>) -> usize {
        // The transfer variant is always bigger than the call variant (as it embeds an optional call)
        16 + 32 + 8 + (1 + Transfer::space(data_len))
    }

    pub fn relay_messages_tx_size(&self) -> usize {
        match &self.message {
            Message::Call(call) => {
                RELAY_MESSAGES_CALL_ABI_ENCODING_OVERHEAD as usize
                    + call.data.len().div_ceil(32) * 32
            }
            Message::Transfer(transfer) => {
                RELAY_MESSAGES_TRANSFER_ABI_ENCODING_OVERHEAD as usize
                    + transfer
                        .call
                        .as_ref()
                        .map(|call| call.data.len().div_ceil(32) * 32)
                        .unwrap_or_default()
            }
        }
    }
}
