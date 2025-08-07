use anchor_lang::prelude::*;

/// Represents a cryptographic commitment to the state of the Base L2 chain at a specific block.
///
/// OutputRoots are submitted by proposers and serve as checkpoints that allow messages
/// and state from Base to be proven and relayed to Solana. Each OutputRoot contains
/// an MMR root that commits to the state of all messages on Base at
/// a particular block height.
///
/// This struct is used in the Base → Solana message passing flow, where:
/// 1. Proposers submit OutputRoots for Base blocks
/// 2. Users can prove their messages were included in Base using these roots
/// 3. Messages are then relayed and executed on Solana
#[account]
#[derive(InitSpace)]
pub struct OutputRoot {
    /// The 32-byte MMR root that commits to the complete state of the Bridge contract on Base
    /// at a specific block height.
    pub root: [u8; 32],

    /// The total number of leaves that were present in the MMR when this root
    /// was generated. This is crucial for determining the MMR structure and
    /// mountain configuration at the time of proof validation.
    pub total_leaf_count: u64,
}
