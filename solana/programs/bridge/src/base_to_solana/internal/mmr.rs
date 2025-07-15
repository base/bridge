use anchor_lang::{prelude::*, solana_program::keccak};

#[derive(Debug, Clone, AnchorSerialize, AnchorDeserialize)]
pub struct Proof {
    pub proof: Vec<[u8; 32]>,
    pub leaf_index: u64,
    pub total_leaf_count: u64,
}

/// Verifies an MMR proof.
///
/// The proof consists of sibling hashes along the path from the leaf to its
/// mountain's peak, followed by the hashes of all other mountain peaks (left-to-right).
///
/// # Arguments
/// * `proof` - The proof elements.
/// * `root` - The expected MMR root.
/// * `leaf_hash` - The hash of the leaf being verified.
/// * `leaf_index` - The 0-indexed position of the leaf in the MMR.
/// * `total_leaf_count` - The total number of leaves in the MMR when the proof was generated.
///
/// # Returns
/// `true` if the proof is valid, `false` otherwise.
pub fn verify_proof(expected_root: &[u8; 32], leaf_hash: &[u8; 32], proof: &Proof) -> Result<()> {
    let Proof {
        proof,
        leaf_index,
        total_leaf_count,
    } = proof;

    if *total_leaf_count == 0 {
        require!(proof.is_empty(), MmrError::MmrShouldBeEmpty);
        require!(*expected_root == [0u8; 32], MmrError::InvalidProof);
        require!(*leaf_hash == [0u8; 32], MmrError::InvalidProof);
        return Ok(());
    }

    require!(leaf_index < total_leaf_count, MmrError::InvalidProof);

    let calculated_root =
        calculate_root_from_proof(proof, leaf_hash, *leaf_index, *total_leaf_count)?;

    require!(calculated_root == *expected_root, MmrError::InvalidProof);

    Ok(())
}

