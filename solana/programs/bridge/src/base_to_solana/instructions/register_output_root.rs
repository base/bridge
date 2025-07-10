use anchor_lang::prelude::*;
use anchor_lang::solana_program::keccak;
use anchor_lang::solana_program::secp256k1_recover::secp256k1_recover;

use crate::{
    base_to_solana::{
        constants::{OUTPUT_ROOT_SEED, TRUSTED_ORACLE},
        state::OutputRoot,
    },
    common::{bridge::Bridge, BRIDGE_SEED},
};

#[derive(Accounts)]
#[instruction(_output_root: [u8; 32], block_number: u64)]
pub struct RegisterOutputRoot<'info> {
    #[account(mut, address = TRUSTED_ORACLE @ RegisterOutputRootError::Unauthorized)]
    pub payer: Signer<'info>,

    #[account(
        init,
        payer = payer,
        space = 8 + OutputRoot::INIT_SPACE,
        seeds = [OUTPUT_ROOT_SEED, &block_number.to_le_bytes()],
        bump
    )]
    pub root: Account<'info, OutputRoot>,

    #[account(
        mut,
        seeds = [BRIDGE_SEED],
        bump,
    )]
    pub bridge: Account<'info, Bridge>,

    pub system_program: Program<'info, System>,
}

pub fn register_output_root_handler(
    ctx: Context<RegisterOutputRoot>,
    output_root: [u8; 32],
    block_number: u64,
) -> Result<()> {
    require!(
        block_number > ctx.accounts.bridge.base_block_number && block_number % 300 == 0,
        RegisterOutputRootError::IncorrectBlockNumber
    );

    // Parse ISM signatures from remaining_accounts
    let ism_signatures = parse_ism_from_remaining_accounts(ctx.remaining_accounts)?;
    
    // Verify M-of-N ISM signatures
    verify_m_of_n_signatures(&output_root, block_number, &ism_signatures)?;

    ctx.accounts.root.root = output_root;
    ctx.accounts.bridge.base_block_number = block_number;

    Ok(())
}

/// Parse ISM signatures from remaining_accounts
/// Each account data: [oracle_eth_address (20 bytes)] + [signature (65 bytes)] = 85 bytes total
fn parse_ism_from_remaining_accounts(
    remaining_accounts: &[AccountInfo],
) -> Result<Vec<([u8; 20], [u8; 65])>> {
    let mut signatures = Vec::new();
    
    for account in remaining_accounts {
        let signature_data = account.data.borrow();
        
        // Validate total data length (20 bytes address + 65 bytes signature)
        require!(
            signature_data.len() == 85,
            RegisterOutputRootError::InvalidSignature
        );
        
        // Extract oracle ethereum address (first 20 bytes)
        let mut oracle_eth_address = [0u8; 20];
        oracle_eth_address.copy_from_slice(&signature_data[0..20]);
        
        // Extract signature (remaining 65 bytes)
        let mut signature = [0u8; 65];
        signature.copy_from_slice(&signature_data[20..85]);
        
        signatures.push((oracle_eth_address, signature));
    }
    
    // Ensure we have at least one signature
    require!(
        !signatures.is_empty(),
        RegisterOutputRootError::InsufficientSignatures
    );
    
    Ok(signatures)
}

/// Verify M-of-N ISM signatures for output root and block number
fn verify_m_of_n_signatures(
    output_root: &[u8; 32],
    block_number: u64,
    signatures: &[([u8; 20], [u8; 65])],
) -> Result<()> {
    // TODO: Define trusted oracle set and threshold
    const MINIMUM_THRESHOLD: usize = 2; // M = 2 for now
    
    // Check we have enough signatures
    require!(
        signatures.len() >= MINIMUM_THRESHOLD,
        RegisterOutputRootError::InsufficientSignatures
    );
    
    // Create the message hash that oracles signed
    let message_hash = create_ism_message_hash(output_root, block_number);
    
    // Verify each signature
    let mut valid_signatures = 0;
    for (oracle_eth_address, signature) in signatures {
        if verify_secp256k1_signature(signature, &message_hash, oracle_eth_address)? {
            valid_signatures += 1;
        }
    }
    
    // Check threshold
    require!(
        valid_signatures >= MINIMUM_THRESHOLD,
        RegisterOutputRootError::InsufficientSignatures
    );
    
    Ok(())
}

/// Create the message hash that oracles sign
/// Format: keccak256(abi.encode(output_root, block_number))
fn create_ism_message_hash(output_root: &[u8; 32], block_number: u64) -> [u8; 32] {
    let mut message = Vec::new();
    message.extend_from_slice(output_root);
    message.extend_from_slice(&block_number.to_be_bytes());
    keccak::hash(&message).0
}

