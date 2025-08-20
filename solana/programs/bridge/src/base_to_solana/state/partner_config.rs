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
/// - Up to `MAX_SIGNER_COUNT` signers are supported to keep the account small and rent-cheap.
use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct PartnerConfig {
    // Static list of partner signers, max_len 20 to facilitate max of 4 concurrent validator rotations
    // at regular operating capacity of 16 validators, while capping heap usage to 800b
    #[max_len(20)]
    pub signers: Vec<PartnerSigner>,
}

#[derive(Debug, Clone, AnchorSerialize, AnchorDeserialize, InitSpace)]
pub struct PartnerSigner {
    // Regular active EVM address of the signer
    pub evm_address: [u8; 20],
    // New candidate address that each signer will sign with in a blue/green key rotation setting
    // When this value is not empty, the signer will start exclusively signing with this key offchain
    // However, from an onchain perspective, signature could arrive with either the old or new address for a while
    //
    // Since Base enforces that nonce ranges never skip, when a signature with the new address arrives,
    // it should be safe to assume that because it's the latest nonce range, all previous nonce ranges that could've been
    // signed with the old address must have already been consumed, at that point it'd be safe for partner Owner to
    // move the new_address to address field
    pub new_evm_address: Option<[u8; 20]>,
}

impl PartnerConfig {
    /// Count how many of the provided EVM addresses are authorized partner signers.
    ///
    /// - `signers` should contain unique 20-byte addresses. The caller (e.g.
    ///   signature recovery) is expected to deduplicate beforehand to avoid
    ///   double counting.
    /// - Returns the number of addresses present in this config's allowlist.
    pub fn count_approvals(&self, signers: &[[u8; 20]]) -> u32 {
        let mut count: u32 = 0;
        // Track which indices of self.signers have already been matched so that
        // the same configured signer is not counted more than once (e.g. if
        // both its old and new addresses appear in `signers`).
        let mut matched_indices = vec![false; self.signers.len()];

        'outer: for provided in signers.iter() {
            for (idx, configured) in self.signers.iter().enumerate() {
                if matched_indices[idx] {
                    continue;
                }

                let is_match_old = configured.evm_address == *provided;
                let is_match_new = configured
                    .new_evm_address
                    .as_ref()
                    .is_some_and(|new_addr| new_addr == provided);

                if is_match_old || is_match_new {
                    matched_indices[idx] = true;
                    count += 1;
                    // Move to next provided signer. This ensures a single
                    // configured signer index cannot be matched more than once.
                    continue 'outer;
                }
            }
        }

        count
    }
}

#[cfg(test)]
mod tests {

    use super::*;

    fn addr(byte: u8) -> [u8; 20] {
        [byte; 20]
    }

    fn signer(old: u8, new: Option<u8>) -> PartnerSigner {
        PartnerSigner {
            evm_address: addr(old),
            new_evm_address: new.map(addr),
        }
    }

    #[test]
    fn returns_zero_when_no_configured_signers() {
        let cfg = PartnerConfig { signers: vec![] };
        let provided = [addr(1), addr(2)];
        assert_eq!(cfg.count_approvals(&provided), 0);
    }

    #[test]
    fn returns_zero_when_no_provided_addresses() {
        let cfg = PartnerConfig {
            signers: vec![signer(1, None)],
        };
        let provided: [[u8; 20]; 0] = [];
        assert_eq!(cfg.count_approvals(&provided), 0);
    }

    #[test]
    fn matches_old_address_counts_one() {
        let cfg = PartnerConfig {
            signers: vec![signer(1, None)],
        };
        let provided = [addr(1)];
        assert_eq!(cfg.count_approvals(&provided), 1);
    }

    #[test]
    fn matches_new_address_counts_one() {
        let cfg = PartnerConfig {
            signers: vec![signer(1, Some(2))],
        };
        let provided = [addr(2)];
        assert_eq!(cfg.count_approvals(&provided), 1);
    }

    #[test]
    fn old_and_new_for_same_signer_counts_once() {
        let cfg = PartnerConfig {
            signers: vec![signer(1, Some(2))],
        };
        let provided = [addr(1), addr(2)];
        assert_eq!(cfg.count_approvals(&provided), 1);
    }

    #[test]
    fn multiple_distinct_matches_count_correctly() {
        let cfg = PartnerConfig {
            signers: vec![signer(1, None), signer(2, None), signer(3, Some(4))],
        };
        let provided = [addr(1), addr(4)];
        assert_eq!(cfg.count_approvals(&provided), 2);
    }

    #[test]
    fn non_matching_addresses_count_zero() {
        let cfg = PartnerConfig {
            signers: vec![signer(1, None)],
        };
        let provided = [addr(9)];
        assert_eq!(cfg.count_approvals(&provided), 0);
    }

    #[test]
    fn duplicate_provided_addresses_do_not_increase_count() {
        let cfg = PartnerConfig {
            signers: vec![signer(1, None)],
        };
        let provided = [addr(1), addr(1)];
        assert_eq!(cfg.count_approvals(&provided), 1);
    }
}
