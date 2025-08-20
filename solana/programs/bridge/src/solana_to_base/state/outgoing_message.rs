use anchor_lang::prelude::*;

/// Trait for calculating the space required for a message.
pub trait MessageSpace {
    fn space(data_len: usize) -> usize;
}

/// Represents a token transfer from Solana to Base with optional contract execution.
/// This struct contains all the information needed to bridge tokens between chains
/// and optionally execute additional logic on the destination chain after the transfer.
#[derive(Debug, Clone, Eq, PartialEq, AnchorSerialize, AnchorDeserialize)]
pub struct Transfer {
    /// The recipient address on Base that will receive the bridged tokens.
    pub to: [u8; 20],

    /// The token mint address on Solana that is being bridged.
    /// For SOL this is `NATIVE_SOL_PUBKEY`.
    pub local_token: Pubkey,

    /// The corresponding token contract address on Base.
    /// This is the token that will be minted or unlocked on the Base side.
    pub remote_token: [u8; 20],

    /// The amount to transfer, in the token's smallest unit.
    /// For SPL tokens and SOL, funds are locked on Solana; for wrapped tokens, they are burned.
    /// On Base, the corresponding amount is minted or unlocked.
    pub amount: u64,

    /// Optional contract call to execute on Base after the token transfer completes.
    /// Allows for complex cross-chain operations that combine token transfers with logic execution.
    pub call: Option<Call>,
}

impl MessageSpace for Transfer {
    fn space(data_len: usize) -> usize {
        20 + // to
        32 + // local_token
        20 + // remote_token
        8 + // amount
        1 + Call::space(data_len) // option_flag + call
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

    /// The target address on Base (20 bytes for Ethereum-compatible address).
    /// Must be set to zero for Create and Create2 operations.
    pub to: [u8; 20],

    /// Amount of ETH to send with this call on Base, in wei.
    pub value: u128,

    /// The encoded function call data or contract bytecode.
    /// For regular calls: ABI-encoded function signature and parameters.
    /// For contract creation: the contract's initialization bytecode.
    pub data: Vec<u8>,
}

impl MessageSpace for Call {
    fn space(data_len: usize) -> usize {
        CallType::INIT_SPACE + // call type
        20 + // to
        16 + // value
        4 + data_len // len_prefix + data
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
    /// Monotonic message nonce used for ordering and replay protection on Base.
    /// Starts at 0 and is incremented by the `Bridge` for each new message.
    pub nonce: u64,

    /// The Solana public key of the signer that initiated this cross-chain message.
    /// Carried to Base for use by destination logic; Solana-side authentication is enforced
    /// via signer constraints.
    pub sender: Pubkey,

    /// The actual message payload that will be executed on Base.
    /// Can be either a direct contract call or a token transfer (with optional call).
    pub message: Message,
}

impl OutgoingMessage {
    pub fn new_call(nonce: u64, sender: Pubkey, call: Call) -> Self {
        Self {
            nonce,
            sender,
            message: Message::Call(call),
        }
    }

    pub fn new_transfer(nonce: u64, sender: Pubkey, transfer: Transfer) -> Self {
        Self {
            nonce,
            sender,
            message: Message::Transfer(transfer),
        }
    }

    /// Returns the serialized size of an `OutgoingMessage` payload, excluding the 8-byte Anchor
    /// account discriminator.
    pub fn space<T: MessageSpace>(data_len: usize) -> usize {
        8 + // nonce
        32 + // sender
        1 + T::space(data_len) // message (variant + space)
    }
}
