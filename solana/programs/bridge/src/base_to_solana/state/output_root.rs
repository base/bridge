use anchor_lang::prelude::*;

/// Represents a cryptographic commitment to the set of Base L2 bridge messages
/// at a specific Base block number.
///
/// Output roots are registered on Solana by a trusted oracle and serve as
/// checkpoints that allow messages from Base to be proven and relayed to
/// Solana. Each output root contains an MMR root that commits to all bridge
/// messages as of a particular Base block number.
///
/// This account is used in the Base → Solana message passing flow, where:
/// 1. A trusted oracle registers output roots for specific Base blocks
/// 2. Users prove their messages were included on Base using these roots and an MMR proof
/// 3. Proven messages are then relayed and executed on Solana
#[account]
#[derive(InitSpace)]
pub struct OutputRoot {
    /// The 32-byte MMR root that commits to all outgoing bridge messages on Base
    /// as of the specified Base block number.
    pub root: [u8; 32],

    /// The total number of leaves that were present in the MMR when this root
    /// was generated. This is crucial for determining the MMR structure and
    /// mountain configuration at the time of proof validation.
    pub total_leaf_count: u64,
}
