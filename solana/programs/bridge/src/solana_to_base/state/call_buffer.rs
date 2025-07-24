use anchor_lang::prelude::*;

use crate::solana_to_base::CallType;

/// A buffer account that stores call parameters which can be built up over multiple transactions
/// to bypass Solana's transaction size limits. The data field can be appended to incrementally
/// and the account is consumed when the call is bridged to Base.
#[account]
#[derive(Debug)]
pub struct CallBuffer {
    /// The owner who can modify this call buffer
    pub owner: Pubkey,

    /// The type of call operation to perform (Call, DelegateCall, Create, or Create2).
    /// Determines how the call will be executed on the Base side.
    pub ty: CallType,

    /// The target address on Base (20 bytes for Ethereum-compatible address).
    /// Must be set to zero for Create and Create2 operations.
    pub to: [u8; 20],

    /// The amount of native currency (ETH) to send with this call, in wei.
    pub value: u128,

    /// The encoded function call data or contract bytecode.
    /// For regular calls: ABI-encoded function signature and parameters.
    /// For contract creation: the contract's initialization bytecode.
    pub data: Vec<u8>,
}

impl CallBuffer {
    /// Calculate space needed for a CallBuffer account
    /// We allocate extra space upfront for the data that will be appended
    pub fn space(max_data_len: usize) -> usize {
        32 + // owner
        1 + // ty (CallType enum)
        20 + // to
        16 + // value
        4 + max_data_len // data vec (length prefix + max data)
    }
}
