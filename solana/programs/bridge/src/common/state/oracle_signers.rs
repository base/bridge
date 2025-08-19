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
        let active_len = core::cmp::min(self.signer_count as usize, self.signers.len());
        self.signers[..active_len].iter().any(|s| s == evm_addr)
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

#[derive(Debug, Clone, PartialEq, Eq, InitSpace, AnchorSerialize, AnchorDeserialize)]
pub struct BaseOracleConfig {
    /// Number of required valid unique signatures
    pub oracle_threshold: u8,
    /// Number of signers in `oracle_signer_addrs` array
    pub signer_count: u8,
    /// Static list of authorized signer addresses
    pub oracle_signer_addrs: [[u8; 20]; MAX_SIGNER_COUNT],
}

impl BaseOracleConfig {
    pub fn validate(&self) -> Result<()> {
        require!(
            self.oracle_threshold > 0 && self.oracle_threshold <= self.signer_count,
            OracleSignersError::InvalidThreshold
        );
        require!(
            self.signer_count as usize <= self.oracle_signer_addrs.len(),
            OracleSignersError::TooManySigners
        );

        // Ensure uniqueness among the provided signer_count entries
        {
            let provided_count = self.signer_count as usize;
            let mut addrs: Vec<[u8; 20]> = self.oracle_signer_addrs[..provided_count].to_vec();
            addrs.sort();
            addrs.dedup();
            require!(
                addrs.len() == provided_count,
                OracleSignersError::DuplicateSigner
            );
        }

        Ok(())
    }
}

#[error_code]
pub enum OracleSignersError {
    #[msg("Threshold must be <= number of signers")]
    InvalidThreshold,
    #[msg("Too many signers (max 32)")]
    TooManySigners,
    #[msg("Duplicate signer found")]
    DuplicateSigner,
}