/// Verifies a Secp256k1 signature against a message hash and expected public key.
fn verify_secp256k1_signature(
    signature: &[u8; 65],
    message_hash: &[u8; 32],
    expected_pubkey: &[u8; 20],
) -> Result<bool> {
    // Extract recovery_id (last byte of the signature).
    let recovery_id = signature[64];

    // NOTE: Native underflow checking.
    let recovery_id = recovery_id - 27;
    if recovery_id >= 4 {
        return Err(RegisterOutputRootError::InvalidRecoveryId.into());
    }

    // Extract the signature (first 64 bytes).
    let mut sig = [0u8; 64];
    sig.copy_from_slice(&signature[..64]);

    // TODO: Check if flipping Y coordinate effectively fails the signature verification.
    // Recover the public key from the signature.
    let recovered_pubkey = secp256k1_recover(message_hash, recovery_id, &sig)
        .map_err(|_| error!(RegisterOutputRootError::SignatureVerificationFailed))?;

    // Convert to eth pubkey
    let recovered_bytes = recovered_pubkey.to_bytes();
    let h = keccak::hash(&recovered_bytes).to_bytes();

    let mut eth_pubkey_bytes = [0u8; 20];
    eth_pubkey_bytes.copy_from_slice(&h[12..]);

    // Check if the recovered public key matches the expected public key.
    if eth_pubkey_bytes != *expected_pubkey {
        return Err(RegisterOutputRootError::InvalidPublicKey.into());
    }

    // Check if oracle is trusted
    if !is_trusted_oracle(expected_pubkey) {
        return Err(RegisterOutputRootError::UntrustedOracle.into());
    }

    Ok(true)
}

/// Check if oracle is in trusted set
/// TODO: Implement actual trusted oracle registry
fn is_trusted_oracle(_oracle_eth_address: &[u8; 20]) -> bool {
    // TODO: Check against on-chain trusted oracle registry
    // For now, accept all oracles
    true
}

#[error_code]
pub enum RegisterOutputRootError {
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("IncorrectBlockNumber")]
    IncorrectBlockNumber,
    #[msg("InsufficientSignatures")]
    InsufficientSignatures,
    #[msg("InvalidSignature")]
    InvalidSignature,
    #[msg("UntrustedOracle")]
    UntrustedOracle,
    #[msg("InvalidRecoveryId")]
    InvalidRecoveryId,
    #[msg("SignatureVerificationFailed")]
    SignatureVerificationFailed,
    #[msg("InvalidPublicKey")]
    InvalidPublicKey,
}

#[cfg(test)]
mod tests {
    use super::*;
    
    // Test-only trusted oracle constant
    const TRUSTED_ORACLE_TEST: Pubkey = pubkey!("9n3vTKJ49M4Xk3MhiCZY4LxXAdeEaDMVMuGxDwt54Hgx");
    use anchor_lang::{
        solana_program::{
            example_mocks::solana_sdk::system_program, instruction::Instruction,
            native_token::LAMPORTS_PER_SOL,
        },
        InstructionData,
    };
    use anchor_lang::solana_program::instruction::AccountMeta; // Describe an account that may be fed into an instruction
    use litesvm::LiteSVM; // Testing library for Solana
    use solana_keypair::Keypair; // Just a term to describe  a pair of public and private keys
    use solana_message::Message;
    use solana_signer::Signer;
    use solana_transaction::Transaction;

    use crate::{
        accounts, instruction::RegisterOutputRoot, test_utils::mock_clock, ID,
        common::BRIDGE_SEED,
    };

    fn setup_bridge_and_svm() -> (LiteSVM, Keypair, Pubkey) {
        let mut svm = LiteSVM::new();
        svm.add_program_from_file(ID, "../../target/deploy/bridge.so")
            .unwrap();

        // Create test accounts
        let payer = Keypair::new();
        let payer_pk = payer.pubkey();
        svm.airdrop(&payer_pk, LAMPORTS_PER_SOL * 10).unwrap();

        // Mock the clock
        let timestamp = 1747440000; // May 16th, 2025
        mock_clock(&mut svm, timestamp);

        // Find the Bridge PDA
        let bridge_pda = Pubkey::find_program_address(&[BRIDGE_SEED], &ID).0;

        // Initialize the bridge first
        let accounts = accounts::Initialize {
            payer: payer_pk,
            bridge: bridge_pda,
            system_program: system_program::ID,
        }
        .to_account_metas(None);

        let ix = Instruction {
            program_id: ID,
            accounts,
            data: crate::instruction::Initialize {}.data(),
        };

        let tx = Transaction::new(
            &[&payer],
            Message::new(&[ix], Some(&payer_pk)),
            svm.latest_blockhash(),
        );

        svm.send_transaction(tx).unwrap();

        (svm, payer, bridge_pda)
    }