/// Calculates the MMR root given a leaf, its proof, and the MMR structure.
///
/// This function reconstructs the peaks of the MMR based on the provided leaf and its proof,
/// then bags these peaks together to form the final MMR root.
fn calculate_root_from_proof(
    proof: &[[u8; 32]],
    leaf_hash: &[u8; 32],
    leaf_idx: u64, // 0-indexed leaf position
    total_leaf_count: u64,
) -> Result<[u8; 32]> {
    require!(total_leaf_count > 0, MmrError::EmptyMmr);

    // 1. Determine the mountain structure and the leaf's mountain details.
    let mut mountains: Vec<(u32, u64, bool)> = Vec::new(); // (height, num_leaves_in_mountain, is_leafs_mountain)
    let mut temp_leaf_count = total_leaf_count;
    let mut current_leaf_offset: u64 = 0; // Tracks leaves before the current mountain being considered
    let mut leaf_s_mountain_details: Option<(u32, u64)> = None; // (height, leaf_idx_in_mountain)

    let max_h = if total_leaf_count > 0 {
        64 - total_leaf_count.leading_zeros() - 1
    } else {
        0
    };

    for h_idx in 0..=max_h {
        let h = max_h - h_idx; // Iterate from largest height downwards
        if (temp_leaf_count >> h) & 1 == 1 {
            let leaves_in_this_mountain = 1u64 << h;
            let is_leafs_m = leaf_idx >= current_leaf_offset
                && leaf_idx < current_leaf_offset + leaves_in_this_mountain;
            mountains.push((h, leaves_in_this_mountain, is_leafs_m));
            if is_leafs_m {
                leaf_s_mountain_details = Some((h, leaf_idx - current_leaf_offset));
            }

            current_leaf_offset += leaves_in_this_mountain;
            temp_leaf_count -= leaves_in_this_mountain;
        }

        if temp_leaf_count == 0 {
            break;
        }
    }

    let (leaf_mountain_height, _leaf_idx_in_mountain) =
        leaf_s_mountain_details.ok_or(error!(MmrError::LeafMountainNotFound))?;

    // 2. Calculate the peak of the leaf's mountain.
    let mut current_computed_hash = *leaf_hash;
    let mut proof_idx_offset = 0; // Tracks how many proof elements we've used for intra-mountain

    require!(
        leaf_mountain_height as usize <= proof.len() || leaf_mountain_height == 0,
        MmrError::InsufficientProofElementsForIntraMountainPath
    );

    for _h_climb in 0..leaf_mountain_height {
        let sibling_hash = proof[proof_idx_offset];
        proof_idx_offset += 1;
        current_computed_hash = commutative_keccak256(current_computed_hash, sibling_hash);
    }
    let leaf_mountain_peak_hash = current_computed_hash;

    // 3. Collect all peak hashes (leaf's calculated peak + other peaks from proof).
    let mut all_peak_hashes: Vec<[u8; 32]> = Vec::new();
    let mut remaining_proof_idx = proof_idx_offset;

    // Peaks are needed in left-to-right order for bagging.
    // The `mountains` vector is already in left-to-right order.
    for (_height, _num_leaves, is_leafs_m) in mountains.iter() {
        if *is_leafs_m {
            all_peak_hashes.push(leaf_mountain_peak_hash);
        } else {
            require!(
                remaining_proof_idx < proof.len(),
                MmrError::InsufficientProofElementsForOtherMountainPeaks
            );

            all_peak_hashes.push(proof[remaining_proof_idx]);
            remaining_proof_idx += 1;
        }
    }

    require!(
        remaining_proof_idx == proof.len(),
        MmrError::UnusedProofElementsRemaining
    );

    // 4. Bag the peaks (left-to-right).
    // `all_peak_hashes` is already in left-to-right mountain order.
    if all_peak_hashes.is_empty() {
        // Should be caught by total_leaf_count == 0 earlier, but as a safeguard.
        require!(total_leaf_count == 0, MmrError::NoPeaksFoundForNonEmptyMmr);

        // If total_leaf_count is 0, what should an empty root be? Let's assume [0u8;32]
        return Ok([0u8; 32]);
    }

    let mut current_root = all_peak_hashes[0]; // Start with the leftmost peak.
    for peak_hash in all_peak_hashes.iter().skip(1) {
        // next_peak_hash is to the right of current_root.
        // Hashing order for bagging: H(LeftPeak, H(MiddlePeak, RightPeak))
        // So, current_root is the left operand, all_peak_hashes[i] is the right.
        current_root = commutative_keccak256(current_root, *peak_hash);
    }

    Ok(current_root)
}

// Commutative Keccak256 hash of a sorted pair of bytes32. Frequently used when working with merkle proofs.
// NOTE: Equivalent to the `standardNodeHash` in our https://github.com/OpenZeppelin/merkle-tree[JavaScript library].
fn commutative_keccak256(a: [u8; 32], b: [u8; 32]) -> [u8; 32] {
    if a < b {
        efficient_keccak256(&a, &b)
    } else {
        efficient_keccak256(&b, &a)
    }
}

fn efficient_keccak256(a: &[u8; 32], b: &[u8; 32]) -> [u8; 32] {
    let mut data_to_hash = Vec::new();
    data_to_hash.extend_from_slice(a);
    data_to_hash.extend_from_slice(b);
    keccak::hash(&data_to_hash).to_bytes()
}

#[error_code]
pub enum MmrError {
    #[msg("Invalid proof")]
    InvalidProof,
    #[msg("MMR should be empty")]
    MmrShouldBeEmpty,
    #[msg("MMR is empty")]
    EmptyMmr,
    #[msg("Leaf's mountain not found")]
    LeafMountainNotFound,
    #[msg("Insufficient proof elements for intra-mountain path")]
    InsufficientProofElementsForIntraMountainPath,
    #[msg("Insufficient proof elements for other mountain peaks")]
    InsufficientProofElementsForOtherMountainPeaks,
    #[msg("Unused proof elements remaining")]
    UnusedProofElementsRemaining,
    #[msg("No peaks found for non-empty MMR")]
    NoPeaksFoundForNonEmptyMmr,
}
