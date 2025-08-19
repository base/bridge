use anchor_lang::prelude::*;

use crate::common::MAX_SIGNER_COUNT;

/// Stores the EVM addresses authorized to sign Base output roots and the
/// minimum threshold required. Addresses are 20-byte Ethereum addresses
#[account]
#[derive(InitSpace)]
pub struct OracleSigners {
    /// Number of required valid unique signatures
    pub threshold: u8,
    /// Number of signers in `oracle_signer_addrs` array
    pub signer_count: u8,
    /// Static list of authorized signer addresses
    pub signers: [[u8; 20]; MAX_SIGNER_COUNT],
}

impl OracleSigners {
    pub fn contains(&self, evm_addr: &[u8; 20]) -> bool {
        self.signers.iter().any(|s| s == evm_addr)
    }

    pub fn count_approvals(&self, signers: &[[u8; 20]]) -> u32 {
        let mut count: u32 = 0;
        for signer in signers.iter() {
            if self.contains(signer) {
                count += 1;
            }
        }
        count
    }
}