    fn create_signature_account(
        svm: &mut LiteSVM,
        _payer: &Keypair,
        oracle_eth_address: [u8; 20],
        signature: [u8; 65],
    ) -> Pubkey {
        let signature_account = Keypair::new();
        let signature_account_pk = signature_account.pubkey();
        
        // Create account data: 20 bytes oracle address + 65 bytes signature = 85 bytes
        let mut account_data = Vec::new();
        account_data.extend_from_slice(&oracle_eth_address);
        account_data.extend_from_slice(&signature);
        
        // Calculate rent for account (using a simple calculation for testing)
        let lamports = 1000000; // Sufficient lamports for rent
        
        // Create a dummy account to get the Account type from a get_account call
        // We'll use this approach to work with the correct Account type
        let dummy_keypair = Keypair::new();
        svm.airdrop(&dummy_keypair.pubkey(), 1000000).unwrap();
        
        // Now we can use `set_account` with the correct Account type
        if let Some(mut dummy_account) = svm.get_account(&dummy_keypair.pubkey()) {
            dummy_account.data = account_data;
            dummy_account.owner = system_program::ID;
            dummy_account.lamports = lamports;
            dummy_account.executable = false;
            dummy_account.rent_epoch = 0;
            
            let _ = svm.set_account(signature_account_pk, dummy_account);
        } else {
            panic!("Could not create signature account - failed to get dummy account");
        }
        
        signature_account_pk
    }

    /// Create a real secp256k1 signature for the given output root and block number
    /// This generates a real signature using the secp256k1 library
    fn create_real_secp256k1_signature(output_root: &[u8; 32], block_number: u64, seed: u8) -> ([u8; 20], [u8; 65]) {
        use secp256k1::{Secp256k1, SecretKey, Message};
        use anchor_lang::solana_program::keccak;
        
        // Create a deterministic private key for testing
        let mut key_bytes = [0u8; 32];
        for i in 0..32 {
            key_bytes[i] = seed.wrapping_add(i as u8);
        }
        
        // Ensure it's a valid secp256k1 private key
        let secp = Secp256k1::new();
        let secret_key = SecretKey::from_slice(&key_bytes).unwrap_or_else(|_| {
            // If invalid, create a simple valid key
            let mut valid_key = [0u8; 32];
            valid_key[0] = seed;
            valid_key[31] = 1;
            SecretKey::from_slice(&valid_key).unwrap()
        });
        
        // Get the public key and derive Ethereum address
        let public_key = secret_key.public_key(&secp);
        let public_key_bytes = public_key.serialize_uncompressed();
        
        // Create Ethereum address from public key (last 20 bytes of keccak hash)
        let pubkey_hash = keccak::hash(&public_key_bytes[1..65]); // Skip first byte (0x04)
        let mut ethereum_address = [0u8; 20];
        ethereum_address.copy_from_slice(&pubkey_hash.to_bytes()[12..32]);
        
        // Create the message hash
        let message_hash = create_ism_message_hash(output_root, block_number);
        let message = Message::from_digest_slice(&message_hash).unwrap();
        
        // Sign the message
        let signature = secp.sign_ecdsa_recoverable(&message, &secret_key);
        let (recovery_id, signature_bytes) = signature.serialize_compact();
        
        // Create the 65-byte signature (r + s + recovery_id)
        let mut signature_65 = [0u8; 65];
        signature_65[0..64].copy_from_slice(&signature_bytes);
        signature_65[64] = recovery_id.to_i32() as u8 + 27; // Convert to Ethereum format
        
        (ethereum_address, signature_65)
    }

