use anchor_lang::prelude::*;

#[account]
#[derive(Debug)]
pub struct PartnerConfig {
    pub signer_count: u8,
    pub signers: [[u8; 20]; 16],
}

#[derive(Default)]
struct PartnerSet {
    signers: std::collections::BTreeSet<[u8; 20]>,
}

impl PartnerConfig {
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
