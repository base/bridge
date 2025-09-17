use anchor_lang::prelude::*;

/// A buffer account to stage large Base → Solana prove inputs over multiple transactions.
/// Stores the serialized `Message` bytes (`data`) and the MMR `proof` nodes.
#[account]
#[derive(Debug)]
pub struct ProveBuffer {
    /// The owner who can modify and eventually consume this buffer
    pub owner: Pubkey,

    /// Serialized `Message` data (Anchor-serialized)
    pub data: Vec<u8>,

    /// MMR proof nodes used to validate inclusion against an OutputRoot
    pub proof: Vec<[u8; 32]>,
}

impl ProveBuffer {
    /// Calculate serialized space needed for a `ProveBuffer` (not including the 8-byte discriminator)
    pub fn space(max_data_len: usize, max_proof_len: usize) -> usize {
        32 + // owner
        4 + max_data_len + // data vec
        4 + (max_proof_len * 32) // proof vec
    }
}