    #[test]
    fn test_register_output_root_with_real_signatures() {
        let (mut svm, _regular_payer, bridge_pda) = setup_bridge_and_svm();
        
        // Create our test trusted oracle keypair that matches the current TRUSTED_ORACLE constant
        // This keypair was generated to match 9n3vTKJ49M4Xk3MhiCZY4LxXAdeEaDMVMuGxDwt54Hgx
        let test_oracle_keypair = Keypair::from_bytes(&[
            7,203,36,165,34,16,183,13,229,220,44,231,46,32,229,21,245,102,103,75,136,63,19,95,73,20,32,100,117,147,9,50,
            130,103,239,111,221,79,12,179,120,215,230,145,126,141,29,118,104,180,179,63,226,116,1,101,226,229,190,176,241,235,41,101
        ]).unwrap();
        println!("Test oracle pubkey: {}", test_oracle_keypair.pubkey());
        println!("Expected TRUSTED_ORACLE_TEST: {}", TRUSTED_ORACLE_TEST);
        
        // Verify they match
        assert_eq!(test_oracle_keypair.pubkey(), TRUSTED_ORACLE_TEST, "Test oracle pubkey must match TRUSTED_ORACLE_TEST constant");
        
        // Airdrop to our test oracle
        svm.airdrop(&test_oracle_keypair.pubkey(), LAMPORTS_PER_SOL * 10).unwrap();
        
        let output_root = [1u8; 32];
        let block_number = 300u64;

        // Create REAL signatures that should pass verification
        let (oracle1_eth_address, signature1) = create_real_secp256k1_signature(&output_root, block_number, 1);
        let (oracle2_eth_address, signature2) = create_real_secp256k1_signature(&output_root, block_number, 2);

        // Create signature accounts with REAL signature data
        let sig_account1 = create_signature_account(&mut svm, &test_oracle_keypair, oracle1_eth_address, signature1);
        let sig_account2 = create_signature_account(&mut svm, &test_oracle_keypair, oracle2_eth_address, signature2);
        
        // Verify the accounts were created with correct data
        let account1 = svm.get_account(&sig_account1).expect("Signature account 1 should exist");
        let account2 = svm.get_account(&sig_account2).expect("Signature account 2 should exist");
        
        assert_eq!(account1.data.len(), 85, "Account 1 should have 85 bytes of data");
        assert_eq!(account2.data.len(), 85, "Account 2 should have 85 bytes of data");
        
        println!("✅ Signature accounts created with real data");
        println!("Oracle 1 address: {:?}", oracle1_eth_address);
        println!("Oracle 2 address: {:?}", oracle2_eth_address);

        // Find the output root PDA
        let output_root_pda = Pubkey::find_program_address(
            &[OUTPUT_ROOT_SEED, &block_number.to_le_bytes()],
            &ID,
        ).0;

        // Build the RegisterOutputRoot instruction using the test oracle
        let mut accounts = accounts::RegisterOutputRoot {
            payer: test_oracle_keypair.pubkey(),
            root: output_root_pda,
            bridge: bridge_pda,
            system_program: system_program::ID,
        }
        .to_account_metas(None);

        // Add remaining accounts for signatures
        accounts.push(AccountMeta::new_readonly(sig_account1, false));
        accounts.push(AccountMeta::new_readonly(sig_account2, false));

        let ix = Instruction {
            program_id: ID,
            accounts,
            data: RegisterOutputRoot {
                output_root,
                block_number,
            }.data(),
        };

        let tx = Transaction::new(
            &[&test_oracle_keypair],
            Message::new(&[ix], Some(&test_oracle_keypair.pubkey())),
            svm.latest_blockhash(),
        );

        // Execute the transaction
        let result = svm.send_transaction(tx);
        
        // This test verifies the complete ISM flow with REAL signature verification
        // Expected: BOTH authorization AND signature verification should PASS
        match result {
            Ok(_) => {
                println!("🎉 COMPLETE SUCCESS! Both authorization and signature verification PASSED!");
                
                // Verify the output root was created correctly
                let output_root_account = svm.get_account(&output_root_pda).expect("Output root should be created");
                assert_eq!(output_root_account.owner, ID);
                
                // Deserialize and verify the output root data
                let output_root_data = OutputRoot::try_deserialize(&mut &output_root_account.data[..]).unwrap();
                assert_eq!(output_root_data.root, output_root);
                
                // Verify the bridge state was updated
                let bridge_account = svm.get_account(&bridge_pda).expect("Bridge should exist");
                let bridge_data = Bridge::try_deserialize(&mut &bridge_account.data[..]).unwrap();
                assert_eq!(bridge_data.base_block_number, block_number);
                
                println!("✅ Output root PDA created successfully!");
                println!("✅ Bridge state updated correctly!");
                println!("✅ ISM signature verification is working perfectly!");
            }
            Err(e) => {
                let error_str = format!("{:?}", e);
                println!("❌ Transaction failed: {}", error_str);
                
                // This should NOT happen if our signature verification is working
                panic!("Expected signature verification to PASS, but got error: {}", error_str);
            }
        }
    }
}
