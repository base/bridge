/// Partner signer configuration used to authorize actions on the Base→Solana bridge.
///
/// This account is owned and written by the external "partner" program and is
/// referenced by this bridge program when verifying that a partner has approved
/// a given operation (e.g. registering an output root). The account stores a
/// small, fixed-capacity set of EVM addresses that are allowed to sign. During
/// runtime, a separate configuration on the main `Bridge` account specifies the
/// partner approval threshold that must be met.
///
/// How it is used:
/// - The `register_output_root` instruction recovers unique EVM signer
///   addresses from provided Secp256k1 signatures, then calls
///   `PartnerConfig::count_approvals` to count how many of those addresses
///   appear in this allowlist.
/// - The resulting count is compared against
///   `bridge.partner_oracle_config.required_threshold` to enforce that enough
///   partner signers have approved the action.
///
/// Notes:
/// - EVM addresses are stored as raw 20-byte values `[u8; 20]`.
/// - Only the first `signer_count` entries in `signers` are considered valid.
/// - Up to 16 signers are supported to keep the account small and rent-cheap.
use anchor_lang::prelude::*;

#[account]
#[derive(Debug)]
pub struct PartnerConfig {
    /// Number of valid entries at the start of `signers` to consider.
    pub signer_count: u8,
    /// Fixed-capacity array of authorized EVM addresses (20-byte) for partner approvals.
    /// Only the first `signer_count` elements should be treated as initialized.
    pub signers: [[u8; 20]; 16],
}

#[derive(Default)]
/// Internal helper that materializes the configured signer set in a structure
/// with fast membership checks.
struct PartnerSet {
    signers: std::collections::BTreeSet<[u8; 20]>,
}

impl PartnerConfig {
    /// Count how many of the provided EVM addresses are authorized partner signers.
    ///
    /// - `signers` should contain unique 20-byte addresses. The caller (e.g.
    ///   signature recovery) is expected to deduplicate beforehand to avoid
    ///   double counting.
    /// - Returns the number of addresses present in this config's allowlist.
    pub fn count_approvals(&self, signers: &[[u8; 20]]) -> u32 {
        let mut partner_set = PartnerSet::default();
        let n = self.signer_count as usize;
        let max = core::cmp::min(n, 16);
        for i in 0..max {
            partner_set.signers.insert(self.signers[i]);
        }
        partner_set.count_approvals(signers)
    }
}

impl PartnerSet {
    /// Returns how many of the provided addresses exist in the configured set.
    ///
    /// Caller should pass a deduplicated list; duplicates would be counted more
    /// than once by this function.
    pub fn count_approvals(&self, signers: &[[u8; 20]]) -> u32 {
        let mut count: u32 = 0;
        for signer in signers.iter() {
            if self.signers.contains(signer) {
                count += 1;
            }
        }
        count
    }
}
