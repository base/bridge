use crate::BridgeError;
use anchor_lang::{
    prelude::*,
    solana_program::{keccak, secp256k1_recover::secp256k1_recover},
};

/// message = keccak256("\x19Ethereum Signed Message:\n" || len || (output_root || base_block_number_be || total_leaf_count_be))
pub fn compute_output_root_message_hash(
    output_root: &[u8; 32],
    base_block_number: u64,
    total_leaf_count: u64,
) -> [u8; 32] {
    // Construct the original message bytes
    let mut message_bytes = Vec::with_capacity(32 + 8 + 8);
    message_bytes.extend_from_slice(output_root);
    message_bytes.extend_from_slice(&base_block_number.to_be_bytes());
    message_bytes.extend_from_slice(&total_leaf_count.to_be_bytes());

    // Apply the Ethereum signed message prefix per EIP-191
    // "\x19Ethereum Signed Message:\n" + len(message) + message
    let prefix: &[u8] = b"\x19Ethereum Signed Message:\n";
    let len_dec_string = message_bytes.len().to_string();

    let mut prefixed =
        Vec::with_capacity(prefix.len() + len_dec_string.len() + message_bytes.len());
    prefixed.extend_from_slice(prefix);
    prefixed.extend_from_slice(len_dec_string.as_bytes());
    prefixed.extend_from_slice(&message_bytes);

    keccak::hash(&prefixed).0
}

/// Recover unique 20-byte EVM addresses from signatures over the given message hash
pub fn recover_unique_evm_addresses(
    signatures: &[[u8; 65]],
    message_hash: &[u8; 32],
) -> Result<Vec<[u8; 20]>> {
    let mut unique_signers: Vec<[u8; 20]> = Vec::new();
    for sig in signatures.iter() {
        let recovered = recover_eth_address(sig, message_hash)?;
        if !unique_signers.iter().any(|s| s == &recovered) {
            unique_signers.push(recovered);
        }
    }
    Ok(unique_signers)
}

/// Recovers the Ethereum address from a 65-byte Secp256k1 signature over the given message hash.
/// Returns the 20-byte EVM address (keccak(pubkey)[12..32]).
pub fn recover_eth_address(signature: &[u8; 65], message_hash: &[u8; 32]) -> Result<[u8; 20]> {
    let recovery_id = signature[64];
    let recovery_id = recovery_id - 27;
    if recovery_id >= 2 {
        return err!(BridgeError::InvalidRecoveryId);
    }

    let mut sig = [0u8; 64];
    sig.copy_from_slice(&signature[..64]);

    let recovered_pubkey = secp256k1_recover(message_hash, recovery_id, &sig)
        .map_err(|_| error!(BridgeError::SignatureVerificationFailed))?;

    let recovered_bytes = recovered_pubkey.to_bytes();
    let h = keccak::hash(&recovered_bytes).to_bytes();

    let mut eth_pubkey_bytes = [0u8; 20];
    eth_pubkey_bytes.copy_from_slice(&h[12..]);
    Ok(eth_pubkey_bytes)
}
